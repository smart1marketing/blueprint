# Marketing Efficiency Audit™ — Smart 1 Marketing

An interactive marketing audit questionnaire and calculator for accounting and bookkeeping partners. It scores a client's marketing efficiency, benchmarks spend and cost per lead against industry ranges, calculates CPL / CAC / close rate / CLV / ROI / growth opportunity, and uses the OpenAI API to write plain-English findings the partner can bring to a client meeting.

Results are gated behind a name, firm, email, and phone capture, so the tool doubles as a lead engine for the Strategic Referral Partnership program.

## What's inside

| File | Purpose |
|---|---|
| `server.js` | Express server: OpenAI proxy, PDF endpoint, lead capture, GHL delivery, rate limiting |
| `pdf.js` | Branded PDF report generator (PDFKit — no headless browser, runs on Render's small instances) |
| `cloudinary.js` | Signed Cloudinary upload for generated reports (no SDK, no dependencies) |
| `public/index.html` | Landing-page frame (nav, hero, footer) plus the five-step questionnaire and report |
| `public/app.js` | Benchmark data, scoring model, all calculations, rendering |
| `public/styles.css` | Smart 1 design system matched to the partner landing page, plus a print stylesheet |
| `public/img/` | Smart 1 logo (nav and footer versions) |
| `public/embed.js` | Loader script for embedding the audit in another site |
| `public/embed-demo.html` | Local test harness for the embed |
| `render.yaml` | One-click Render blueprint |
| `.github/workflows/ci.yml` | Checks syntax and boots the server on every push |
| `setup-github.sh` | One-command first push to a new GitHub repo |

The API key lives only on the server. The browser never sees it.

## Scoring model

**Marketing Efficiency Score™ (0–100)**

| Component | Points | Basis |
|---|---|---|
| Measurement and visibility | 45 | The 10 warning signs (30 possible points), inverted |
| Spend alignment | 20 | Annualized spend as % of revenue vs. the industry budget range |
| Acquisition efficiency | 15 | Cost per lead vs. the industry CPL range |
| Return | 20 | ROI: ≥300% = 20, ≥150% = 15, ≥50% = 10, ≥0% = 5 |

Tiers: 80+ Strong · 65–79 Monitor · 50–64 Opportunity exists · 35–49 Significant opportunity · under 35 Immediate review recommended.

The raw warning-sign tiers from the Client Profit Leak Assessment™ (0–5 Healthy through 21+ Immediate review) are preserved separately and shown in the findings.

**Formulas** — CPL = spend ÷ leads · CAC = spend ÷ new customers · Close rate = customers ÷ leads × 100 · CLV = average sale × purchases per year × customer years · ROI = ((revenue − cost) ÷ cost) × 100 · Growth opportunity = leads × lift % × close rate × average sale × 12.

**Benchmarks** — 20 industries with budget-as-%-of-revenue ranges and, where published, cost-per-lead ranges. Edit `INDUSTRIES` at the top of `public/app.js` to adjust.

## Run it locally

```bash
npm install
cp .env.example .env        # add your OpenAI key
npm start                   # http://localhost:3000
```

Without a key the app still runs end to end and produces rules-based findings instead of AI-written ones.

## Push to GitHub

```bash
git init
git add .
git commit -m "Marketing Efficiency Audit"
git branch -M main
git remote add origin https://github.com/YOUR-ORG/smart1-marketing-audit.git
git push -u origin main
```

`.env` is gitignored. Never commit the API key — GitHub scanning will revoke it and Render deploys will start failing.

## Deploy on Render

**Blueprint route (uses `render.yaml`):** New → Blueprint → connect the repo → Apply. Then open the service → Environment → add `OPENAI_API_KEY`.

**Manual route:** New → Web Service → connect the repo, then:

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/api/health`
- Environment variables:
  - `OPENAI_API_KEY` — your key (required for AI findings)
  - `OPENAI_MODEL` — `gpt-4o-mini` (default) or `gpt-4o` for longer, sharper findings
  - `LEAD_WEBHOOK_URL` — optional; every captured lead is POSTed here as JSON
  - `EMBED_ALLOWED_ORIGINS` — optional; space-separated domains allowed to iframe the audit
  - `GHL_WEBHOOK_URL` — Smart 1 Suite inbound webhook (see below)
  - `GHL_API_KEY` / `GHL_LOCATION_ID` — optional; GHL API v2 contact upsert
  - `PUBLIC_BASE_URL` — your real domain, used to build PDF links
  - `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` — PDF storage (recommended)
  - `PDF_DIR` — local fallback storage; point at a mounted disk for durable links

Render sets `PORT` automatically. Free-tier services sleep after 15 minutes of inactivity and take roughly 30 seconds to wake — move to the Starter plan before sending real partner traffic.

Confirm the deploy at `https://your-service.onrender.com/api/health`, which returns `{"ok":true,"aiEnabled":true}` once the key is set.

## Embedding in a web page

Add a container and the loader script wherever the audit should appear:

```html
<div id="smart1-audit"></div>
<script src="https://your-service.onrender.com/embed.js" data-target="#smart1-audit"></script>
```

The script creates the iframe, points it at `/?embed=1`, and resizes it as the visitor moves through the steps, so there is no inner scrollbar and no fixed height to maintain. In embed mode the audit hides its own nav, credibility strip, and footer, since the host page supplies those.

Optional attributes on the script tag:

| Attribute | Effect |
|---|---|
| `data-target` | CSS selector for the container. Defaults to the script tag's parent element. |
| `data-title` | iframe title announced by screen readers. |
| `data-scroll="off"` | Stops the host page from scrolling to the audit when the step changes. |

**Plain iframe**, if your CMS strips script tags — you lose auto-height, so set a generous fixed height:

```html
<iframe src="https://your-service.onrender.com/?embed=1"
        style="width:100%;height:1400px;border:0" title="Marketing Efficiency Audit"></iframe>
```

**WordPress**: use a Custom HTML block, not the visual editor. **Squarespace**: use a Code block. **Webflow**: use an Embed element. Wix and similar builders that sandbox custom code may block the resize messages; the fixed-height iframe above still works there.

**Restricting who can embed it.** By default any site may iframe the audit. Set `EMBED_ALLOWED_ORIGINS` in Render to a space-separated list of your own domains to lock it down:

```
EMBED_ALLOWED_ORIGINS=https://smart1marketing.com https://www.smart1marketing.com
```

That value becomes the `frame-ancestors` directive. Include both the apex and `www` versions, or the embed will break on whichever one you leave out.

**Testing locally**: run `npm start` and open `http://localhost:3000/embed-demo.html`, which loads the audit inside a stand-in host page.

## The PDF report

When the visitor unlocks their results, the browser posts the full audit to `/api/report`. The server renders a four-page branded PDF, writes it to `PDF_DIR`, returns a download link, and pushes the lead to GoHighLevel with that link attached. Download buttons appear at the top of the report and in the closing call-to-action.

What's in it:

1. **Page 1** — client snapshot, partner attribution line, Marketing Efficiency Score™ gauge, and both benchmark bars.
2. **Page 2** — the six calculated metrics, the growth-opportunity figure, and the written findings.
3. **Page 3** — where money may be leaking, questions to ask the client, recommended next steps, and the partner talking point.
4. **Page 4** — every warning sign with its flagged status, and the audit call-to-action with Smart 1 contact details.

Rendering is vector PDFKit rather than a headless browser, so it runs in well under 100 MB of memory and adds roughly 200 ms per report. No Chromium, no Puppeteer buildpack.

### Partner attribution

Section 1 asks for **Prepared by (partner name)** and **Partner firm**. Both print on the PDF header line, ride along in the GHL payload as `partnerName` and `partnerFirm`, and prefill the gate form so the partner never types their name twice.

Give each firm its own link and the fields fill themselves:

```
https://your-service.onrender.com/?partner=Jane%20Doe%2C%20CPA&firm=Doe%20CPA%20Group
```

### Where PDFs are stored

Reports go to **Cloudinary** when it's configured, and fall back to local disk when it isn't — or when an upload fails, which is logged and never blocks the visitor's download.

**Cloudinary (recommended).** Set these in Render → Environment, from your Cloudinary dashboard:

```
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=...
CLOUDINARY_FOLDER=smart1-audits
```

Reports upload as `raw` resources to `smart1-audits/`, and the returned `secure_url` is what the visitor downloads and what GHL receives. Two reasons for `raw` rather than `image`: PDFs uploaded as images are blocked from delivery on many Cloudinary accounts until you enable "Allow delivery of PDF and ZIP files" in Settings → Security, and raw storage never re-encodes the file.

This makes report links permanent and survives restarts, sleeps, and redeploys — which means the **free Render plan is fine**, and you can drop the disk block from `render.yaml`. Every report is roughly 45 KB, so a thousand audits is about 45 MB against your Cloudinary quota.

The upload is signed server-side with your API secret using Cloudinary's standard SHA-1 scheme. The secret never reaches the browser, and no Cloudinary SDK is installed.

**Local disk (fallback).** Without Cloudinary, reports are written to `PDF_DIR` (default: the system temp directory) and swept after `PDF_TTL_HOURS`, default 30 days. On Render's free plan the filesystem is wiped on restart and sleep, so links break within hours — the immediate download still works, but an emailed link may 404. To use local storage in production, uncomment the disk block in `render.yaml` (paid plan) and set `PDF_DIR=/var/data/audits`.

Either way, set `PUBLIC_BASE_URL` to your real domain so locally served links don't expose the raw `.onrender.com` host.

Check which mode is live at `/api/health` — look for `"pdfStorage": "cloudinary"` or `"local-disk"`. The `/api/report` response also reports `"storage"` per request, which tells you whether a specific upload fell back.

## Sending leads to Smart 1 Suite (GoHighLevel)

Two paths. The webhook is simpler and is what most GHL setups use; the API gives you a real contact record with a note attached.

### Option A — inbound webhook (recommended)

In Smart 1 Suite: **Automation → Workflows → Create Workflow → Add New Trigger → Inbound Webhook**. Copy the URL and set it as `GHL_WEBHOOK_URL` in Render.

Each submission posts this JSON:

```json
{
  "source": "Marketing Efficiency Audit",
  "stage": "completed",
  "partnerName": "Jane Doe, CPA",
  "partnerFirm": "Doe CPA Group",
  "name": "Jane Doe", "firm": "Doe CPA Group",
  "email": "jane@doecpa.com", "phone": "614-555-0142",
  "clientBusiness": "Acme Plumbing & Drain",
  "clientIndustry": "Plumbing",
  "clientAnnualRevenue": 1850000,
  "monthlyMarketingSpend": 10550,
  "efficiencyScore": 44,
  "scoreTier": "Significant opportunity",
  "leakPoints": 22,
  "leakTier": "Immediate review recommended",
  "auditPdfUrl": "https://your-service.onrender.com/audit/marketing-efficiency-audit-acme-....pdf",
  "submittedAt": "2026-07-25T18:00:00.000Z"
}
```

In the workflow, map those into contact fields, then use `auditPdfUrl` in an email or SMS action to send the partner their report — GHL merges it as a link, so nothing needs uploading.

Each audit fires the webhook **twice**: once at `"stage": "started"` when the gate is submitted, and again at `"stage": "completed"` once the PDF exists. That way a visitor who closes the tab mid-analysis is still captured. Either filter on `stage` in the workflow, or upsert by email so the second hit updates the same contact.

### Option B — GHL API v2

Set `GHL_API_KEY` (a Private Integration token from **Settings → Private Integrations**, scoped to `contacts.write`) and `GHL_LOCATION_ID` (**Settings → Business Profile**). The server upserts the contact, tags it `marketing-efficiency-audit` and `cpa-partner-referral`, and attaches a note containing the score, tier, spend, partner name, and the PDF link.

Both options can run at once. Confirm what's live at `/api/health`:

```json
{"ok":true,"aiEnabled":true,"pdfEnabled":true,"ghl":{"webhook":true,"api":false}}
```

## Legacy generic webhook

Each submission POSTs this JSON to `LEAD_WEBHOOK_URL`:

```json
{
  "name": "Jane Doe", "firm": "Doe CPA Group",
  "email": "jane@doecpa.com", "phone": "555-0100",
  "client": { "clientName": "Acme Plumbing", "industry": "Plumbing", "annualRevenue": 1000000 },
  "score": 58, "leakTier": "Opportunity exists", "monthlySpend": 6000,
  "receivedAt": "2026-07-24T18:00:00.000Z"
}
```

`LEAD_WEBHOOK_URL` receives the same payload as the GHL webhook above, so you can run Zapier or Make alongside Smart 1 Suite for commission tracking as described in the Referral Flow.

## Cost

At `gpt-4o-mini`, each completed audit is roughly 2,000 input and 900 output tokens — well under a cent per audit. PDF generation is free; each report is about 45 KB, stored on Cloudinary or disk. Rate limiting is set to 15 analyses per IP per hour in `server.js`.

## Customizing

- **Contact CTA** — the mailto link near the bottom of `index.html`; swap it for your scheduling link.
- **Tone and structure of the findings** — `SYSTEM_PROMPT` in `server.js`.
- **Questions and weights** — `FLAGS` in `public/app.js`; keep the total at 30 or adjust the 45-point divisor in `calculate()`.
- **Partner attribution** — read a `?partner=firm-name` query parameter in `app.js` and include it in the `/api/lead` payload to track which firm sent each audit.
