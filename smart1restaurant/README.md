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
  Cloudinary using `CLOUDINARY_URL`. The returned `secure_url` is sent to GHL as
  `report_pdf_url`. If `CLOUDINARY_URL` is not set, it falls back to writing
  `static/reports/` (local dev only).
- **Report naming:** PDFs are stored under the `REPORT_NAME` folder/prefix
  (default `restaurant-market-report`) as `restaurant-market-report/<slug>-<timestamp>.pdf`,
  so each lead's report is unique and grouped together.
- **Embed mode:** loading the tool with `?embed=1` hides the hero (headline + intro)
  so it drops straight into the form when embedded on the landing page, and posts
  `s1-report-ready` to the parent so the page's branded loader clears immediately.

## Package tiers (market-based)

The AI picks one of four fixed price tiers for each report based on market size, competitive
density, and the number of daypart/occasion opportunities in the restaurant's trade area
(lunch, happy hour, dinner, delivery, events, catering). These live in the `SMART 1 PACKAGE MENU`
inside `app.py` — edit the prices/names there, then update the matching `PACKAGES` array in
`templates/index.html` so the package grid stays in sync:

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
| `CLOUDINARY_URL` | Yes | `cloudinary://<key>:<secret>@<cloud_name>` — stores the PDFs |
| `REPORT_NAME` | No | Cloudinary folder/prefix; default `restaurant-market-report` |
| `ENABLE_PDF` | No | `1` (default) or `0` to disable PDF generation |
| `ALLOWED_ORIGINS` | No | CORS; default `*` |
| `PUBLIC_BASE_URL` | No | Fallback public URL only if Cloudinary is not configured |

> **Removed:** `SMART1_WEBHOOK_URL` — replace it with `GHL_WEBHOOK_URL`.

## PDF report (Cloudinary)

Every completed report is rendered to a branded PDF (via `reportlab`, pure Python — no
system libraries) and uploaded to Cloudinary as a `raw` asset under
`REPORT_NAME/<restaurant-slug>-<timestamp>.pdf`. The Cloudinary `secure_url` is sent to GHL
in the webhook as `report_pdf_url`, so your team can link or attach it with
`{{contact.report_pdf_url}}`. Set `ENABLE_PDF=0` to turn this off. If `CLOUDINARY_URL` is
absent, the app falls back to `static/reports/` on Render's ephemeral disk (dev/testing only).

## GoHighLevel fields

Recommended custom fields:

- Restaurant Name
- Restaurant Website
- Restaurant ZIP
- Target Radius
- Cuisine Types
- Service Style
- Campaign Objective
- Monthly Budget
- Known Competitors
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
