/* =============================================================================
   Stadium to Screen — server

   Endpoints
   - GET  /api/health           status of AI / Cloudinary / GHL config
   - POST /api/recommendations  OpenAI-matched media lists (key stays server-side)
   - POST /api/lead             build PDF -> store in Cloudinary -> forward to GHL

   Environment variables (set these in Render)
   - OPENAI_API_KEY   OpenAI key for the recommendation lists (optional; falls back)
   - OPENAI_MODEL     default "gpt-4o-mini"
   - GHL_WEBHOOK_URL  GoHighLevel Inbound Webhook URL to forward captured leads
   - CLOUDINARY_URL   cloudinary://<api_key>:<api_secret>@<cloud_name>  (stores the PDF)
   - ALLOWED_ORIGIN   CORS origin for the widget (default "*")
   - PORT             set automatically by Render
============================================================================= */

const path = require("path");
const express = require("express");
const cloudinary = require("cloudinary").v2;      // auto-configures from CLOUDINARY_URL
const DATA = require("./public/data.js");
const { generateProposalPdf } = require("./lib/pdf.js");

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const GHL_WEBHOOK_URL = process.env.GHL_WEBHOOK_URL;
const CLOUDINARY_READY = !!process.env.CLOUDINARY_URL;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const REPORT_NAME = "company-stadium-report";

const app = express();
app.use(express.json({ limit: "256kb" }));

// CORS — the widget lives on smart1marketing.com, a different origin than Render
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.static(path.join(__dirname, "public")));

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

app.post("/api/recommendations", async (req, res) => {
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

/* ---------- lead capture: PDF -> Cloudinary -> GHL ---------- */
function uploadPdfToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "image",              // Cloudinary stores PDFs under the image type
        format: "pdf",
        folder: "company-stadium-reports",
        public_id: `${REPORT_NAME}-${Date.now()}`,
        overwrite: false
      },
      (err, result) => (err ? reject(err) : resolve(result.secure_url))
    );
    stream.end(buffer);
  });
}

app.post("/api/lead", async (req, res) => {
  const lead = req.body || {};
  if (!lead.name || !lead.email) return res.status(400).json({ ok: false, error: "name and email are required" });

  const warnings = [];
  let pdfUrl = null;

  // 1) build the PDF
  let pdfBuffer = null;
  try {
    pdfBuffer = await generateProposalPdf(lead);
  } catch (e) { warnings.push("PDF generation failed: " + e.message); }

  // 2) store it in Cloudinary
  if (pdfBuffer && CLOUDINARY_READY) {
    try { pdfUrl = await uploadPdfToCloudinary(pdfBuffer); }
    catch (e) { warnings.push("Cloudinary upload failed: " + e.message); }
  } else if (!CLOUDINARY_READY) {
    warnings.push("CLOUDINARY_URL not set — PDF not stored");
  }

  // 3) forward lead + pdf link to GHL (drop the heavy nested lists; the PDF carries them)
  const { recommendations, ...flat } = lead;
  const outbound = { ...flat, reportName: `${REPORT_NAME}.pdf`, pdfUrl, generatedAt: new Date().toISOString() };
  let forwarded = false;
  if (GHL_WEBHOOK_URL) {
    try {
      const r = await fetch(GHL_WEBHOOK_URL, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(outbound)
      });
      forwarded = r.ok;
      if (!r.ok) warnings.push("GHL webhook returned " + r.status);
    } catch (e) { warnings.push("GHL forward failed: " + e.message); }
  } else {
    warnings.push("GHL_WEBHOOK_URL not set — lead not forwarded");
  }

  res.json({ ok: true, pdfUrl, forwarded, warnings });
});

app.get("/api/health", (_req, res) => res.json({
  ok: true,
  ai: !!OPENAI_KEY, model: OPENAI_MODEL,
  cloudinary: CLOUDINARY_READY,
  ghl: !!GHL_WEBHOOK_URL
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(
  `Stadium to Screen on :${PORT}  (AI ${OPENAI_KEY ? "on" : "off"} · Cloudinary ${CLOUDINARY_READY ? "on" : "off"} · GHL ${GHL_WEBHOOK_URL ? "on" : "off"})`
));
