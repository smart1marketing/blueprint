# Creative Lookup

Pre-built React app served as static files. Render runs `serve -s build`.

## What's here (this is the entire repo — nothing else is needed)
- `build/` — the compiled app and `build/data/campaigns.json` (10,491 campaigns, 550 clients)
- `render.yaml` — deploy config (no build step; serves the prebuilt folder)
- `package.json` — only dependency is `serve`

## Verify the data
`build/data/campaigns.json` must start with:
`{"recordCount":10491,"clientCount":550,...`
If it says `clientCount:2`, it's the old broken file.

## Deploy
Push to `main`; Render auto-deploys. First load may take ~30s on free tier.
