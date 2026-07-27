# Smart 1 Sites Admin v2

## What changed
- Local SQLite cache so the dashboard does not make 21 Simvoly calls every page load.
- Project + plan synchronization with pagination.
- Search by project name, domain, project ID, website ID.
- Filters by status, plan and partner.
- Active / Trial / Expired metrics and alerts.
- On-demand project-detail refresh for website ID, domain and subdomain.
- Real plan catalog fields: monthly, annual, base plan, pages, storage, bandwidth, contributors and products.
- Smart 1 client price, actual platform cost, partner, internal client name and notes.
- Add / Suspend / Reactivate / Cancel routes behind a safety switch.

## Render
Build: `pip install -r requirements.txt`

Start: `gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --threads 4 --timeout 60`

Health: `/health`

Disk mount: `/var/data`

## Upgrade safely
The app upgrades the original prototype metadata table in place, so you can keep `DATABASE_PATH=/var/data/smart1_sites.sqlite3`. Back up the disk/database before the first v2 deploy.
Keep `MOCK_MODE=true` and `ENABLE_WRITE_ACTIONS=false`, deploy, log in, and click **Sync Simvoly** to seed the realistic demo data.

For live read-only use, rotate any API credentials previously pasted/shared, place the replacement only in Render, then fill the verified White Label Platform API base URL and endpoint paths. The JSON defaults already match the responses you captured: plans at `data`, projects at `data.items`, and page count at `data.pagesCount`.

The captured management-panel URLs are session/CSRF authenticated. Do not copy browser cookies into Render. Use the Platform API key and documented Platform API paths.

## Write actions
Only after create/suspend/reactivate/cancel endpoint paths and payloads are verified, populate their environment variables and set `ENABLE_WRITE_ACTIONS=true`.

## Pricing note
`monthlyPrice` / `yearlyPrice` are catalog pricing. `bgMonthlyPrice` is displayed as a reference only. The app does not assume it is wholesale cost unless you explicitly set `USE_BG_AS_PLATFORM_COST=true`.
