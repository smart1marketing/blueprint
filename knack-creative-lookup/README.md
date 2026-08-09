# Client Lookup (Smart 1 Marketing)

Prebuilt static app, served by `serve -s build`. Five sections via the buttons
top-right; one data file (`build/data/products.json`) powers them all.

## Sections
1. **Client Lookup** — creative IO folders (5-across), current year open, prior
   years in lazy accordions, PDF/Drive/Dropbox/file placeholders. Excludes
   Search Engine Marketing, Website SEO/Listings, Email Blast.
2. **Salesperson Lookup** — pick a salesperson (field_2496/2655); IO folder grid
   with a Grid/Table toggle; "live last month, not this month" churn section;
   Overview CSV + IO Detail CSV export.
3. **Partner Lookup** — same as above but by partner (field_2307).
4. **Live Products** — products with Knack status = Live, grouped by IO with
   monthly + contract budget and top-line totals.
5. **QA Report** — products that ran last month but aren't live this month, by
   salesperson and by partner; total lost billing; salesperson and partner
   scorecards (lost / gained / net; unchanged rows omitted); scorecard CSV.

## Field mapping (from your Knack export)
- Client field_2308 · Salesperson field_2496/2655 · Partner field_2307
- Product field_2775/2327 · IO field_2469 · Status field_2300
- Monthly budget field_2338 · Contract field_2339
- Flight start field_2299 · Flight end field_2313 (verified: monthly × months = contract)
- Creative link extracted from field_2409/2427/3422/3425/3426/3427

"Live last month vs this month" is computed from the flight window (start→end)
overlapping each month — so it works from a single export, no history needed.

## Seed now, refresh later
Seed is in the repo. To refresh from Knack (recomputes month flags off the run date):

    REACT_APP_KNACK_API_KEY=xxx REACT_APP_KNACK_APP_ID=yyy npm run refresh
    git add build/data/products.json && git commit -m "refresh" && git push

Runs server-side only (local or GitHub Action) — Knack blocks browser calls and
the API key must stay private. Ask me to add a nightly GitHub Action to automate it.

## Current seed
10,390 products · 495 clients · 74 salespeople · 48 partners · 395 live.
Month-over-month: 188 lost ($189,119/mo), 51 gained ($37,002/mo).

## Deploy
Push to main; Render serves the prebuilt folder. No build step, no OOM.
