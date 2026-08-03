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
import { enqueue, getJob, listJobs, startWorkerLoop, recoverJobs } from './jobs';
import { renderPreview } from './render';
import { buildCampaign, type Submission } from './intake';
import { loadTemplates } from './registry';
import { ProjectStore } from './projects';
import { analyzeLandingPage } from './landing';
import { checkAuth, denied, rateLimit, sessionCookie, configuredToken, sweepBuckets } from './auth';
import { runDiagnostics } from './diagnostics';
import { renderDiagnostics } from './diagnostics-page';
import { scheduleSweep, sweep } from './retention';
import { notify } from './notify';
import { discoverBrand, normalizeDomain } from './brandfetch';
import { ALLOWED_FORMATS, folderFor, signUpload, type AssetKind } from './assets';
import { CloudinaryService, slug } from './cloudinary';

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = process.env.OUTPUT_DIR ?? path.join(ROOT, 'out');
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT ?? 3000);
/** Base URL for links inside notifications. Set on Render to the public host. */
const PUBLIC_URL = (process.env.PUBLIC_URL ?? `http://localhost:${PORT}`).replace(/\/$/, '');
const projects = new ProjectStore(OUT);

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

  /**
   * Routes that expose or modify client work. Everything not listed is public
   * because an embedded form on a customer's site has to reach it. New routes
   * default to public, so anything sensitive must be added here deliberately.
   */
  const isInternal =
    url.pathname === '/build' ||
    url.pathname === '/build.html' ||
    url.pathname === '/projects' ||
    url.pathname === '/projects.html' ||
    url.pathname === '/diagnostics' ||
    url.pathname.startsWith('/api/campaign') ||
    url.pathname.startsWith('/api/campaigns') ||
    url.pathname.startsWith('/api/project') ||
    url.pathname.startsWith('/api/build/') ||
    url.pathname.startsWith('/api/diagnostics') ||
    url.pathname.startsWith('/files/') ||
    route === 'POST /api/render' ||
    url.pathname.startsWith('/api/render/');

  try {
    if (isInternal) {
      const auth = checkAuth(req, url);
      if (!auth.ok) {
        console.warn(`[auth] refused ${route} from ${req.headers['x-forwarded-for'] ?? req.socket.remoteAddress}`);
        return denied(res, 401, auth.reason ?? 'Unauthorised');
      }
      // Move a token supplied in the query string into a cookie, so it stops
      // appearing in the address bar, browser history and referrer headers.
      const q = url.searchParams.get('token');
      if (q && configuredToken() === q) res.setHeader('set-cookie', sessionCookie(q));
    }

    const limit = rateLimit(route, req);
    if (!limit.allowed) {
      return denied(res, 429, 'Too many requests. Please try again shortly.', {
        'retry-after': String(limit.retryAfterSec),
      });
    }

    // Render's health check. Must stay cheap and dependency-free — if this
    // touches Cloudinary, an outage there takes the whole service down.
    if (route === 'GET /healthz' || route === 'GET /') {
      return json(res, 200, {
        status: 'ok',
        service: 'smart1-ad-builder',
        uptime: Math.round(process.uptime()),
        queued: listJobs().filter((j) => j.status === 'queued').length,
        embed: {
          path: '/embed',
          available: fs.existsSync(path.join(PUBLIC, 'embed.html')),
          // The commonest embed failure is this being left at the default,
          // which permits only same-origin framing. Show it plainly.
          frameAncestors: FRAME_ANCESTORS,
          configured: Boolean(process.env.ALLOWED_FRAME_ANCESTORS),
        },
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

      // Build the campaign immediately so the request lands in the build queue
      // ready to open, rather than as an inert JSON file someone has to notice.
      // Failure here must not lose the submission — the request is already saved.
      let build: { renderable: boolean; notes: string[] } | undefined;
      try {
        const result = await buildCampaign({ requestId, ...body } as Submission, {
          assetRoot: ROOT,
          cacheDir: path.join(OUT, 'cache', requestId),
        });
        fs.mkdirSync(path.join(OUT, 'campaigns'), { recursive: true });
        fs.writeFileSync(
          path.join(OUT, 'campaigns', `${requestId}.json`),
          JSON.stringify({ campaign: result.campaign, notes: result.notes, assetSources: result.assetSources }, null, 2),
        );
        build = { renderable: result.renderable, notes: result.notes };

        // Every submission becomes a dated, searchable project record.
        const cld = new CloudinaryService();
        const project = projects.create({
          projectName: String(body.projectName || `${body.campaignName} — ${body.business}`).trim(),
          client: body.business,
          domain: result.campaign.brand.domain,
          campaignName: body.campaignName,
          requestId,
          landingPage: body.landingPage,
          brand: result.campaign.brand,
          brandEnteredManually: Boolean(body.brandManual),
          cloudinaryFolder: cld.projectFolder(body.business, body.campaignName),
          keywords: [body.promoting, body.benefit, body.offer, body.audience, body.geography, body.objective]
            .filter(Boolean).map(String),
          notes: result.notes,
        });
        for (const [kind, source] of Object.entries(result.assetSources)) {
          if (source === 'none') continue;
          projects.addAsset(project.projectId, { kind: kind as any, source: source as any });
        }
        (build as any).projectId = project.projectId;
        console.log(`[intake] ${requestId} -> project ${project.projectId}, renderable=${result.renderable}`);

        // Read the landing page in the background: the customer should not wait
        // on a third-party fetch to see their confirmation screen.
        if (body.landingPage) {
          analyzeLandingPage(String(body.landingPage))
            .then((analysis) => {
              const p = projects.get(project.projectId);
              if (p) { p.landingAnalysis = analysis; projects.save(p); }
              console.log(`[landing] ${project.projectId} analysed via ${analysis.source}`);
            })
            .catch((e) => console.warn(`[landing] ${project.projectId} failed: ${e?.message ?? e}`));
        }
        // Renderable submissions go straight into the queue. A customer who
        // uploaded a logo and a photo should not need staff to notice their
        // request before anything happens.
        if (result.renderable) {
          const platforms = (body.platforms ?? ['google']).filter(
            (p: string) => p === 'google' || p === 'amazon',
          );
          const job = enqueue({ campaign: result.campaign, platforms, upload: false, outDir: OUT, assetRoot: ROOT });
          console.log(`[intake] ${requestId} queued for auto-render as job ${job.id}`);

          // Poll rather than modify the job runner's contract — this keeps
          // notifications a bystander to rendering, not a dependency of it.
          const pid = project.projectId;
          const started = Date.now();
          const poll = setInterval(async () => {
            const j = getJob(job.id);
            if (!j || (j.status !== 'complete' && j.status !== 'failed')) {
              if (Date.now() - started > 5 * 60_000) clearInterval(poll); // give up quietly after 5 minutes
              return;
            }
            clearInterval(poll);
            const p = projects.get(pid);
            if (!p) return;

            if (j.status === 'complete' && j.results) {
              const proofUrl = j.reports?.find((r) => r.includes('/proof_'));
              projects.addBatch(pid, j.results, { reportUrl: proofUrl });
              await notify(
                {
                  subject: `New proof ready — ${p.client} / ${p.projectName}`,
                  body: `${p.client} submitted "${p.campaignName}" and it has been rendered automatically.\n\nReview in the build screen, or send the proof link on to the client.`,
                  url: proofUrl ? `${PUBLIC_URL}${proofUrl}` : `${PUBLIC_URL}/build?request=${requestId}`,
                },
                OUT,
              );
            } else {
              p.notes.push(`[${new Date().toISOString()}] Automatic render failed: ${j.error ?? 'unknown error'}`);
              projects.save(p);
              await notify(
                {
                  subject: `Render failed — ${p.client} / ${p.projectName}`,
                  body: `Automatic rendering failed: ${j.error ?? 'unknown error'}\n\nThe request is saved and can be opened in the build screen.`,
                  url: `${PUBLIC_URL}/build?request=${requestId}`,
                },
                OUT,
              );
            }
          }, 2000);
        } else {
          // Not renderable — usually missing a logo. Still worth a heads-up so
          // staff know a customer is waiting on an asset request, not nothing.
          await notify(
            {
              subject: `New request needs attention — ${project.client} / ${project.projectName}`,
              body: `"${project.campaignName}" was submitted but is not ready to render yet:\n${result.notes.map((n) => `- ${n}`).join('\n')}`,
              url: `${PUBLIC_URL}/build?request=${requestId}`,
            },
            OUT,
          );
        }
      } catch (e: any) {
        console.error(`[intake] ${requestId} campaign build failed: ${e?.message ?? e}`);
      }

      // TODO: push to HighLevel as a Creative Request custom object once the
      // custom object exists there.
      return json(res, 201, { requestId, status: 'received', build }, cors);
    }

    /* --------------------------------------------------- brand discovery */
    if (route === 'POST /api/brand/discover') {
      const cors = corsHeaders(req.headers.origin);
      const body = JSON.parse(await readBody(req, 20_000)) as { domain?: string };
      const domain = normalizeDomain(body.domain ?? '');
      if (!domain || !domain.includes('.')) {
        return json(res, 400, { error: 'Provide a website domain' }, cors);
      }
      try {
        const found = await discoverBrand(domain);
        return json(res, 200, found, cors);
      } catch (e: any) {
        // Discovery failing is normal for small businesses with no public
        // brand record. It must not block the request — the customer just
        // fills the details in and uploads a logo.
        console.log(`[brand] lookup failed for ${domain}: ${e?.message ?? e}`);
        return json(
          res,
          200,
          {
            brand: null,
            found: false,
            reason: e?.message ?? 'Lookup failed',
            warnings: ['We could not find your brand automatically. Please enter your details and upload your logo.'],
            needsReview: true,
            source: 'fallback',
          },
          cors,
        );
      }
    }

    /* ------------------------------------------------------ upload signing */
    if (route === 'POST /api/assets/upload-signature') {
      const cors = corsHeaders(req.headers.origin);
      const body = JSON.parse(await readBody(req, 20_000)) as {
        client?: string;
        campaign?: string;
        kind?: AssetKind;
        filename?: string;
      };
      const { client, campaign, kind } = body;
      if (!client || !campaign || !kind) {
        return json(res, 400, { error: 'client, campaign and kind are required' }, cors);
      }
      const ext = path.extname(body.filename ?? '').replace('.', '').toLowerCase();
      if (ext && !(ALLOWED_FORMATS as readonly string[]).includes(ext)) {
        return json(
          res,
          400,
          { error: `Unsupported file type ".${ext}". Accepted: ${ALLOWED_FORMATS.join(', ')}` },
          cors,
        );
      }

      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const apiKey = process.env.CLOUDINARY_API_KEY;
      const apiSecret = process.env.CLOUDINARY_API_SECRET;
      if (!cloudName || !apiKey || !apiSecret) {
        return json(res, 503, { error: 'Asset storage is not configured on the server.' }, cors);
      }

      const cld = new CloudinaryService();
      const signed = signUpload({
        folder: folderFor(cld, client, campaign, kind),
        // Slugged, because Cloudinary tags are comma-delimited and a client
        // name containing a comma would split into bogus tags.
        tags: [
          `client:${slug(client)}`,
          `campaign:${slug(campaign)}`,
          `kind:${slug(kind)}`,
          'source:customer-upload',
        ],
        apiKey,
        apiSecret,
        cloudName,
      });
      return json(res, 200, signed, cors);
    }

    /* ------------------------------------------------------------ approvals */
    // Posted by the proof screen. Public on purpose: the customer opening a
    // proof link is not an authenticated user. The project id in the URL is
    // the capability, so treat it like a signed link, not a secret.
    const decision = url.pathname.match(/^\/api\/proof\/([\w.-]+)\/(approve|revision)$/);
    if (decision && req.method === 'POST') {
      const [, projectId, kind] = decision;
      const project = projects.get(projectId);
      if (!project) return json(res, 404, { error: 'No such project' });

      const body = JSON.parse(await readBody(req, 50_000)) as { concept?: string; notes?: string };
      const at = new Date().toISOString();

      if (kind === 'approve') {
        project.status = 'approved';
        project.notes.push(`[${at}] Concept ${body.concept ?? '?'} approved by the client.`);
      } else {
        project.status = 'proof-sent';
        project.notes.push(`[${at}] Revision requested on concept ${body.concept ?? '?'}: ${body.notes ?? '(no detail)'}`);
      }
      projects.save(project);
      console.log(`[proof] ${projectId} -> ${project.status}`);

      await notify(
        {
          subject:
            kind === 'approve'
              ? `Approved — ${project.client} / ${project.projectName}`
              : `Revision requested — ${project.client} / ${project.projectName}`,
          body:
            kind === 'approve'
              ? `Concept ${body.concept ?? '?'} was approved and is ready for final delivery.`
              : `Concept ${body.concept ?? '?'} needs changes:\n\n"${body.notes ?? '(no detail given)'}"`,
          url: `${PUBLIC_URL}/build?request=${project.requestId}`,
        },
        OUT,
      );

      // TODO: push the status to HighLevel once the custom object exists there.
      return json(res, 200, { status: project.status, recordedAt: at });
    }

    /* ------------------------------------------------------------ retention */
    if (route === 'POST /api/maintenance/sweep') {
      const dry = url.searchParams.get('dry') !== '0';
      return json(res, 200, sweep({ outDir: OUT, dryRun: dry }));
    }

    /* ---------------------------------------------------------- diagnostics */
    if (route === 'GET /diagnostics' || route === 'GET /api/diagnostics') {
      const report = await runDiagnostics({ outDir: OUT, assetRoot: ROOT });
      if (url.searchParams.get('format') === 'json' || url.pathname.startsWith('/api/')) {
        // Non-200 when broken, so an uptime monitor can watch this directly.
        return json(res, report.verdict === 'broken' ? 503 : 200, report);
      }
      res.writeHead(report.verdict === 'broken' ? 503 : 200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      return res.end(renderDiagnostics(report));
    }

    /* ------------------------------------------------- landing page reader */
    if (route === 'POST /api/landing/analyze') {
      const cors = corsHeaders(req.headers.origin);
      const body = JSON.parse(await readBody(req, 20_000)) as { url?: string; projectId?: string };
      let target = String(body.url ?? '').trim();
      if (!target) return json(res, 400, { error: 'Provide a landing page URL' }, cors);
      if (!/^https?:\/\//i.test(target)) target = 'https://' + target;

      const analysis = await analyzeLandingPage(target);
      // Cache on the project so the page is read once, not on every revision.
      if (body.projectId) {
        const p = projects.get(body.projectId);
        if (p) { p.landingAnalysis = analysis; projects.save(p); }
      }
      return json(res, 200, analysis, cors);
    }

    /* -------------------------------------------------------------- projects */
    if (route === 'GET /api/projects') {
      const q = url.searchParams;
      return json(res, 200, {
        projects: projects.search({
          q: q.get('q') ?? undefined,
          client: q.get('client') ?? undefined,
          status: (q.get('status') as any) ?? undefined,
          from: q.get('from') ?? undefined,
          to: q.get('to') ?? undefined,
          limit: Number(q.get('limit') ?? 100),
        }),
      });
    }

    const projMatch = url.pathname.match(/^\/api\/project\/([\w.-]+)$/);
    if (projMatch) {
      if (req.method === 'GET') {
        const p = projects.get(projMatch[1]);
        return p ? json(res, 200, p) : json(res, 404, { error: 'No such project' });
      }
      if (req.method === 'PUT') {
        const body = JSON.parse(await readBody(req, 500_000));
        const existing = projects.get(projMatch[1]);
        if (!existing) return json(res, 404, { error: 'No such project' });
        return json(res, 200, projects.save({ ...existing, ...body, projectId: existing.projectId }));
      }
    }

    if (route === 'GET /projects' || route === 'GET /projects.html') {
      const file = path.join(PUBLIC, 'projects.html');
      if (!fs.existsSync(file)) return json(res, 404, { error: 'Projects screen not built' });
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(fs.readFileSync(file, 'utf8'));
    }

    /* -------------------------------------------------------- build screen */
    if (route === 'GET /build' || route === 'GET /build.html') {
      const file = path.join(PUBLIC, 'build.html');
      if (!fs.existsSync(file)) return json(res, 404, { error: 'Build screen not built' });
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(fs.readFileSync(file, 'utf8'));
    }

    // Everything the build screen needs to populate its controls.
    if (route === 'GET /api/build/options') {
      const templates = [...loadTemplates().values()].map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        sizes: Object.keys(t.sizes),
      }));
      return json(res, 200, { templates });
    }

    if (route === 'GET /api/campaigns') {
      const dir = path.join(OUT, 'campaigns');
      if (!fs.existsSync(dir)) return json(res, 200, { campaigns: [] });
      const campaigns = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => {
          const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
          const requestId = d.campaign?.requestId ?? f.replace('.json', '');
          // Status lives on the project record, not the campaign file, so the
          // build screen can show "needs revision" without a second fetch.
          const proj = projects.byRequest(requestId);
          return {
            requestId,
            client: d.campaign?.brand?.name ?? 'Unknown',
            campaignName: d.campaign?.campaignName ?? '',
            concepts: (d.campaign?.concepts ?? []).length,
            notes: (d.notes ?? []).length,
            status: proj?.status ?? 'draft',
            updated: fs.statSync(path.join(dir, f)).mtime.toISOString(),
          };
        })
        .sort((a, b) => {
          // Needs-revision surfaces first — that is the queue staff work from.
          const weight: Record<string, number> = { 'proof-sent': 0, draft: 1, 'in-build': 2, approved: 3, complete: 4, archived: 5 };
          const wa = weight[a.status] ?? 1, wb = weight[b.status] ?? 1;
          return wa !== wb ? wa - wb : b.updated.localeCompare(a.updated);
        });
      return json(res, 200, { campaigns });
    }

    const campMatch = url.pathname.match(/^\/api\/campaign\/([\w-]+)$/);
    if (campMatch) {
      const file = path.join(OUT, 'campaigns', `${campMatch[1]}.json`);
      if (req.method === 'GET') {
        if (!fs.existsSync(file)) return json(res, 404, { error: 'No such campaign' });
        const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
        // The build screen needs status and the latest proof link, both of
        // which live on the project record rather than the campaign file.
        const proj = projects.byRequest(campMatch[1]);
        const lastBatch = proj?.batches[proj.batches.length - 1];
        return json(res, 200, {
          ...doc,
          status: proj?.status,
          reportUrl: lastBatch?.reportUrl,
        });
      }
      if (req.method === 'PUT') {
        const body = JSON.parse(await readBody(req, 500_000));
        if (!body?.campaign?.brand) return json(res, 400, { error: 'Body must include a campaign' });
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(body, null, 2));
        return json(res, 200, { saved: true, requestId: campMatch[1] });
      }
    }

    // Live preview for the editor. Returns a PNG so the browser can show it
    // immediately, plus the QA findings for that one creative.
    if (route === 'POST /api/preview') {
      const body = JSON.parse(await readBody(req, 500_000)) as {
        campaign?: any;
        conceptId?: string;
        size?: string;
        platform?: string;
      };
      const campaign = body.campaign;
      const concept = campaign?.concepts?.find((c: any) => c.conceptId === body.conceptId)
        ?? campaign?.concepts?.[0];
      if (!campaign?.brand || !concept) {
        return json(res, 400, { error: 'Provide a campaign and a concept' });
      }
      try {
        const out = await renderPreview({
          brand: campaign.brand,
          concept,
          platform: body.platform ?? 'google',
          size: (body.size ?? '300x250') as any,
          assetRoot: ROOT,
        });
        return json(res, 200, {
          image: `data:image/png;base64,${out.png.toString('base64')}`,
          width: out.width,
          height: out.height,
          status: out.status,
          wordCount: out.wordCount,
          qa: out.qa.filter((f) => f.status !== 'pass'),
        });
      } catch (e: any) {
        return json(res, 422, { error: e?.message ?? 'Preview failed' });
      }
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
// Recover anything left mid-render by a prior restart before the loop starts
// draining, so a Render deploy cannot silently drop a customer's job.
const recovery = recoverJobs(OUT);
if (recovery.recovered) console.log(`[boot] requeued ${recovery.recovered} job(s) interrupted by the last restart`);

if (process.env.WORKER_MODE !== 'external') startWorkerLoop();

// Expired rate-limit buckets would otherwise accumulate for every client seen.
setInterval(() => sweepBuckets(), 10 * 60 * 1000).unref();

// Rendered files are kept after upload; without this they accumulate until the
// volume fills. Cloudinary holds the permanent copies.
scheduleSweep({
  outDir: OUT,
  renderDays: Number(process.env.RENDER_RETENTION_DAYS ?? 30),
  cacheDays: Number(process.env.CACHE_RETENTION_DAYS ?? 7),
}).unref();

server.listen(PORT, HOST, () => {
  console.log(`smart1-ad-builder listening on ${HOST}:${PORT}`);
  console.log(`  output dir: ${OUT}`);
  console.log(`  worker:     ${process.env.WORKER_MODE === 'external' ? 'external' : 'in-process'}`);
  console.log(`  embed page: ${fs.existsSync(path.join(PUBLIC, 'embed.html')) ? 'present' : 'MISSING'}`);
  console.log(`  frame-ancestors: ${FRAME_ANCESTORS}`);
  if (!process.env.ALLOWED_FRAME_ANCESTORS) {
    console.warn(
      "  WARNING: ALLOWED_FRAME_ANCESTORS is not set, so frame-ancestors is 'self'. " +
        'Any other site embedding /embed will get a blank box and a CSP error in the ' +
        "browser console. Set it to the embedding site's origin, e.g. " +
        "\"'self' https://smart1marketing.com\".",
    );
  }
});

// Render sends SIGTERM on deploy and scale-down; finish cleanly.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`${signal} received, closing`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
