# Smart 1 Suite — Control Panel

A simplified control panel for creating, looking up, and deleting Smart 1 Suite
(GoHighLevel / LeadConnector) sub-accounts through the API.

**What it does**

- Create a sub-account from a short form (only the name is required)
- Optionally pre-load a **snapshot / template** into each new account
- Optionally create a **login user** for the client in the same step
- **Auto-fill from the client's website** via Brandfetch — enter a domain and it populates the company name, website, city, state, country, social links, and logo onto the form, all of which are written to the new GHL account. Since GHL's create-account API doesn't accept a logo, the panel uploads the logo into the new sub-account's GHL media library and then sets it as the business logo right after the account is created (falling back to the source URL if the media upload can't complete). (Brand colors and description are shown in the preview for reference — GHL has no field for those.)
- **Search / list** existing accounts and **export the list to CSV**
- **Delete** accounts with a typed-name confirmation and a Twilio-cleanup warning
- **Duplicate-name warning** before create — if a similar-named account already exists, you're asked to confirm rather than silently creating a second one
- **Double-submit protection** — a double-click or a resubmit after a slow/timed-out request can't create two accounts for the same attempt
- **Activity log** — every login, account creation, and deletion is recorded with who did it and when, viewable in-app and exportable to CSV
- **Login attempt limiting** — the shared password locks out after repeated failures instead of being brute-forceable
- **System status tab** — one click live-checks that your GHL token and Brandfetch key are valid and correctly scoped, so a bad token shows up here instead of as a mystery error later
- Works on a phone — the form, account table, and modals are responsive

**How it's built**

A small Node/Express server holds your GoHighLevel Private Integration token
server-side (never in the browser) and exposes only the specific actions to a
single-page frontend. Access to the panel is gated by a shared password; each
person also enters their name at login so actions can be attributed in the
activity log without standing up real per-user accounts.

```
├── server.js            Express backend + GHL proxy + auth
├── public/index.html    The control panel UI (single file)
├── package.json
├── render.yaml          One-click Render deploy blueprint
├── .env.example         Environment variables to set
└── .gitignore
```

---

## 1. Create your GoHighLevel Private Integration token

In your **agency** GoHighLevel account:

1. Go to **Settings → Private Integrations → Create new integration**.
2. Give it a name (e.g. "Smart 1 Control Panel").
3. Enable these scopes:
   - **View Locations** (`locations.readonly`)
   - **Edit Locations** (`locations.write`)
   - **View Users** (`users.readonly`)
   - **Edit Users** (`users.write`) — only needed for the "create login user" feature
   - **View Snapshots** (`snapshots.readonly`) — only needed for the snapshot picker
   - **Edit Medias** (`medias.write`) — only needed to host the client's logo inside GHL
4. Copy the token (starts with `pit-…`). You'll set it as `GHL_PRIVATE_TOKEN`.

You'll also need your **agency Company ID** (`GHL_COMPANY_ID`). It's in the URL
of your agency dashboard, or under agency settings / business info.

> Note: Creating sub-accounts via the API requires the **Agency Pro ($497)** plan.

---

## 2. Run it locally (optional)

```bash
npm install
cp .env.example .env      # then edit .env with your real values
npm start
```

Open http://localhost:3000 and log in with your `PANEL_PASSWORD`.

---

## 3. Push to GitHub

```bash
git init
git add .
git commit -m "Smart 1 Suite control panel"
git branch -M main
git remote add origin https://github.com/<your-org>/smart1-suite-control-panel.git
git push -u origin main
```

`.gitignore` already excludes `node_modules/` and `.env`, so your token never
gets committed.

---

## 4. Deploy on Render

**Option A — Blueprint (uses `render.yaml`)**

1. In Render: **New + → Blueprint**, connect your GitHub repo.
2. Render reads `render.yaml` and creates the web service.
3. Fill in the environment variables it prompts for (see below).

**Option B — Manual**

1. **New + → Web Service**, connect the repo.
2. Build command: `npm install` · Start command: `npm start`
3. Add the environment variables below.

### Environment variables

| Variable | Required | What it is |
|---|---|---|
| `GHL_PRIVATE_TOKEN` | Yes | Your Private Integration token (`pit-…`) |
| `GHL_COMPANY_ID` | Yes | Your agency company ID |
| `PANEL_PASSWORD` | Yes | Shared password to unlock the panel |
| `SESSION_SECRET` | Recommended | Random string for signing the login cookie (Render can auto-generate) |
| `BRANDFETCH_API_KEY` | Optional | Enables "Auto-fill from client website". Get one at [developers.brandfetch.com](https://developers.brandfetch.com). Leave unset to hide/disable the feature. |
| `AUDIT_LOG_PATH` | Optional | Where the activity log file is written. Defaults to `./data/audit.log.jsonl`. See the ephemeral-storage note below before relying on this long-term. |
| `GHL_API_VERSION` | No | Defaults to `2021-07-28` |
| `NODE_ENV` | No | Set to `production` on Render (enables secure cookies) |

Once deployed, open the Render URL and log in.

---

## Notes & guardrails

- **Deletes are permanent.** The UI requires typing the account name to confirm.
- **Twilio subaccounts** sometimes can't be fully removed via the API even with
  "delete Twilio account" checked — you may need to remove them in Twilio directly.
- The token is agency-wide. Keep `PANEL_PASSWORD` strong and only share the URL
  with people who should be able to create/delete accounts. The **Status** tab
  flags it if `PANEL_PASSWORD` is still set to the placeholder from `.env.example`.
- Login sessions last 12 hours, then require re-entering the password.
- After 6 failed login attempts from the same IP within 10 minutes, that IP is
  locked out of the login endpoint for 15 minutes.
- Creating an account with a name that closely matches an existing one triggers
  a confirmation step rather than creating a duplicate silently. This check is
  best-effort — it's skipped (not blocking) if the lookup itself fails.
- **The activity log is stored on local disk and is best-effort, not a permanent
  record.** Render's default web service plan has an ephemeral filesystem — the
  log is lost on every redeploy and possibly on restarts. If you need a durable
  history, add a Render persistent disk and point `AUDIT_LOG_PATH` at a file on
  it, or export the CSV periodically from the Activity tab.

## API endpoints (this server)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/login` | Unlock with shared password + name (rate-limited) |
| `POST` | `/api/logout` | End session |
| `GET`  | `/api/session` | Check current auth state and logged-in name |
| `GET`  | `/api/snapshots` | List snapshots for the picker |
| `GET`  | `/api/brand?domain=` | Look up brand info via Brandfetch (pre-fill helper) |
| `GET`  | `/api/locations?search=` | Search / list sub-accounts |
| `GET`  | `/api/locations/:id` | Get one sub-account |
| `POST` | `/api/locations` | Create sub-account (+ optional user). Body may include `idempotencyKey` and `confirmDuplicate`; returns `409` with a `duplicates` list if a similar name already exists and `confirmDuplicate` wasn't set. |
| `DELETE` | `/api/locations/:id?deleteTwilioAccount=&name=` | Delete sub-account (`name` is passed through for the audit log) |
| `GET`  | `/api/audit?limit=` | Recent activity log entries, newest first |
| `GET`  | `/api/diagnostics` | Live-checks GHL/Brandfetch config and connectivity |

All `/api/*` routes except login require a valid session cookie.
