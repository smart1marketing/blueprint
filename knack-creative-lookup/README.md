# Creative Lookup (Smart 1 Marketing)

Prebuilt React app served as static files (Render runs `serve -s build`).

## What this version does
- Excludes products: Search Engine Marketing (PPC), Website SEO/Listings, Email Blast
- Most-recent-first; current year (2026) + future shown open
- Prior years (2025, 2024, 2023...) in lazy accordions that load on open
- Results grouped into **IO-number folders**, 5 across; click a folder for detail
- Creative previews: real image when available, else a PDF / Google Drive /
  Dropbox / generic-file (?) SVG placeholder based on the link
- Smart 1 brand colors (green + charcoal)

## Data
`build/data/campaigns.json` — 7,854 creatives, 495 clients, 1,616 IO folders.
First chars must read: {"recordCount":7854,"clientCount":495,"ioCount":1616,...

## Adjust brand colors
Colors are CSS variables. If the green/charcoal are off, they're compiled into
`build/static/css/main.*.css` — search for `--s1-green` and replace the hex.
(Or tell me the exact hex codes and I'll rebuild.)

## Deploy
Push to main; Render serves the prebuilt folder. No build step, no OOM.
