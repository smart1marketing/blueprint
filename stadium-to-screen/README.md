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
- `POST /api/partial-lead` — salvages abandoned sessions: the widget fires this
  (via `sendBeacon`) when the report step is reached and again on page hide,
  sending whatever is known so far (team/scope/focus plus any filled fields such
  as `company_website`, `name`, `email`, `company`). No validation beyond the
  honeypot; forwarded to GHL with `report_status: "partial"` + `lead_id` and
  stored with `stage: "partial"`. Uses its own light rate bucket.
- `POST /api/lead` — builds the PDF, stores it in Cloudinary, forwards to GHL.
  Includes the same `lead_id` as the partial submission so GHL can merge the
  records, and the new `company_website` field from the unlock form.

## Environment variables (set in Render)

| Variable | Required | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | for AI lists | OpenAI key (falls back to curated lists if absent) |
| `OPENAI_MODEL` | no | default `gpt-4o-mini` |
| `GHL_WEBHOOK_URL` | for lead capture | GoHighLevel Inbound Webhook URL (leads are forwarded here) |
| `CLOUDINARY_URL` | for PDF storage | `cloudinary://api_key:api_secret@cloud_name` |
| `ALLOWED_ORIGIN` | no | CORS origin; default `*` (can set to `https://smart1marketing.com`) |
| `ADMIN_TOKEN` | for /leads | long random token for the leads dashboard (sent via `x-admin-token` header) |
| `STORE_PUBLIC_ID` | recommended | Cloudinary raw JSON id for the lead store (see security note below) |
| `NOTIFY_WEBHOOK_URL` / `SMTP_URL` / `MAIL_FROM` | no | rep notification / prospect email |
| `REP_NAME` / `REP_EMAIL` / `REP_PHONE` / `CALENDAR_URL` | no | strategist block + book-a-call |
| `PORT` | no | set automatically by Render |

> **SECURITY — lead store exposure:** captured leads are mirrored to a
> Cloudinary **raw JSON file that is publicly readable** at
> `https://res.cloudinary.com/<cloud>/raw/upload/<STORE_PUBLIC_ID>`. The id
> defaults to `stadium-leads/leads-store.json`, which is guessable — set
> `STORE_PUBLIC_ID` to a long random value (e.g.
> `stadium-leads/leads-store-9f3a1c77d2e64b0a.json`) so the URL is not
> discoverable. For real PII protection, move the store to a database.

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

## Leads dashboard (outside GHL)

Every captured lead is also stored (mirrored to a Cloudinary raw JSON file so it
survives restarts) and viewable at **`/leads`** — a private page listing all leads
with contact + proposal detail, PDF links, search, and CSV export.

- Set **`ADMIN_TOKEN`** in Render to a long random string, then open
  `https://<your-app>.onrender.com/leads` and enter that token.
- Without `ADMIN_TOKEN` the dashboard and its API are disabled (returns 503) so
  the PII is never exposed by default.
- The `/api/leads` endpoint requires the token via the `x-admin-token` header.
- If `CLOUDINARY_URL` is missing, leads are kept in memory only (reset on restart)
  — the dashboard shows a warning in that case.

> This is a lightweight token gate for an internal view. For stronger security or
> higher volume, move lead storage to a database and put SSO in front of `/leads`.

## Conversion + reliability features

- **Estimates shown as ranges** (±12%) on the proposal and PDF — no false precision.
- **Book a strategy call** button appears on unlock when `CALENDAR_URL` is set (server also emails/attaches the PDF).
- **Auto-email the prospect** their PDF via `SMTP_URL` + `MAIL_FROM` (skipped gracefully if unset).
- **Instant rep notification** to Slack or any webhook via `NOTIFY_WEBHOOK_URL`.
- **Abuse protection:** hidden honeypot field + in-memory rate limits (`/api/lead` 8 / 10 min, `/api/recommendations` 30 / 10 min per IP).
- **Cold-start UX:** the widget shows a "waking up the server…" message on slow first loads. For a true fix, point an uptime pinger (UptimeRobot / cron-job.org) at `/api/health` every ~10 min.
- **Funnel analytics:** GTM `dataLayer` events fire on `proposal_built`, `unlock_started`, `lead_submitted`, `report_downloaded`, `book_call_clicked`.
- **Dashboard analytics:** `/leads` shows most-requested teams, package breakdown, and a date-range filter.

## Files

```
server.js            Express: static site + /api/recommendations + /api/lead
lib/pdf.js           PDF report generator (pdfkit)
public/index.html    Landing page + proposal builder (also the embeddable widget)
public/data.js       Teams, market data, audience model (server + reference)
render.yaml          Render blueprint
.env.example         Env template
```
