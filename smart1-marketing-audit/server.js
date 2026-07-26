/**
 * Smart 1 Marketing — Marketing Efficiency Audit™
 * Express server: serves the audit app and proxies analysis requests to the OpenAI API.
 *
 * Env vars (set these in Render → Environment):
 *   OPENAI_API_KEY   required for AI narrative (app still works without it)
 *   OPENAI_MODEL     optional, default gpt-4o-mini
 *   LEAD_WEBHOOK_URL optional, POST target for captured leads (Zapier, Make, Smart 1 Suite)
 *   PORT             set automatically by Render
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { buildAuditPdf } = require('./pdf');
const cloudinary = require('./cloudinary');
const ghl = require('./ghl');

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const LEAD_WEBHOOK_URL = process.env.LEAD_WEBHOOK_URL;

app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));

/* Embedding: by default any site may iframe the audit. Set EMBED_ALLOWED_ORIGINS
   to a space-separated list (e.g. "https://smart1marketing.com https://www.smart1marketing.com")
   to restrict it to your own domains. */
const FRAME_ANCESTORS = process.env.EMBED_ALLOWED_ORIGINS || '*';
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', `frame-ancestors ${FRAME_ANCESTORS}`);
  next();
});

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

/* ---------------------------------------------------------------
   Simple in-memory rate limit: 15 analyses per IP per hour.
   Resets on redeploy — fine for a lead-gen tool.
---------------------------------------------------------------- */
const hits = new Map();
function rateLimited(ip, max = 15, windowMs = 60 * 60 * 1000) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
}

/* ---------------------------------------------------------------
   Prompt construction
---------------------------------------------------------------- */
const SYSTEM_PROMPT = `You are a senior marketing performance analyst at Smart 1 Marketing, a full-service digital agency with 20+ years of experience serving 4,000+ businesses.

You are writing the findings section of a Marketing Efficiency Audit™ that an accounting or bookkeeping partner will review with their client. Your reader is financially literate but NOT a marketer. Write like a CFO advisor: concrete, numbers-first, plain English, no jargon and no hype.

Rules:
- Reference the client's own numbers directly. Never invent data that was not supplied.
- When a metric is missing or zero, say what it prevents you from knowing instead of guessing.
- Frame everything as "may", "appears", "suggests" — this is a directional assessment, not an audit opinion.
- Estimated dollar impacts must be arithmetically traceable to the supplied inputs. Show the math in one short clause.
- No emojis. No exclamation points. No "unlock", "supercharge", "game-changer", "in today's landscape".
- The recommended next step is always a complimentary Marketing Efficiency Audit™ with Smart 1 Marketing — stated calmly, once.

Return ONLY valid JSON matching this shape:
{
  "headline": "one sentence, under 15 words, the single most important finding",
  "executiveSummary": "2-3 sentences a CPA could read aloud to their client",
  "findings": [{"title": "short label", "detail": "2-3 sentences using their numbers", "severity": "high|medium|low"}],
  "leaks": [{"area": "where money may be leaking", "estimatedMonthlyImpact": "$X,XXX or 'Unknown — not tracked'", "why": "one sentence"}],
  "questionsToAsk": ["question the partner should ask the client in their next meeting"],
  "nextSteps": ["specific action, most valuable first"],
  "partnerTalkingPoint": "one sentence the accounting partner can say to open the conversation"
}
Include 3-5 findings, 2-4 leaks, 4-6 questions, 3-4 next steps.`;

function money(n) {
  if (n === null || n === undefined || !isFinite(n)) return 'not provided';
  return '$' + Math.round(n).toLocaleString('en-US');
}

function buildUserPrompt(p = {}) {
  const s = p.snapshot || {};
  const m = p.metrics || {};
  const b = p.benchmark || {};
  const flagsYes = (p.flags || []).filter((f) => f.answer === true).map((f) => `- ${f.label} (${f.points} pts)`);
  const flagsNo = (p.flags || []).filter((f) => f.answer === false).map((f) => `- ${f.label}`);
  const spendLines = Object.entries(p.spend || {})
    .filter(([, v]) => Number(v) > 0)
    .map(([k, v]) => `- ${k}: ${money(Number(v))}/mo`);

  return `CLIENT SNAPSHOT
Business: ${s.clientName || 'Not provided'}
Industry: ${s.industry || 'Not provided'}
Annual revenue: ${money(s.annualRevenue)}
Locations: ${s.locations || 'Not provided'}
Marketing vendors in use: ${s.vendors || 'Not provided'}

MONTHLY MARKETING INVESTMENT (total ${money(m.spend)})
${spendLines.length ? spendLines.join('\n') : '- Not itemized'}

CALCULATED PERFORMANCE
Monthly leads: ${m.leads ?? 'not provided'}
New customers per month: ${m.customers ?? 'not provided'}
Close rate: ${m.closeRate != null ? m.closeRate.toFixed(1) + '%' : 'not provided'}
Cost per lead: ${money(m.cpl)}
Customer acquisition cost: ${money(m.cac)}
Average sale: ${money(m.avgSale)}
Customer lifetime value: ${money(m.clv)}
Estimated monthly revenue from marketing: ${money(m.revenue)}
Marketing ROI: ${m.roi != null ? Math.round(m.roi) + '%' : 'not calculable'}
Marketing spend as % of revenue: ${m.spendPct != null ? m.spendPct.toFixed(1) + '%' : 'not calculable'}
Growth opportunity at +${m.liftPct ?? 0}% leads: ${money(m.opportunityAnnual)} additional annual revenue

INDUSTRY BENCHMARKS (${s.industry || 'general'})
Typical marketing budget: ${b.budgetLo ?? '?'}%–${b.budgetHi ?? '?'}% of revenue → client is at ${m.spendPct != null ? m.spendPct.toFixed(1) + '%' : 'unknown'} (${b.spendVerdict || 'unknown'})
Typical cost per lead: ${b.cplLo != null ? money(b.cplLo) + '–' + money(b.cplHi) : 'no published range'} → client is at ${money(m.cpl)} (${b.cplVerdict || 'unknown'})

PROFIT LEAK WARNING SIGNS — ${p.leakPoints || 0} of 30 points, tier: ${p.leakTier || 'unknown'}
Present:
${flagsYes.length ? flagsYes.join('\n') : '- None flagged'}
Not present:
${flagsNo.length ? flagsNo.join('\n') : '- None'}

MARKETING EFFICIENCY SCORE™: ${p.score ?? '?'}/100 (${p.scoreTier || ''})

Write the findings for this client.`;
}

/* ---------------------------------------------------------------
   Fallback narrative — keeps the app useful with no API key
---------------------------------------------------------------- */
function fallbackAnalysis(p = {}) {
  const m = p.metrics || {};
  const b = p.benchmark || {};
  const findings = [];

  if (m.cpl != null) {
    findings.push({
      title: 'Cost per lead',
      detail: `At ${money(m.spend)} per month generating ${m.leads} leads, cost per lead is ${money(m.cpl)}. ${
        b.cplLo != null ? `The published range for this industry is ${money(b.cplLo)}–${money(b.cplHi)}.` : 'No published range applies to this industry.'
      }`,
      severity: b.cplVerdict === 'above range' ? 'high' : 'low',
    });
  }
  if (m.spendPct != null) {
    findings.push({
      title: 'Spend relative to revenue',
      detail: `Annualized marketing investment is ${m.spendPct.toFixed(1)}% of revenue against a typical range of ${b.budgetLo}%–${b.budgetHi}%. This is ${b.spendVerdict}.`,
      severity: b.spendVerdict === 'above range' ? 'high' : 'medium',
    });
  }
  if (m.roi != null) {
    findings.push({
      title: 'Return on marketing investment',
      detail: `Estimated revenue attributed to marketing is ${money(m.revenue)} per month against ${money(m.spend)} in spend, a return of ${Math.round(m.roi)}%.`,
      severity: m.roi < 100 ? 'high' : 'low',
    });
  }
  findings.push({
    title: 'Measurement gaps',
    detail: `${p.leakPoints || 0} of 30 possible warning-sign points were flagged, placing this business in the "${p.leakTier}" tier. Measurement gaps make it difficult to know which spend is producing customers.`,
    severity: (p.leakPoints || 0) > 12 ? 'high' : 'medium',
  });

  return {
    headline: `Marketing Efficiency Score of ${p.score}/100 — ${p.scoreTier}.`,
    executiveSummary: `Based on the inputs provided, this business invests ${money(m.spend)} per month in marketing and shows a Marketing Efficiency Score of ${p.score} out of 100. ${
      m.opportunityAnnual ? `A ${m.liftPct}% improvement in lead volume at the current close rate would represent roughly ${money(m.opportunityAnnual)} in additional annual revenue.` : ''
    } A detailed review is recommended to confirm these directional findings.`,
    findings,
    leaks: [
      { area: 'Untracked conversions', estimatedMonthlyImpact: 'Unknown — not tracked', why: 'Spend cannot be attributed to revenue without conversion tracking.' },
      { area: 'Multiple vendors and overlapping tools', estimatedMonthlyImpact: money((m.spend || 0) * 0.1), why: 'Duplicate platforms and fragmented reporting commonly account for 10% or more of spend.' },
    ],
    questionsToAsk: [
      'How do you currently determine whether marketing is working?',
      'What does one new customer cost you today?',
      'Which channel produced your last ten customers?',
      'When was your marketing strategy last reviewed?',
    ],
    nextSteps: [
      'Confirm lead and conversion tracking is in place before changing any budget.',
      'Consolidate reporting into a single monthly view of spend, leads, and customers.',
      'Schedule a complimentary Marketing Efficiency Audit™ with Smart 1 Marketing.',
    ],
    partnerTalkingPoint: `Your marketing line is ${money((m.spend || 0) * 12)} a year — let's find out what it's producing.`,
    _fallback: true,
  };
}

/* ---------------------------------------------------------------
   Routes
---------------------------------------------------------------- */
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    model: OPENAI_MODEL,
    aiEnabled: Boolean(OPENAI_API_KEY),
    pdfEnabled: true,
    pdfStorage: cloudinary.isConfigured() ? 'cloudinary' : 'local-disk',
    ghl: {
      webhook: Boolean(GHL_WEBHOOK_URL),
      api: ghl.isConfigured(),
      pdfAttach: ghl.canAttach(),
    },
  });
});

app.post('/api/analyze', async (req, res) => {
  const payload = req.body || {};

  if (rateLimited(req.ip)) {
    return res.status(429).json({ error: 'Too many audits from this connection. Try again in an hour.' });
  }

  if (!OPENAI_API_KEY) {
    return res.json({ analysis: fallbackAnalysis(payload), source: 'fallback' });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.4,
        max_tokens: 1600,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(payload) },
        ],
      }),
    });
    clearTimeout(timeout);

    if (!r.ok) {
      const text = await r.text();
      console.error('OpenAI error', r.status, text.slice(0, 500));
      return res.json({ analysis: fallbackAnalysis(payload), source: 'fallback', note: 'AI service unavailable' });
    }

    const data = await r.json();
    const raw = data.choices?.[0]?.message?.content || '{}';
    let analysis;
    try {
      analysis = JSON.parse(raw);
    } catch {
      analysis = fallbackAnalysis(payload);
    }
    res.json({ analysis, source: 'openai', model: OPENAI_MODEL });
  } catch (err) {
    console.error('analyze failed:', err.message);
    res.json({ analysis: fallbackAnalysis(payload), source: 'fallback', note: 'AI service unavailable' });
  }
});

/* ---------------------------------------------------------------
   Lead delivery: generic webhook + GoHighLevel (Smart 1 Suite)
---------------------------------------------------------------- */
const GHL_WEBHOOK_URL = process.env.GHL_WEBHOOK_URL;
/** Flat payload sent to the GHL inbound webhook and any generic webhook. */
function leadPayload(body = {}, pdfUrl) {
  const snap = body.client || body.snapshot || {};
  return {
    source: 'Marketing Efficiency Audit',
    stage: pdfUrl ? 'completed' : 'started',
    partnerName: body.partnerName || snap.preparedBy || body.name || '',
    partnerFirm: body.partnerFirm || snap.partnerFirm || body.firm || '',
    name: body.name || '',
    firm: body.firm || '',
    email: body.email || '',
    phone: body.phone || '',
    clientBusiness: snap.clientName || '',
    clientIndustry: snap.industry || '',
    clientAnnualRevenue: snap.annualRevenue || null,
    monthlyMarketingSpend: body.monthlySpend ?? body.metrics?.spend ?? null,
    efficiencyScore: body.score ?? null,
    scoreTier: body.scoreTier || '',
    leakPoints: body.leakPoints ?? null,
    leakTier: body.leakTier || '',
    auditPdfUrl: pdfUrl || '',
    submittedAt: new Date().toISOString(),
  };
}

async function postJson(url, body, headers = {}) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json().catch(() => ({}));
}

async function deliverLead(body, pdfUrl, pdfBuffer, filename) {
  const payload = leadPayload(body, pdfUrl);
  console.log('LEAD:', JSON.stringify(payload));

  const jobs = [];
  if (LEAD_WEBHOOK_URL) jobs.push(postJson(LEAD_WEBHOOK_URL, payload).catch((e) => console.error('lead webhook failed:', e.message)));
  if (GHL_WEBHOOK_URL) jobs.push(postJson(GHL_WEBHOOK_URL, payload).catch((e) => console.error('ghl webhook failed:', e.message)));
  if (ghl.isConfigured()) {
    jobs.push(
      ghl.sendAudit(payload, pdfBuffer, filename)
        .then((r) => console.log('GHL:', JSON.stringify(r)))
        .catch((e) => console.error('ghl api failed:', e.message))
    );
  }
  await Promise.allSettled(jobs);
  return payload;
}

app.post('/api/lead', async (req, res) => {
  await deliverLead(req.body || {});
  res.json({ ok: true });
});

/* ---------------------------------------------------------------
   PDF report: build, store, hand back a link, push to GHL
---------------------------------------------------------------- */
const PDF_DIR = process.env.PDF_DIR || path.join(os.tmpdir(), 'smart1-audits');
const PDF_TTL_HOURS = Number(process.env.PDF_TTL_HOURS || 720); // 30 days
fs.mkdirSync(PDF_DIR, { recursive: true });

function baseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  return `${proto}://${req.headers.host}`;
}

function slug(text, fallback) {
  const s = String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return s.slice(0, 40) || fallback;
}

/** Delete expired reports so an instance with a mounted disk doesn't grow forever. */
function sweepPdfs() {
  try {
    const cutoff = Date.now() - PDF_TTL_HOURS * 3600 * 1000;
    for (const f of fs.readdirSync(PDF_DIR)) {
      const p = path.join(PDF_DIR, f);
      if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p);
    }
  } catch (err) { console.error('pdf sweep failed:', err.message); }
}
setInterval(sweepPdfs, 6 * 3600 * 1000).unref();
sweepPdfs();

app.post('/api/report', async (req, res) => {
  const payload = req.body || {};
  try {
    const buf = await buildAuditPdf(payload);
    const id = crypto.randomBytes(12).toString('hex');
    const name = `marketing-efficiency-audit-${slug(payload.snapshot?.clientName, 'client')}-${id}.pdf`;

    let url = null;
    let storage = 'local';

    if (cloudinary.isConfigured()) {
      try {
        const up = await cloudinary.uploadPdf(buf, name);
        url = up.url;
        storage = 'cloudinary';
      } catch (err) {
        console.error('cloudinary upload failed, falling back to local disk:', err.message);
      }
    }

    if (!url) {
      fs.writeFileSync(path.join(PDF_DIR, name), buf);
      url = `${baseUrl(req)}/audit/${name}`;
    }

    deliverLead({ ...(payload.lead || {}), ...payload, client: payload.snapshot }, url, buf, name)
      .catch((e) => console.error('lead delivery failed:', e.message));

    res.json({ ok: true, url, filename: name, bytes: buf.length, storage });
  } catch (err) {
    console.error('pdf build failed:', err);
    res.status(500).json({ error: 'Report could not be generated.' });
  }
});

app.get('/audit/:file', (req, res) => {
  const file = req.params.file;
  if (!/^[a-zA-Z0-9._-]+\.pdf$/.test(file)) return res.status(400).send('Bad request');
  const full = path.join(PDF_DIR, file);
  if (!fs.existsSync(full)) {
    return res.status(404).send('This report link has expired. Run the audit again to generate a new copy.');
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
  fs.createReadStream(full).pipe(res);
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Marketing Efficiency Audit running on :${PORT}`));
