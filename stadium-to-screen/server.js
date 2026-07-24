/* =============================================================================
   Stadium to Screen — server
   Serves the static landing page and exposes ONE endpoint that the browser
   cannot do itself: POST /api/recommendations, which calls the OpenAI API using
   a server-side key (so the key is never exposed to the browser).

   The audience NUMBERS are computed in the browser from public/data.js.
   This server only generates the qualitative recommendation LISTS.
============================================================================= */

const path = require("path");
const express = require("express");
const DATA = require("./public/data.js");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function buildPrompt({ team, league, focus, scope, scopeLabel }) {
  const wantAudio = focus === "audio" || focus === "both";
  const wantVideo = focus === "ctv" || focus === "both";
  return `You are a programmatic media planner for Smart 1 Marketing building a
football advertising proposal.

TEAM: ${team.name} (${league === "pro" ? "NFL / pro" : "college"})
HOME MARKET: ${team.city} — ${team.venue}
TARGETING SCOPE: ${scope} (${scopeLabel})
CHANNEL FOCUS: ${focus}

Return ONLY valid JSON with this exact shape:
{
  "streamingServices": [{"name": "", "why": ""}],   // ${wantVideo ? "CTV/OTT services" : ""}${wantAudio ? " audio streaming services" : ""}; 5-7 real, well-known services fans of this team actually use
  "podcasts": ${wantAudio ? '[{"name": "", "network": ""}]  // 5-7 real sports/football podcasts likely available on major DSPs; favor ones relevant to this team/region' : "[]  // empty: audio not in scope"},
  "sportsNetworks": [{"name": "", "why": ""}],       // 4-6 real sports networks/brands (national + this team's regional/conference network if one exists)
  "relatedAudiences": [{"name": "", "why": ""}]      // 5-7 adjacent buyer audiences that index high with these fans
}

Rules: real brands only; no fabricated services. Keep "why" under 10 words.
Tailor to ${team.name}'s region and to ${league === "pro" ? "NFL" : "college football"} fans.`;
}

async function callOpenAI(payload) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.4,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a precise media-planning assistant. Output only valid JSON. Never invent brands." },
        { role: "user", content: buildPrompt(payload) }
      ]
    })
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content || "{}";
  return JSON.parse(text);
}

app.post("/api/recommendations", async (req, res) => {
  const { league = "college", team: teamName, focus = "audio", scope = "local" } = req.body || {};
  const team = DATA.findTeam(league, teamName);
  if (!team) return res.status(400).json({ error: "Unknown team", aiGenerated: false, recommendations: DATA.fallbackRecommendations(focus) });

  const scopeLabel = DATA.marketForScope(team, scope).label;

  if (!OPENAI_KEY) {
    return res.json({ aiGenerated: false, note: "OPENAI_API_KEY not set — showing curated fallback lists.",
      recommendations: DATA.fallbackRecommendations(focus) });
  }

  try {
    const recommendations = await callOpenAI({ team, league, focus, scope, scopeLabel });
    res.json({ aiGenerated: true, model: OPENAI_MODEL, recommendations });
  } catch (err) {
    console.error("OpenAI call failed:", err.message);
    res.json({ aiGenerated: false, note: "AI service unavailable — showing curated fallback lists.",
      recommendations: DATA.fallbackRecommendations(focus) });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true, ai: !!OPENAI_KEY, model: OPENAI_MODEL }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Stadium to Screen running on :${PORT} (AI ${OPENAI_KEY ? "enabled" : "OFF — fallback"})`));
