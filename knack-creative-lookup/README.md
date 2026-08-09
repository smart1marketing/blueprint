# Creative Lookup + Live Products (Smart 1 Marketing)

Prebuilt static app served by `serve -s build`.

## Two tabs (top-right menu)
1. **Creatives** — IO folders (5-across), current year open, prior years in
   lazy accordions, PDF/Drive/Dropbox/file placeholders, SEM+SEO+Email Blast
   excluded.
2. **Live Products** — every product with Knack status = Live, grouped by IO
   with monthly + contract budget, and top-line totals.

## Seeded data (build/data/)
- `campaigns.json` — 7,854 creatives / 495 clients / 1,616 IOs
- `live_products.json` — 395 live products / 129 clients / 145 IOs
  - Monthly budget total: $378,035
  - Contract value total: $2,127,314
  First chars must read: {"liveCount":395,...

## Refreshing Live Products (seed now, refresh later)
The seed is already in the repo. To pull fresh Live data from Knack:

    REACT_APP_KNACK_API_KEY=xxx REACT_APP_KNACK_APP_ID=yyy npm run refresh-live
    git add build/data/live_products.json && git commit -m "refresh live" && git push

This runs server-side (locally or a GitHub Action) — it can't run from the
browser because Knack blocks cross-origin calls and the API key must stay
private. Ask me to add a nightly GitHub Action if you want it automated.

## Deploy
Push to main; Render serves the prebuilt folder. No build step, no OOM.
