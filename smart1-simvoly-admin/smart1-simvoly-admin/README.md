# Smart 1 Sites Admin v3

Admin portal for Smart 1 Sites / Simvoly reseller management using the official Platform Management API.

## What changed from v2

- Official API base defaults to `https://api.smart1sites.com`.
- `/api/v1/*` calls authenticate with `X-CLIENT-KEY`.
- SSO uses `Authorization: Bearer <Platform API Key>` as documented.
- POST bodies are form-encoded, not JSON.
- Endpoint paths are built into the application instead of being Render environment variables.
- Plans and templates sync directly from the official Platform API.
- Project details and project websites refresh through official endpoints.
- Add Site supports template, branding, personalization tags, and optional plan activation.
- Suspend / reactivate / cancel use the official project status endpoint.
- Domain connect/disconnect and personalization tag updates are supported.
- SSO can open a customer's builder session.
- Existing reseller-wide inventory can be imported from the reseller management-panel `list-projects` JSON without storing browser cookies.
- Customer-specific project discovery uses the official `/api/v1/projects` endpoint.

## Important API limitation

The supplied Simvoly documentation defines `GET /api/v1/projects` as **customer-scoped** and requires `externalCustomerId`, `userId`, or `customerEmail`. It does not document a reseller-wide endpoint that lists every existing project.

For the existing Smart 1 portfolio, use **Inventory → Import Existing Portfolio** to seed project IDs from the reseller management-panel JSON response. Once a project ID is in the local registry, Smart 1 Sites Admin uses the official Platform API for project details, websites, lifecycle actions, domain actions, etc.

## Render settings

Build command:

```bash
pip install -r requirements.txt
```

Start command:

```bash
gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --threads 4 --timeout 60
```

Health check:

```text
/health
```

Persistent disk mount:

```text
/opt/render/project/src/data
```

Database environment variable:

```text
DATABASE_PATH=/opt/render/project/src/data/smart1_sites.sqlite3
```

## Required Render environment variables

```text
PYTHON_VERSION=3.12.8
SECRET_KEY=<long random secret>
ADMIN_USERNAME=smart1admin
ADMIN_PASSWORD=<strong password>
FLASK_ENV=production
DATABASE_PATH=/opt/render/project/src/data/smart1_sites.sqlite3
SIMVOLY_API_BASE_URL=https://api.smart1sites.com
SIMVOLY_API_KEY=<your platform API key>
MOCK_MODE=false
ENABLE_WRITE_ACTIONS=false
USE_BG_AS_PLATFORM_COST=false
```

Do not put the API key in GitHub.

## Safe launch sequence

1. Deploy with `ENABLE_WRITE_ACTIONS=false`.
2. Log in and press **Sync Platform Catalog**. Plans/templates should populate.
3. Import existing project inventory or use customer discovery.
4. Open a project and press **Refresh from Simvoly** to verify project/site details.
5. Only after read-only behavior is confirmed, set `ENABLE_WRITE_ACTIONS=true`.

## Official endpoints implemented

Read/catalog:
- `GET /api/v1/plans`
- `GET /api/v1/templates`
- `GET /api/v1/projects?customerEmail=...` (or `userId` / `externalCustomerId`)
- `GET /api/v1/projects/{projectId}`
- `GET /api/v1/projects/{projectId}/websites`
- `GET /api/v1/projects/{projectId}/websites/{websiteId}`
- `GET /api/v1/website/{websiteId}/check-limits?planId=...`

Provisioning / users:
- `POST /api/v1/website`
- `POST /api/v1/website/add`
- `POST /api/v1/website/assign`
- `POST /api/v1/website/unassign`
- `POST /api/v1/users`
- `POST /api/v1/users/search`
- `GET /api/v1/users/{userId}`
- `DELETE /api/v1/users/{userId}`

Lifecycle / domains / personalization:
- `POST /api/v1/projects/{id}/set-status`
- `POST /api/v1/projects/{id}/activate`
- `POST /api/v1/projects/{id}/set-addon`
- `POST /api/v1/website/{id}/set-status`
- `POST /api/v1/website/{id}/connect-domain`
- `POST /api/v1/website/{id}/disconnect-domain`
- `POST /api/v1/website/{id}/set-personalization-tags`

SSO:
- `POST /api/platform/session`
