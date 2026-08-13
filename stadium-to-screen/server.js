/* =============================================================================
   Stadium to Screen — server

   Endpoints
   - GET  /api/health           config status
   - GET  /api/config           public widget config (calendar URL)
   - POST /api/recommendations  OpenAI-matched media lists (rate-limited)
   - POST /api/partial-lead     salvage abandoned sessions -> GHL + store (light rate limit)
   - POST /api/lead             PDF -> Cloudinary -> email + notify + GHL, store (rate-limited)
   - GET  /leads  /api/leads    token-gated leads dashboard

   Environment variables (Render)
   - OPENAI_API_KEY, OPENAI_MODEL
   - GHL_WEBHOOK_URL            forward captured leads to GoHighLevel
   - CLOUDINARY_URL             cloudinary://key:secret@cloud  (stores PDFs + leads)
   - ADMIN_TOKEN                required to view /leads
   - ALLOWED_ORIGIN             CORS origin (default *; set to https://smart1marketing.com)
   - NOTIFY_WEBHOOK_URL         Slack/generic webhook — instant rep notification
   - SMTP_URL, MAIL_FROM        auto-email the prospect their PDF
   - REP_NAME, REP_EMAIL, REP_PHONE, CALENDAR_URL   shown on the PDF / book-a-call
============================================================================= */

const path = require("path");
const crypto = require("crypto");
const express = require("express");
const nodemailer = require("nodemailer");
const DATA = require("./public/data.js");
const { generateProposalPdf } = require("./lib/pdf.js");
const store = require("./lib/store.js");

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const GHL_WEBHOOK_URL = process.env.GHL_WEBHOOK_URL;
const NOTIFY_WEBHOOK_URL = process.env.NOTIFY_WEBHOOK_URL;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const SMTP_URL = process.env.SMTP_URL || "";
const MAIL_FROM = process.env.MAIL_FROM || "Smart 1 Marketing <no-reply@smart1marketing.com>";
const REPORT_NAME = "company-stadium-report";
const REP = {
  name: process.env.REP_NAME || "",
  email: process.env.REP_EMAIL || "",
  phone: process.env.REP_PHONE || "",
  calendar: process.env.CALENDAR_URL || ""
};

// Cloudinary is loaded lazily and only when the URL is well-formed.
const CLOUDINARY_URL = process.env.CLOUDINARY_URL || "";
const CLOUDINARY_READY = CLOUDINARY_URL.startsWith("cloudinary://");
let _cloudinary = null;
function cloudinaryClient() { if (!_cloudinary) _cloudinary = require("cloudinary").v2; return _cloudinary; }

// Mail transport (lazy, graceful).
let _mail = null;
function mailer() { if (_mail === null) _mail = SMTP_URL ? nodemailer.createTransport(SMTP_URL) : false; return _mail; }

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "256kb" }));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, x-admin-token");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.static(path.join(__dirname, "public")));

/* ---------- simple in-memory rate limiter ---------- */
const RL = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const ip = (req.headers["x-forwarded-for"] || req.ip || "unknown").split(",")[0].trim();
    const key = req.path + "|" + ip;
    const now = Date.now();
    let e = RL.get(key);
    if (!e || now > e.reset) { e = { count: 0, reset: now + windowMs }; RL.set(key, e); }
    e.count++;
    if (e.count > max) {
      res.set("Retry-After", Math.ceil((e.reset - now) / 1000));
      return res.status(429).json({ error: "Too many requests — please wait a moment and try again." });
    }
    next();
  };
}
setInterval(() => { const now = Date.now(); for (const [k, v] of RL) if (now > v.reset) RL.delete(k); }, 300000).unref();

/* ---------- OpenAI-matched recommendation lists ---------- */
function buildPrompt({ team, league, focus, scope, scopeLabel }) {
  const wantAudio = focus === "audio" || focus === "both";
  const wantVideo = focus === "ctv" || focus === "both";
  return `You are a programmatic media planner for Smart 1 Marketing building a football advertising proposal.
TEAM: ${team.name} (${league === "pro" ? "NFL / pro" : "college"})
HOME MARKET: ${team.city} — ${team.venue}
TARGETING SCOPE: ${scope} (${scopeLabel})
CHANNEL FOCUS: ${focus}

Return ONLY valid JSON:
{
  "streamingServices": [{"name":"","why":""}],   // 5-7 real ${wantVideo ? "CTV/OTT" : ""}${wantAudio ? " audio streaming" : ""} services these fans use
  "podcasts": ${wantAudio ? '[{"name":"","network":""}]  // 5-7 real sports/football podcasts on major DSPs' : "[]"},
  "sportsNetworks": [{"name":"","why":""}],       // 4-6 real networks (national + this team's regional/conference net)
  "relatedAudiences": [{"name":"","why":""}]      // 5-7 adjacent buyer audiences that index high with these fans
}
Real brands only. Keep "why" under 10 words. Tailor to ${team.name}'s region.`;
}
async function callOpenAI(payload) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: OPENAI_MODEL, temperature: 0.4, max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a precise media-planning assistant. Output only valid JSON. Never invent brands." },
        { role: "user", content: buildPrompt(payload) }
      ]
    })
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const json = await res.json();
  return JSON.parse(json.choices?.[0]?.message?.content || "{}");
}
app.post("/api/recommendations", rateLimit(30, 10 * 60 * 1000), async (req, res) => {
  const { league = "college", team: teamName, focus = "audio", scope = "local" } = req.body || {};
  const team = DATA.findTeam(league, teamName);
  if (!team) return res.status(400).json({ aiGenerated: false, recommendations: DATA.fallbackRecommendations(focus) });
  if (!OPENAI_KEY) return res.json({ aiGenerated: false, recommendations: DATA.fallbackRecommendations(focus) });
  try {
    const scopeLabel = DATA.marketForScope(team, scope).label;
    const recommendations = await callOpenAI({ team, league, focus, scope, scopeLabel });
    res.json({ aiGenerated: true, model: OPENAI_MODEL, recommendations });
  } catch (err) {
    console.error("OpenAI failed:", err.message);
    res.json({ aiGenerated: false, recommendations: DATA.fallbackRecommendations(focus) });
  }
});

/* ---------- partial lead capture (abandoned sessions) ----------
   No validation beyond the honeypot — salvage whatever came in. Uses its own
   (path-keyed) rate bucket so it never consumes the /api/lead or AI budget. */
app.post("/api/partial-lead", rateLimit(30, 10 * 60 * 1000), async (req, res) => {
  const p = req.body || {};
  // honeypot: bots fill the hidden "website" field — silently accept & drop
  if (p.website) return res.json({ ok: true });
  delete p.website;

  const outbound = {
    ...p,
    source: p.source || "Stadium to Screen proposal builder",
    lead_stage: "partial",
    report_status: "partial",
    lead_id: p.lead_id || "",
    receivedAt: new Date().toISOString()
  };

  try {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await store.addLead({ id, stage: "partial", ...outbound });
  } catch (e) { console.error("partial lead store failed:", e.message); }

  if (GHL_WEBHOOK_URL) {
    try {
      await fetch(GHL_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(outbound) });
    } catch (e) { console.error("partial lead GHL forward failed:", e.message); }
  }
  res.json({ ok: true });
});

/* ---------- lead capture ---------- */
function uploadPdfToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const cloudinary = cloudinaryClient();
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: "image", format: "pdf", folder: "company-stadium-reports",
        public_id: `${REPORT_NAME}-${Date.now()}`, overwrite: false },
      (err, result) => (err ? reject(err) : resolve(result.secure_url))
    );
    stream.end(buffer);
  });
}
async function emailProspect(lead, pdfBuffer) {
  const t = mailer();
  if (!t || !pdfBuffer || !lead.email) return false;
  const first = (lead.name || "there").trim().split(" ")[0];
  await t.sendMail({
    from: MAIL_FROM, to: lead.email,
    subject: `Your ${lead.team || "Stadium to Screen"} advertising proposal`,
    text: `Hi ${first},\n\nThanks for your interest in Smart 1 Marketing's Stadium to Screen program. `
      + `Your custom ${lead.team || ""} proposal is attached as a PDF.\n\n`
      + (REP.name ? `${REP.name} will follow up shortly` : `A strategist will follow up shortly`)
      + (REP.calendar ? ` — or grab a time here: ${REP.calendar}` : ".") + `\n\n— Smart 1 Marketing`,
    attachments: [{ filename: `${REPORT_NAME}.pdf`, content: pdfBuffer }]
  });
  return true;
}
async function notifyRep(lead, pdfUrl) {
  if (!NOTIFY_WEBHOOK_URL) return false;
  const text = `New Stadium-to-Screen lead\n`
    + `${lead.name} — ${lead.company || "—"}\n${lead.email}  ${lead.phone || ""}\n`
    + `Team: ${lead.team} (${lead.scopeLabel || lead.scope || ""}) · ${lead.focus || ""}\n`
    + `Package: ${lead.recommendedPackage || "—"} ${lead.packagePrice || ""}\n`
    + (pdfUrl ? `Report: ${pdfUrl}` : "");
  const r = await fetch(NOTIFY_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
  return r.ok;
}

app.post("/api/lead", rateLimit(8, 10 * 60 * 1000), async (req, res) => {
  const lead = req.body || {};
  // honeypot: bots fill the hidden "website" field — silently accept & drop
  if (lead.website) return res.json({ ok: true, dropped: true });
  if (!lead.name || !lead.email) return res.status(400).json({ ok: false, error: "name and email are required" });
  delete lead.website;

  const warnings = [];
  let pdfBuffer = null, pdfUrl = null;

  try { pdfBuffer = await generateProposalPdf(lead, REP); }
  catch (e) { warnings.push("PDF generation failed: " + e.message); }

  if (pdfBuffer && CLOUDINARY_READY) {
    try { pdfUrl = await uploadPdfToCloudinary(pdfBuffer); }
    catch (e) { warnings.push("Cloudinary upload failed: " + e.message); }
  } else if (!CLOUDINARY_READY) {
    warnings.push("CLOUDINARY_URL missing or malformed (must start with cloudinary://) — PDF not stored");
  }

  // store for the /leads dashboard
  const { recommendations, ...flat } = lead;
  const outbound = { ...flat, reportName: `${REPORT_NAME}.pdf`, pdfUrl, generatedAt: new Date().toISOString() };
  try {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await store.addLead({ id, ...outbound });
  } catch (e) { warnings.push("lead store failed: " + e.message); }

  // email the prospect their report
  let emailed = false;
  try { emailed = await emailProspect(lead, pdfBuffer); }
  catch (e) { warnings.push("email failed: " + e.message); }

  // instant rep notification
  let notified = false;
  try { notified = await notifyRep(lead, pdfUrl); }
  catch (e) { warnings.push("notify failed: " + e.message); }

  // forward to GHL
  let forwarded = false;
  if (GHL_WEBHOOK_URL) {
    try {
      const r = await fetch(GHL_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...outbound, emailed, notified }) });
      forwarded = r.ok;
      if (!r.ok) warnings.push("GHL webhook returned " + r.status);
    } catch (e) { warnings.push("GHL forward failed: " + e.message); }
  } else warnings.push("GHL_WEBHOOK_URL not set — lead not forwarded");

  res.json({
    ok: true, pdfUrl, forwarded, emailed, notified, warnings,
    reportFilename: `${REPORT_NAME}.pdf`,
    calendarUrl: REP.calendar || "",
    pdfBase64: pdfBuffer ? pdfBuffer.toString("base64") : null
  });
});

/* ---------- leads dashboard ---------- */
app.get("/leads", (_req, res) => res.sendFile(path.join(__dirname, "public", "leads.html")));
function tokenMatches(supplied, expected) {
  const a = Buffer.from(String(supplied || ""));
  const b = Buffer.from(String(expected || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}
app.get("/api/leads", rateLimit(30, 10 * 60 * 1000), async (req, res) => {
  if (!ADMIN_TOKEN) return res.status(503).json({ error: "Leads dashboard disabled — set ADMIN_TOKEN in Render to enable." });
  const token = req.get("x-admin-token"); // header only — never accept tokens in the query string
  if (!tokenMatches(token, ADMIN_TOKEN)) return res.status(401).json({ error: "Unauthorized" });
  res.json({ leads: await store.getLeads(), persistent: store.persistent });
});

app.get("/api/config", (_req, res) => res.json({ calendarUrl: REP.calendar || "" }));
app.get("/api/health", (_req, res) => res.json({
  ok: true, ai: !!OPENAI_KEY, model: OPENAI_MODEL,
  cloudinary: CLOUDINARY_READY, ghl: !!GHL_WEBHOOK_URL,
  email: !!SMTP_URL, notify: !!NOTIFY_WEBHOOK_URL,
  leadsDashboard: !!ADMIN_TOKEN, calendar: !!REP.calendar
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(
  `Stadium to Screen on :${PORT}  (AI ${OPENAI_KEY ? "on" : "off"} · Cloudinary ${CLOUDINARY_READY ? "on" : "off"} · GHL ${GHL_WEBHOOK_URL ? "on" : "off"} · email ${SMTP_URL ? "on" : "off"} · notify ${NOTIFY_WEBHOOK_URL ? "on" : "off"})`
));
