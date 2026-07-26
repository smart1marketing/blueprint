/**
 * Render Web Service entrypoint.
 *
 * Deliberately thin. Rendering a full package takes seconds and hits Cloudinary
 * and (later) OpenAI, which is exactly what Render tells you not to do inside a
 * request handler. The HTTP layer accepts a job, validates it synchronously so
 * the caller gets a real error immediately, and returns 202. A worker does the
 * slow part.
 *
 * Node's built-in http is used rather than Express because this only needs four
 * routes. Swap it out when the form and proof screens land.
 */

import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Campaign } from './types';
import { validateCampaign } from './validate';
import { enqueue, getJob, listJobs, startWorkerLoop } from './jobs';

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = process.env.OUTPUT_DIR ?? path.join(ROOT, 'out');
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT ?? 3000);

/**
 * Sites allowed to iframe the embed. Browsers block framing unless the framed
 * page permits it, so the Simvoly domain must be listed here or the embed
 * renders as a blank box with a console error and no other clue.
 */
const FRAME_ANCESTORS = (process.env.ALLOWED_FRAME_ANCESTORS ?? "'self'")
  .split(/[\s,]+/)
  .filter(Boolean)
  .join(' ');

/** Origins allowed to POST to the API. The embed fetches same-origin, but a
 *  customer pasting the form markup directly into their page would not. */
const CORS_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(/[\s,]+/)
  .filter(Boolean);

function corsHeaders(origin?: string): Record<string, string> {
  if (!origin || !CORS_ORIGINS.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
  };
}

/** Render sets PORT and expects the process to bind 0.0.0.0. */
const HOST = '0.0.0.0';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function json(
  res: http.ServerResponse,
  code: number,
  body: unknown,
  extra: Record<string, string> = {},
): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    ...extra,
  });
  res.end(payload);
}

async function readBody(req: http.IncomingMessage, limit = 2_000_000): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Request body too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Serve report and creative files without escaping the output directory. */
function serveStatic(res: http.ServerResponse, urlPath: string): boolean {
  const rel = decodeURIComponent(urlPath.replace(/^\/files\/?/, ''));
  const target = path.resolve(OUT, rel);
  if (!target.startsWith(path.resolve(OUT))) {
    json(res, 403, { error: 'Path outside the output directory' });
    return true;
  }
  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) return false;
  res.writeHead(200, { 'content-type': MIME[path.extname(target)] ?? 'application/octet-stream' });
  fs.createReadStream(target).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const route = `${req.method} ${url.pathname}`;

  try {
    // Render's health check. Must stay cheap and dependency-free — if this
    // touches Cloudinary, an outage there takes the whole service down.
    if (route === 'GET /healthz' || route === 'GET /') {
      return json(res, 200, {
        status: 'ok',
        service: 'smart1-ad-builder',
        uptime: Math.round(process.uptime()),
        queued: listJobs().filter((j) => j.status === 'queued').length,
      });
    }

    // The embeddable intake form. Framed by the customer's marketing site, so
    // it sets frame-ancestors rather than relying on the default.
    if (route === 'GET /embed' || route === 'GET /embed.html') {
      const file = path.join(PUBLIC, 'embed.html');
      if (!fs.existsSync(file)) return json(res, 404, { error: 'Embed page not built' });
      const html = fs.readFileSync(file, 'utf8');
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': `frame-ancestors ${FRAME_ANCESTORS}`,
        // X-Frame-Options has no allow-list beyond a single origin, and CSP
        // supersedes it in every browser we care about. Setting it here would
        // only break multi-domain embedding.
        'cache-control': 'public, max-age=300',
      });
      return res.end(html);
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders(req.headers.origin));
      return res.end();
    }

    // Intake submissions from the embedded form.
    if (route === 'POST /api/requests') {
      const cors = corsHeaders(req.headers.origin);
      const body = JSON.parse(await readBody(req, 200_000)) as Record<string, any>;

      // Silently accept honeypot hits. Telling a bot it was detected just
      // teaches whoever wrote it to leave the field alone next time.
      if (body.honeypot) {
        return json(res, 200, { requestId: `AD-${new Date().getFullYear()}-000000` }, cors);
      }

      const missing = ['business', 'website', 'contact', 'email', 'campaignName', 'promoting']
        .filter((k) => !String(body[k] ?? '').trim());
      if (missing.length) {
        return json(res, 400, { error: `Missing required fields: ${missing.join(', ')}` }, cors);
      }

      const requestId = `AD-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
      const record = { requestId, receivedAt: new Date().toISOString(), ...body };
      const dir = path.join(OUT, 'requests');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${requestId}.json`), JSON.stringify(record, null, 2));
      console.log(`[intake] ${requestId} ${body.business} <${body.email}>`);

      // TODO: push to HighLevel as a Creative Request custom object, kick off
      // Brandfetch discovery, and send the confirmation email.
      return json(res, 201, { requestId, status: 'received' }, cors);
    }

    if (route === 'POST /api/render') {
      const body = JSON.parse(await readBody(req)) as {
        campaign: Campaign;
        platforms?: string[];
        upload?: boolean;
      };
      if (!body?.campaign) return json(res, 400, { error: 'Body must include a `campaign` object' });

      const platforms = body.platforms ?? ['google'];
      // Validate in-request so a bad brand font is a 400, not a job that fails
      // silently in a worker ten seconds later.
      const findings = validateCampaign(body.campaign, { assetRoot: ROOT, platforms });
      const errors = findings.filter((f) => f.level === 'error');
      if (errors.length) {
        return json(res, 422, { error: 'Campaign failed validation', findings: errors });
      }

      const job = enqueue({
        campaign: body.campaign,
        platforms,
        upload: body.upload ?? false,
        outDir: OUT,
        assetRoot: ROOT,
      });
      return json(res, 202, {
        jobId: job.id,
        status: job.status,
        warnings: findings.filter((f) => f.level === 'warning'),
        poll: `/api/render/${job.id}`,
      });
    }

    const jobMatch = url.pathname.match(/^\/api\/render\/([\w-]+)$/);
    if (req.method === 'GET' && jobMatch) {
      const job = getJob(jobMatch[1]);
      if (!job) return json(res, 404, { error: 'No such job' });
      return json(res, 200, job);
    }

    if (req.method === 'GET' && url.pathname.startsWith('/files/')) {
      if (serveStatic(res, url.pathname)) return;
      return json(res, 404, { error: 'Not found' });
    }

    return json(res, 404, { error: `No route for ${route}` });
  } catch (err: any) {
    console.error(`[error] ${route}`, err);
    return json(res, 500, { error: err?.message ?? 'Internal error' });
  }
});

// Single-process mode runs the queue in-band. Set WORKER_MODE=external once a
// separate Render Background Worker is deployed against the same queue.
if (process.env.WORKER_MODE !== 'external') startWorkerLoop();

server.listen(PORT, HOST, () => {
  console.log(`smart1-ad-builder listening on ${HOST}:${PORT}`);
  console.log(`  output dir: ${OUT}`);
  console.log(`  worker:     ${process.env.WORKER_MODE === 'external' ? 'external' : 'in-process'}`);
});

// Render sends SIGTERM on deploy and scale-down; finish cleanly.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`${signal} received, closing`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
