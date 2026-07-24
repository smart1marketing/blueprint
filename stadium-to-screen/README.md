# Stadium to Screen — Proposal Builder

Landing page + proposal generator for Smart 1 Marketing's college & pro football
audio/CTV packages. An advertiser picks a team, targeting scope, and channel
focus; the page returns audience sizing plus a matched media plan.

## How it's built (and why)

| Part | Where it runs | Source of truth |
|---|---|---|
| **Audience numbers** (fan base, households, phones/computers/tablets/CTV, matchable audience) | **Browser**, computed from `public/data.js` | Baseline market data + transparent, editable multipliers. **Not** AI. |
| **Recommendation lists** (streaming services, podcasts, sports networks, related audiences) | **Server** → OpenAI API | `gpt-4o-mini` (configurable), with a curated fallback |

The **only** reason for a server is to hold the OpenAI key so it's never exposed
in the browser. The server does not invent audience sizes — the LLM only
produces the qualitative lists.

> ⚠️ **Verify before launch.** The DMA household counts and state populations in
> `public/data.js` are approximate. Replace them with current **Nielsen DMA** and
> **Census** figures. The device multipliers, match rate, and fan-penetration
> rates are industry-average planning assumptions — tune them to your own data.
> Everything editable lives at the top of `public/data.js`.

## Local run

```bash
npm install
cp .env.example .env        # paste your real OPENAI_API_KEY
npm start                   # http://localhost:3000
```

No key? It still runs — the recommendation lists just use the curated fallback.

## Deploy: GitHub → Render → OpenAI

1. **GitHub** — push this folder to a new repo:
   ```bash
   git init && git add . && git commit -m "Stadium to Screen"
   git branch -M main
   git remote add origin https://github.com/<you>/stadium-to-screen.git
   git push -u origin main
   ```
2. **Render** — go to [render.com](https://render.com) → **New +** → **Blueprint**,
   connect the repo. Render reads `render.yaml` and creates the web service.
   (Or **New + → Web Service**, build `npm install`, start `npm start`.)
3. **OpenAI key** — get a key at [platform.openai.com](https://platform.openai.com/api-keys).
   In Render → your service → **Environment** → add:
   - `OPENAI_API_KEY` = your key
   - `OPENAI_MODEL` = `gpt-4o-mini` (or another chat model you can access)
4. **Deploy.** Render gives you a public URL. Check `/api/health` to confirm the
   key is detected (`"ai": true`).

## Files

```
server.js            Express: static site + POST /api/recommendations (OpenAI proxy)
public/index.html    Landing page + proposal builder
public/data.js       Teams, market data, multipliers, audience model (edit here)
render.yaml          Render blueprint
.env.example         Env template
```

## Editing the data

- **Add/adjust teams** → `COLLEGE` / `PRO` arrays in `public/data.js`
  (`[name, city, venue, state, dmaKey]`).
- **Fix market sizes** → `DMA_HOUSEHOLDS` and `STATES` tables.
- **Tune the model** → `DEVICE_PER_HH`, `MATCH_RATE`, `FAN_PENETRATION` at the top.
- **Change AI behavior** → the prompt in `server.js` (`buildPrompt`).
