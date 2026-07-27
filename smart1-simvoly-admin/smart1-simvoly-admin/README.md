# Smart 1 Simvoly Admin

A small internal Flask application for managing Smart 1's Simvoly white-label reseller projects.

## What it does

- Lists Simvoly projects/sites in one dashboard.
- Shows status, plan, estimated Simvoly wholesale cost, Smart 1 client price, and gross margin.
- Adds a new user + project/site through the Simvoly Platform API.
- Suspends, reactivates, or cancels a project through configurable API actions.
- Stores Smart 1 retail pricing and internal notes in SQLite.
- Includes a safe demo mode so the UI can be deployed before Simvoly API paths are entered.
- Keeps the Simvoly connector isolated so Smart 1 Suite can be integrated later.

## Important Simvoly API note

Simvoly publicly confirms white-label Platform API functions such as creating users, deleting users, retrieving users, setting a website subdomain on creation, and activating projects. However, the white-label Platform API endpoint paths and payload schemas are supplied to white-label partners and are not fully public.

For that reason, this repository does **not invent endpoint URLs**. Enter the exact endpoint paths and request body field names from the Platform API documentation tied to your reseller account.

## Local setup

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
cp .env.example .env
flask --app app run --debug
```

Open `http://127.0.0.1:5000`.

Demo login is whatever you set in `.env` under `ADMIN_USERNAME` and `ADMIN_PASSWORD`.

## Connect Simvoly

In `.env` or Render environment variables:

1. Set `MOCK_MODE=false`.
2. Set `SIMVOLY_API_BASE_URL`.
3. Set `SIMVOLY_API_KEY`.
4. Confirm the auth header/prefix.
5. Enter the Platform API paths:
   - `SIMVOLY_LIST_PROJECTS_PATH`
   - `SIMVOLY_CREATE_USER_PATH`
   - `SIMVOLY_CREATE_PROJECT_PATH`
   - `SIMVOLY_SUSPEND_PROJECT_PATH`
   - `SIMVOLY_REACTIVATE_PROJECT_PATH`
   - `SIMVOLY_CANCEL_PROJECT_PATH`
6. Adjust method variables if an endpoint uses PUT/PATCH/DELETE rather than POST.
7. Adjust JSON body templates to exactly match Simvoly's docs.
8. Adjust list-response mappings if project fields use different names.

Path variables may use `{project_id}`. Example only:

```text
SIMVOLY_SUSPEND_PROJECT_PATH=/YOUR/DOCUMENTED/PATH/{project_id}/YOUR-ACTION
```

Do not use that example as an actual Simvoly endpoint.

## Pricing

Set your current white-label tier:

```text
SIMVOLY_WL_TIER=basic
# or advanced
# or ultimate
```

The app includes public July 2026 additional-project prices as defaults:

| Project | Basic | Advanced | Ultimate |
|---|---:|---:|---:|
| Starter | $8/mo | $7/mo | $5/mo |
| Premium | $25/mo | $22/mo | $15/mo |
| Elite | $55/mo | $50/mo | $35/mo |
| Ultimate | $195/mo | $180/mo | $100/mo |

Your contracted pricing may differ. Override any value in Render:

```text
SIMVOLY_COST_STARTER=7.00
SIMVOLY_COST_PREMIUM=22.00
SIMVOLY_COST_ELITE=50.00
SIMVOLY_COST_ULTIMATE=180.00
```

Optional default Smart 1 retail prices:

```text
SMART1_PRICE_STARTER=99
SMART1_PRICE_PREMIUM=199
SMART1_PRICE_ELITE=299
SMART1_PRICE_ULTIMATE=499
```

Retail price can also be overridden per project in the app.

## GitHub

Create a repository such as `smart1-simvoly-admin`, then upload all files in this folder while preserving `templates/` and `static/`.

Recommended commands:

```bash
git init
git add .
git commit -m "Initial Smart 1 Simvoly admin"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

Never commit `.env` or your Simvoly API key.

## Render deployment

### Easiest: Blueprint

1. In Render choose **New > Blueprint**.
2. Connect the GitHub repository.
3. Render reads `render.yaml`.
4. Enter `ADMIN_PASSWORD` when prompted.
5. Deploy first in `MOCK_MODE=true`.
6. Add the Simvoly environment variables after confirming your Platform API docs.
7. Set `MOCK_MODE=false` and redeploy.

### Manual Web Service

- Runtime: Python
- Build command: `pip install -r requirements.txt`
- Start command: `gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --threads 4 --timeout 60`
- Health check: `/health`

Add a persistent disk mounted at `/var/data` if you want client price overrides and internal notes retained across deploys.

## Safety behavior

- Every write action is POST-only and CSRF protected.
- Cancellation requires typing `CANCEL`.
- API errors are shown without pretending the action succeeded.
- API key is server-side only.
- Demo mode performs no Simvoly changes.

## Later: Smart 1 Suite

The next version can accept Suite webhooks for closed-won website orders and push Simvoly project ID, plan, site status, domain, cost, and launch status back into custom fields.
