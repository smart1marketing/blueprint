# Smart 1 Restaurant Market Intelligence

A multi-step Smart 1 Marketing lead tool for restaurants, bars, and cafes. It creates an AI planning report with:

- Ranked demand-generator and conquest geofences (offices, residential density, hotels, colleges, venues, competitors)
- Estimated target-area population and households
- Low/base/high estimate of likely frequent-diner households
- Trade-area and daypart overview (lunch, happy hour, dinner, delivery)
- Priority districts/market targets
- Audience segments and media-budget allocation, tiered by market size
- Trigger-driven budget plan (dayparts, weather, local events)
- Smart 1 Suite webhook payload
- Print-to-PDF report

## Important limitation

This version intentionally uses AI planning estimates instead of paid maps, geocoding, census, or foot-traffic APIs. It does not claim live verification. Before media activation, a strategist should verify each physical location and build the final polygons in the advertising platform.

## Project structure

```
smart1restaurant/
├── app.py               # Flask backend + OpenAI report generation + webhook
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
files to keep in sync. This keeps the form reliable when embedded in Smart 1 Suite.

> Do not commit compiled artifacts (`__pycache__/`, `*.pyc`). They are ignored in
> `.gitignore`. Edit and deploy `app.py`, not any compiled `.pyc`.

## Package tiers (market-based)

The AI picks one of four fixed price tiers for each report based on market size, competitive
density, and the number of daypart/occasion opportunities in the restaurant's trade area
(lunch, happy hour, dinner, delivery, events, catering). These live in the `SMART 1 PACKAGE MENU`
inside `app.py` — edit the prices/names there, not in the front end, then update the matching
`PACKAGES` array in `templates/index.html` so the package grid stays in sync:

| Package | Monthly Investment | Best fit |
|---|---|---|
| Corner Table | $1,500/month | Single location or small local market |
| Local Favorite | $3,000/month | Established location, balanced lunch/dinner/delivery coverage |
| Regional Draw | $5,500/month | Competitive market or multiple locations, events/catering push |
| Market Leader | $8,500/month | Large or highly competitive metro, maximum share of voice |

## Deploy to GitHub

1. Create a new GitHub repository named `smart1restaurant`.
2. Upload every file and folder in this project. Keep the folder structure intact (especially `templates/`).
3. Do not upload a real `.env` file or API key.

## Deploy to Render

1. In Render, choose **New + > Blueprint**.
2. Connect the `smart1restaurant` GitHub repository.
3. Render will read `render.yaml`.
4. Add the secret environment variable `OPENAI_API_KEY`.
5. Add `SMART1_WEBHOOK_URL` for the Smart 1 Suite inbound webhook.
6. Add `PUBLIC_BASE_URL` = your live Render URL (e.g. `https://smart1restaurant.onrender.com`) so the report PDF links are absolute.
7. Keep `OPENAI_MODEL` at the default or change it to a model available in your OpenAI account.
8. Deploy and test `/health`, then test the full form.

## PDF report

Every completed report is rendered to a branded PDF (via `reportlab`, pure
Python — no system libraries needed) and written to `static/reports/`. The
public URL is sent to Smart 1 Suite in the webhook as `report_pdf_url`, so your
team can link or attach it with `{{contact.report_pdf_url}}`. Set `ENABLE_PDF=0`
to turn this off. On Render's ephemeral disk the files persist for the life of
the instance; for permanent archival, upload the bytes to S3 or the GHL Media
Library inside `build_report_pdf()`.

## Smart 1 Suite fields

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

The webhook sends human-readable fields plus `report_json`. If the Suite webhook ignores nested or large data, map the summary and estimated-household fields first and store the full report externally or in a large-text custom field.

## Embed on Smart 1 Suite

The easiest reliable method is an iframe pointing to the Render URL:

```html
<iframe
  src="https://YOUR-RENDER-URL.onrender.com/"
  style="width:100%;min-height:1200px;border:0;border-radius:12px;"
  loading="lazy"
  title="Restaurant Market Intelligence">
</iframe>
```

Using an iframe keeps the JavaScript and API request on the same Render domain and avoids cross-origin and code-block restrictions inside Smart 1 Suite.

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
explanation. Social advertising and paid search are intentionally excluded from recommendations,
matching the boat dealer tool's channel strategy.
