# GoHighLevel — Smart1Suite Custom Field Creator

Creates all of the custom fields your four lead tools (Boat Dealer, RV Demand,
Ski Resort, IO Builder) need in GoHighLevel, from a single config file, using a
GHL **Private Integration Token**. It is **idempotent** — run it as many times as
you like; it skips fields that already exist.

## What it does (and what it can't)

- ✅ Creates **custom fields** on the **Contact** object (and Opportunity, where
  you choose) via `POST /locations/{locationId}/customFields`.
- ✅ Skips any field that already exists, so re-running is safe.
- ❌ Does **not** create pipelines. GoHighLevel's API is read-only for pipelines,
  so the four pipelines (Boat Dealers, RV Dealers, Ski Resorts, IO Requests) are
  created once by hand in the UI — see "Create the 4 pipelines" below (~2 min).

## The two things you need

1. **`GHL_TOKEN`** — your Private Integration Token (starts with `pit-`).
   Create it in GHL: **Settings → Private Integrations → Create new integration**.
   Give it at least these scopes: **View Custom Fields** and **Edit Custom Fields**
   (also called `locations/customFields.readonly` and `locations/customFields.write`).
2. **`GHL_LOCATION_ID`** — your sub-account Location ID (yours is
   `colmyQCuPN9SxcuJfGhc`). Find it under **Settings → Business Info**.

## Run it (three ways)

### A) Locally (fastest to test)
```bash
npm install                 # no external deps; just sets things up
cp .env.example .env        # then paste your token + location id into .env
npm run dry-run             # preview exactly what will be created — no writes
npm run verify              # list the fields that already exist in your account
npm run create              # create everything missing
```

### B) On Render (matches your setup)
1. Push this folder to a GitHub repo (see below).
2. In Render: **New + → Blueprint**, connect the repo. Render reads `render.yaml`
   and creates a **Job** named `ghl-opportunity-fields`.
3. When prompted, set `GHL_TOKEN` and `GHL_LOCATION_ID` (Environment tab).
4. Click **Run** (or **Trigger Run**) on the job. Watch the logs — you'll see a
   line per field and a summary at the end. Re-run any time; it's idempotent.

> Prefer not to use a Blueprint? Create a **Background Worker** or **Cron Job**
> from the repo instead, set the same two env vars, and use start command
> `node create-fields.js`.

### C) Push to GitHub from the command line
```bash
git init
git add .
git commit -m "GHL Smart1Suite custom field creator"
git branch -M main
git remote add origin https://github.com/<you>/ghl-fields.git
git push -u origin main
```

## Preview / verify / create

| Command | Writes? | What it does |
|---|---|---|
| `node create-fields.js --dry-run` | No | Prints every field it would create (works offline too). |
| `node create-fields.js --verify`  | No | Lists the custom fields already in your account. |
| `node create-fields.js`           | Yes | Creates all missing fields, skips existing ones. |

## Editing the field list

Everything lives in **`config/fields.json`**. Fields are organized into groups
(Boat & Ski shared, RV Demand, RV Opportunity-level, IO). To change anything:

- **Add a field**: add `{ "name": "My Field", "type": "text" }` to a group.
- **Field types**: `text`, `textarea`, `number`, `phone`, `money`, `email`,
  `date`, `dropdown`, `multi_select`, `radio`, `checkbox`.
- **Dropdown/radio/checkbox/multi_select** need an `"options"` array, e.g.
  `{ "name": "Report Status", "type": "dropdown", "options": ["completed","failed"] }`.
- **Contact vs Opportunity object**: the file defaults to the **Contact** object
  (`"defaultModel": "contact"`) because your field maps and `{{contact.x}}` merge
  fields require it. To put a whole group on the Opportunity object add
  `"model": "opportunity"` to that group; to move one field, add `"model"` to it.
- **Group prefix**: `"prefix": "RV:"` prepends `RV:` to every field name in that
  group so they sort together in GHL. Remove it if you don't want the prefix.

## Notes

- GHL derives each field's internal key (`{{contact.dealer_resort_name}}`) from
  the **name** — you map webhook JSON keys to these fields yourself in the
  workflow builder, so they don't have to match your webhook key names.
- The four verticals mostly share the same lead data shape. Contact custom fields
  in GHL are **account-wide** (not per-pipeline), so the shared Boat/Ski fields
  serve both pipelines; RV and IO have their own prefixed sets.
