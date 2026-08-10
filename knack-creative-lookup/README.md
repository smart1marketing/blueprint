# Client Lookup (Smart 1 Marketing)

Prebuilt static app, six sections via the top buttons. One data file
(build/data/products.json) powers them all.

## Sections
1. Client Lookup — creative IO folders (5-across), current year open, prior
   years lazy accordions, PDF/Drive/Dropbox/file placeholders. Excludes SEM,
   Website SEO/Listings, Email Blast.
2. Salesperson Lookup — by field_2496/2655; grid/table toggle; churn section;
   Overview + IO Detail CSV.
3. Partner Lookup — same, by field_2307.
4. Live Products — status = Live, grouped by IO, monthly + contract totals.
5. Dashboards — one card per client with a dashboard URL (field_2978); click to
   open; Dashboards CSV export.
6. QA Report — active clients with NO dashboard (new); products that ran last
   month but aren't live this month by salesperson and partner; lost/gained
   totals; salesperson + partner scorecards; CSV exports.

## Current seed
10,390 products · 495 clients · 74 salespeople · 48 partners · 395 live ·
336 client dashboards · 56 active clients missing a dashboard ($157,728/mo).

## Refresh (seed now, refresh later)
  REACT_APP_KNACK_API_KEY=xxx REACT_APP_KNACK_APP_ID=yyy npm run refresh
  git add build/data/products.json && git commit -m "refresh" && git push
Server-side only (local or GitHub Action) — Knack blocks browser calls.

## Deploy
Push to main; Render serves the prebuilt folder. No build step, no OOM.
