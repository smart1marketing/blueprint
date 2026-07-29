# Stadium to Screen — proposal builder + lead capture

Landing page + proposal generator for Smart 1 Marketing's college & pro football
audio/CTV packages. An advertiser picks a team, scope, and channel focus; gets a
sized proposal; then submits the "Get your full proposal" form.

## Flow

```
Widget (on smart1marketing.com)  →  POST {BACKEND_URL}/api/lead  →  this Render app
                                                                     ├─ builds the "company-stadium-report" PDF
                                                                     ├─ uploads it to Cloudinary (CLOUDINARY_URL)
                                                                     └─ forwards lead + pdfUrl → GHL_WEBHOOK_URL
```

Audience numbers are computed in the browser from `public/data.js` (deterministic,
from market data — not AI). The server only: (1) proxies OpenAI for the recommendation
lists, and (2) handles lead capture → PDF → Cloudinary → GHL.

## Endpoints

- `GET  /api/health` — reports whether AI / Cloudinary / GHL are configured
- `POST /api/recommendations` — OpenAI-matched media lists (falls back if no key)
- `POST /api/lead` — builds the PDF, stores it in Cloudinary, forwards to GHL

## Environment variables (set in Render)

| Variable | Required | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | for AI lists | OpenAI key (falls back to curated lists if absent) |
| `OPENAI_MODEL` | no | default `gpt-4o-mini` |
| `GHL_WEBHOOK_URL` | for lead capture | GoHighLevel Inbound Webhook URL (leads are forwarded here) |
| `CLOUDINARY_URL` | for PDF storage | `cloudinary://api_key:api_secret@cloud_name` |
| `ALLOWED_ORIGIN` | no | CORS origin; default `*` (can set to `https://smart1marketing.com`) |
| `PORT` | no | set automatically by Render |

> **Cloudinary note:** new Cloudinary accounts block PDF delivery by default.
> Enable **Settings → Security → "Allow delivery of PDF and ZIP files"** so the
> stored report URL is viewable. The report is saved under the
> `company-stadium-reports/` folder as `company-stadium-report-<timestamp>.pdf`.

## Local run

```bash
npm install
cp .env.example .env     # fill in your keys
npm start                # http://localhost:3000
```

Missing keys degrade gracefully: no OpenAI key → curated lists; no Cloudinary → PDF
isn't stored; no GHL URL → lead isn't forwarded. `/api/health` shows what's live.

## Deploy: GitHub → Render

1. Push this folder to a GitHub repo.
2. Render → **New + → Blueprint**, connect the repo (reads `render.yaml`).
3. In the service's **Environment** tab, paste the secret values:
   `OPENAI_API_KEY`, `GHL_WEBHOOK_URL`, `CLOUDINARY_URL`.
4. Deploy. Check `/api/health` → `ai/cloudinary/ghl` should be `true`.

## Files

```
server.js            Express: static site + /api/recommendations + /api/lead
lib/pdf.js           PDF report generator (pdfkit)
public/index.html    Landing page + proposal builder (also the embeddable widget)
public/data.js       Teams, market data, audience model (server + reference)
render.yaml          Render blueprint
.env.example         Env template
```
