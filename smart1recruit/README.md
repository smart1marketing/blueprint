# Smart 1 Precision Recruitment Intelligence

A multi-step Smart 1 Marketing lead tool for companies that are hiring. It creates an AI planning report with:

- Estimated local workforce, qualified candidates, and active job seekers for the requested roles
- Ranked competitors, trade schools, campuses, industrial parks, event venues, and talent hubs to target and conquest
- Recommended recruitment channels and job-title / job-seeker audiences (LinkedIn, programmatic display, competitor IP conquesting, job-seeker audio, CTV, video, retargeting)
- A recommended monthly media budget (tiered package)
- A month-by-month activation and budget-pacing plan
- Smart 1 Suite webhook payload
- Print-to-PDF report

## Important limitation

This version intentionally uses AI planning estimates instead of paid labor-market, geocoding, census, or LinkedIn APIs. It does not claim live verification. Before media activation, a strategist should verify each competitor and institution and build the final audiences and polygons in the advertising platform.

## Project structure

```
smart1recruit/
├── app.py               # Flask backend + OpenAI report generation + webhook + PDF
├── templates/
│   └── index.html       # Self-contained multi-step form (CSS + JS inlined)
├── requirements.txt
├── Procfile
├── render.yaml
├── .env.example
└── .gitignore
```

`index.html` lives in `templates/` because the backend serves it with Flask's
`render_template("index.html")`. The page is intentionally self-contained: all
CSS and JavaScript are inlined, so there are no separate `styles.css` or `app.js`
files to keep in sync. This keeps the form reliable when embedded in Smart 1 Suite.

> Do not commit compiled artifacts (`__pycache__/`, `*.pyc`) or generated
> `static/reports/`. They are ignored in `.gitignore`.

## Deploy to GitHub

1. Create a new GitHub repository named `smart1recruit`.
2. Upload every file and folder in this project. Keep the folder structure intact (especially `templates/`).
3. Do not upload a real `.env` file or API key.

## Deploy to Render

1. In Render, choose **New + > Blueprint**.
2. Connect the `smart1recruit` GitHub repository.
3. Render will read `render.yaml`.
4. Add the secret environment variable `OPENAI_API_KEY`.
5. Add `SMART1_WEBHOOK_URL` for the Smart 1 Suite inbound webhook.
6. Add `PUBLIC_BASE_URL` = your live Render URL (e.g. `https://smart1recruit.onrender.com`) so the report PDF links are absolute.
7. Keep `OPENAI_MODEL` at the default or change it to a model available in your OpenAI account.
8. Deploy and test `/health`, then test the full form.

## Deploy as a subfolder of an existing repo (Render "Root Directory")

If you keep several apps in one repository, put this whole folder at the repo
root as `smart1recruit/` and deploy it as its own service without a Blueprint:

1. In Render: **New + > Web Service**, connect the repository, pick the branch
   (e.g. `main`).
2. Set **Root Directory** to `smart1recruit`. Everything below now runs relative
   to that folder.
3. **Runtime:** Python 3
4. **Build command:** `pip install -r requirements.txt`
5. **Start command:** `gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --threads 4 --timeout 300`
6. Add the environment variables (`OPENAI_API_KEY` required; `SMART1_WEBHOOK_URL`
   and `PUBLIC_BASE_URL` optional).
7. Deploy, then test `/health`.

Each push that touches this folder redeploys only this service. Because you set
the runtime and commands explicitly here, Render will not be confused by other
apps (e.g. a Node `package.json`) elsewhere in the repo. The included
`render.yaml` is only used if you deploy this folder as its own root-level repo
or Blueprint; the Root-Directory web service above ignores it.

## PDF report

Every completed report is rendered to a branded PDF (via `reportlab`, pure
Python — no system libraries needed) and written to `static/reports/`. The
public URL is sent to Smart 1 Suite in the webhook as `report_pdf_url`, so your
team can link or attach it with `{{contact.report_pdf_url}}`. Set `ENABLE_PDF=0`
to turn this off. On Render's ephemeral disk the files persist for the life of
the instance; for permanent archival, upload the bytes to S3 or the GHL Media
Library inside `build_report_pdf()`.

## Smart 1 Suite fields

Recommended custom fields:

- Company Name
- Company Website
- Company ZIP
- Target Radius
- Role Types
- Hiring Volume
- Campaign Objective
- Notes
- Estimated Qualified Candidates
- Estimated Active Job Seekers
- Recruitment Market Type
- Recruitment Market Summary
- Recommended Package
- Recommended Investment
- Report Status
- Report PDF URL
- Report JSON (large text field, optional)

The webhook sends human-readable fields plus `report_json`. If the Suite webhook ignores nested or large data, map the summary and candidate-estimate fields first and store the full report externally or in a large-text custom field.

## Embed on Smart 1 Suite

The easiest reliable method is an iframe pointing to the Render URL:

```html
<iframe
  src="https://YOUR-RENDER-URL.onrender.com/"
  style="width:100%;min-height:1200px;border:0;border-radius:12px;"
  loading="lazy"
  title="Precision Recruitment Intelligence">
</iframe>
```

Using an iframe keeps the JavaScript and API request on the same Render domain and avoids cross-origin and code-block restrictions inside Smart 1 Suite.

## Test locally

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then add your OPENAI_API_KEY
python app.py
```

Open `http://localhost:5000`.

## How this differs from the boat-dealer tool

Same architecture and design system, retargeted for hiring:

- Talent-market estimates (workforce, qualified candidates, active job seekers) instead of boat-owner households.
- Conquest & targeting locations (competitors, trade schools, campuses, industrial parks, union halls) instead of waterways and marinas.
- Recruitment channels **including LinkedIn** and competitor IP conquesting — the boat tool intentionally banned social; the recruitment stack leads with it for professional and technical roles.
- Hiring-cycle activation triggers (new-grad season, bonus-season churn, competitor layoff signals) instead of weather triggers.
- Budget pacing by hiring phase: Active 100% / Pipeline 50% / Maintenance 25%.
- A one-time $499 setup & landing-page fee builds the automated applicant workflows in the Smart 1 Suite.
