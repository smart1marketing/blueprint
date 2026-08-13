# Smart 1 Restaurant Market Intelligence

A multi-step Smart 1 Marketing lead tool for restaurants, bars, and cafes. It creates an AI planning report with:

- Ranked demand-generator and conquest geofences (offices, residential density, hotels, colleges, venues, competitors)
- Estimated target-area population and households
- Low/base/high estimate of likely frequent-diner households
- Trade-area and daypart overview (lunch, happy hour, dinner, delivery)
- Priority districts/market targets
- Audience segments and media-budget allocation, tiered by market size
- Trigger-driven budget plan (dayparts, weather, local events)
- GoHighLevel (GHL) webhook payload
- Branded PDF report stored in Cloudinary

## Important limitation

This version intentionally uses AI planning estimates instead of paid maps, geocoding, census, or foot-traffic APIs. It does not claim live verification. Before media activation, a strategist should verify each physical location and build the final polygons in the advertising platform.

## Project structure

```
smart1restaurant/
├── app.py               # Flask backend + OpenAI report + PDF→Cloudinary + GHL webhook
├── templates/
│   └── index.html       # Self-contained multi-step form (CSS + JS inlined)
├── requirements.txt
├── Procfile
├── render.yaml
├── .env.example
└── .gitignore
```

`index.html` lives in `templates/` because the backend serves it with Flask's
`render_template("index.html")`. The page is intentionally self-contained: all
CSS and JavaScript are inlined, so there are no separate `styles.css` or `app.js`
files to keep in sync. This keeps the form reliable when embedded in the Smart 1 site.

> Do not commit secrets or compiled artifacts (`.env`, `__pycache__/`, `*.pyc`,
> `static/reports/`). They are ignored in `.gitignore`. Edit and deploy `app.py`.

## What changed in this version

- **Webhook env var standardized:** `GHL_WEBHOOK_URL` (replaces `SMART1_WEBHOOK_URL`).
- **PDF storage moved to Cloudinary:** the PDF is rendered in memory and uploaded to
  Cloudinary using `CLOUDINARY_URL`. The `secure_url` is sent to GHL as `report_pdf_url`.
  Uploaded as an `image`/`pdf` asset by default (inline preview + thumbnails); set
  `PDF_RESOURCE_TYPE=raw` if your account restricts image-PDF delivery. Falls back to
  `static/reports/` only if Cloudinary is not configured.
- **Report naming:** PDFs are grouped under the `REPORT_NAME` prefix (default
  `restaurant-market-report`), unique per lead.
- **Embed mode:** `?embed=1` hides the hero and posts `s1-report-ready` to the parent so
  the landing page's branded loader clears immediately.

### New in this release (product/process hardening)

- **True partial lead capture.** `/api/lead` fires as soon as the visitor advances past
  step 1 (restaurant name / website / ZIP) and again on `pagehide` / tab-hidden — no email
  required. Contact-less payloads are forwarded with `report_status: "partial"`; once a
  valid email is entered (or the form is submitted) the same endpoint fires again with
  `report_status: "new"` (at most one send per stage). UTM/click attribution
  (`utm_*`, `gclid`, `fbclid`, `referrer_url`, `landing_page_url`) is merged into every
  payload. The `completed` webhook follows with the report + PDF. All carry the same
  `lead_id` so GHL can correlate/update one opportunity.
- **Download PDF button.** The browser polls `GET /api/report/<id>` after the on-screen
  report renders and swaps in a "Download PDF" button as soon as the background thread
  has uploaded the PDF (the stored report JSON carries `report_pdf_url`).
- **Faster on-screen report.** `/api/analyze` returns the interactive report as soon as the
  model responds; PDF render, Cloudinary upload, JSON persistence, and the completed webhook
  run in a background thread.
- **Abuse / cost protection.** Hidden honeypot field (`company_website`), a minimum
  fill-time check (`MIN_FILL_SECONDS`), and per-IP rate limiting (`RATE_LIMIT_MAX` /
  `RATE_LIMIT_WINDOW_SEC`) guard the paid OpenAI endpoint.
- **OpenAI retry.** One automatic retry on a transient API error or malformed JSON.
- **Single source of truth for packages.** Prices live only in `PACKAGES` in `app.py` and
  are injected into the template — the front-end grid can no longer drift.
- **CORS.** `ALLOWED_ORIGINS` is now honored (`*` or a comma-separated allow-list).
- **Shareable report links.** Each report is persisted to Cloudinary and served read-only at
  `/r/<id>`; that URL is sent to GHL as `report_view_url` (needs `PUBLIC_BASE_URL` set).
- **Illustrative trade-area map.** The report now includes a schematic center-point + priority
  pin diagram (clearly labeled not-to-scale; no paid map APIs).
- **Funnel analytics.** `dataLayer` events push `s1_form_start`, `s1_lead_captured`,
  `s1_report_requested`, `s1_report_viewed`, and `s1_report_error` for GTM.
- **Optional PDF logo.** Set `PDF_LOGO_URL` to draw a logo at the top of the PDF.

### Endpoints

| Route | Purpose |
|---|---|
| `GET /` | The multi-step form |
| `POST /api/lead` | Partial-lead capture (`partial` webhook without contact, `new` with a valid email) |
| `POST /api/analyze` | Generate report; returns immediately, finalizes in background |
| `GET /r/<id>` | Read-only shared report view |
| `GET /api/report/<id>` | JSON for a stored report (used by `/r/<id>`) |
| `GET /health` | Health check |

> **Auto-email the PDF to the lead** is best done as a GHL workflow off the
> `report_pdf_url` field, not in this app.

## Package tiers (market-based)

The AI picks one of four fixed price tiers for each report based on market size, competitive
density, and the number of daypart/occasion opportunities in the restaurant's trade area
(lunch, happy hour, dinner, delivery, events, catering). Prices/names live ONLY in the
`PACKAGES` list in `app.py`; the template's package grid is injected from it at render time
(`window.__PACKAGES__`), so edit `app.py` and the front end stays in sync automatically:

| Package | Monthly Investment | Best fit |
|---|---|---|
| Corner Table | $1,500/month | Single location or small local market |
| Local Favorite | $3,000/month | Established location, balanced lunch/dinner/delivery coverage |
| Regional Draw | $5,500/month | Competitive market or multiple locations, events/catering push |
| Market Leader | $8,500/month | Large or highly competitive metro, maximum share of voice |

## Deploy to GitHub

1. Create a new GitHub repository named `smart1restaurant`.
2. Upload every file and folder in this project. Keep the folder structure intact (especially `templates/`).
3. Do **not** upload a real `.env`, any API key, `__pycache__/`, `*.pyc`, or `static/reports/`.

## Deploy to Render

1. In Render, choose **New + > Blueprint**.
2. Connect the `smart1restaurant` GitHub repository.
3. Render will read `render.yaml`.
4. Add the secret environment variables below.
5. Deploy and test `/health`, then test the full form.

### Render environment variables

| Variable | Required | Notes |
|---|---|---|
| `OPENAI_API_KEY` | Yes | OpenAI key (secret) |
| `OPENAI_MODEL` | No | Defaults to `gpt-4.1-mini` |
| `GHL_WEBHOOK_URL` | Yes | GoHighLevel inbound-webhook URL |
| `CLOUDINARY_URL` | Yes | `cloudinary://<key>:<secret>@<cloud_name>` — stores PDFs + report JSON |
| `REPORT_NAME` | No | Cloudinary folder/prefix; default `restaurant-market-report` |
| `ENABLE_PDF` | No | `1` (default) or `0` to disable PDF generation |
| `PDF_RESOURCE_TYPE` | No | `image` (default, inline preview) or `raw` |
| `PDF_LOGO_URL` | No | Optional logo drawn at top of the PDF |
| `ALLOWED_ORIGINS` | No | CORS; `*` (default) or comma-separated allow-list |
| `MIN_FILL_SECONDS` | No | Min seconds on form before submit is trusted; default `3` |
| `RATE_LIMIT_MAX` | No | Max requests per IP per window; default `12` |
| `RATE_LIMIT_WINDOW_SEC` | No | Rate-limit window seconds; default `60` |
| `PUBLIC_BASE_URL` | Recommended | Powers shareable `/r/<id>` links; also PDF fallback URL |

> **Removed:** `SMART1_WEBHOOK_URL` — replace it with `GHL_WEBHOOK_URL`.

## PDF report (Cloudinary)

Every completed report is rendered to a branded PDF (via `reportlab`, pure Python — no
system libraries) and uploaded to Cloudinary as an `image` asset with `format: pdf` by
default (inline browser preview; set `PDF_RESOURCE_TYPE=raw` for a raw asset) under
`REPORT_NAME/<restaurant-slug>-<timestamp>`. The Cloudinary `secure_url` is sent to GHL
in the webhook as `report_pdf_url` and served to the browser as a "Download PDF" button,
so your team can link or attach it with `{{contact.report_pdf_url}}`. Set `ENABLE_PDF=0`
to turn this off. If `CLOUDINARY_URL` is absent, the app falls back to `static/reports/`
on Render's ephemeral disk (dev/testing only).

## GoHighLevel fields

Recommended custom fields:

- Restaurant Name
- Restaurant Website
- Restaurant ZIP
- Target Radius
- Cuisine Types
- Service Style
- Campaign Objective
- Notes
- Estimated Frequent-Diner Households
- Restaurant Market Summary
- Restaurant Report Status
- Restaurant Report JSON (large text field, optional)

The webhook sends human-readable fields plus `report_json` and `report_pdf_url`. If the
inbound webhook ignores nested or large data, map the summary, PDF URL, and
estimated-household fields first and store the full report in a large-text custom field.

## Embed on smart1marketing.com

Embed the tool inline on the restaurant gameplan page with an iframe pointing at the Render
URL with `?embed=1`:

```html
<iframe
  src="https://smart1restaurant.onrender.com/?embed=1"
  style="width:100%;min-height:1200px;border:0;border-radius:12px;"
  loading="lazy"
  title="Restaurant Market Intelligence">
</iframe>
```

- **Page to embed on:** `https://smart1marketing.com/restaurant-weather-marketing-gameplan`
- `?embed=1` hides the tool's hero so it doesn't duplicate the landing page headline, and
  signals the landing page's branded loader to clear as soon as the form is ready.

Using an iframe keeps the JavaScript and API request on the same Render domain and avoids
cross-origin and code-block restrictions.

## Test locally

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python app.py
```

Open `http://localhost:5000`.

## Demand-trigger targeting

The form supports a trigger-driven plan built around dayparts (lunch, happy hour, dinner,
delivery), weather (heat/patio, rain/comfort-food, cold snaps, first snow), and local demand
signals (home-team game nights, local events, holiday weekends). Reports include suggested
conditions, activation actions, applicable non-social tactics, and a budget-efficiency
explanation. Social advertising and paid search are intentionally excluded from recommendations.
