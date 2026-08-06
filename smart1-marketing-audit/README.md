# Marketing Efficiency Audit™ — Smart 1 Marketing

An interactive marketing audit questionnaire and calculator for accounting and bookkeeping partners. It scores a client's marketing efficiency, benchmarks spend and cost per lead against industry ranges, calculates CPL / CAC / close rate / CLV / ROI / growth opportunity, and uses the OpenAI API to write plain-English findings the partner can bring to a client meeting.

Results are gated behind a name, firm, email, and phone capture, so the tool doubles as a lead engine for the Strategic Referral Partnership program.

## What's inside

| File | Purpose |
|---|---|
| `server.js` | Express server: OpenAI proxy, PDF endpoint, lead capture, GHL delivery, rate limiting |
| `pdf.js` | Branded PDF report generator (PDFKit — no headless browser, runs on Render's small instances) |
| `cloudinary.js` | Signed Cloudinary upload for generated reports (no SDK, no dependencies) |
| `ghl.js` | GoHighLevel client: contact upsert, PDF attach to custom field, summary note |
| `expenses.js` | Expense file text extraction (PDF, Excel, CSV, image) and AI category breakdown |
| `website.js` | Website conversion scan: signal detection plus AI commentary, with SSRF protection |
| `audience.js` | Directional reachable-audience estimate from service-area population |
| `market.js` | AI service-area sizing, competitor discovery, and head-to-head site comparison |
| `public/index.html` | Landing-page frame (nav, hero, footer) plus the six-section questionnaire and report |
| `public/app.js` | Benchmark data, scoring model, all calculations, rendering |
| `public/styles.css` | Smart 1 design system matched to the partner landing page, plus a print stylesheet |
| `public/img/` | Smart 1 logo (nav and footer versions) |
| `public/embed.js` | Loader script for embedding the audit in another site |
| `public/embed-demo.html` | Local test harness for the embed |
| `render.yaml` | One-click Render blueprint |
| `.github/workflows/ci.yml` | Checks syntax and boots the server on every push |
| `setup-github.sh` | One-command first push to a new GitHub repo |

The API key lives only on the server. The browser never sees it.

## The questionnaire

Seven sections, roughly ten minutes:

1. **Client snapshot** — industry, revenue, website URL, ZIP code, primary market, and the partner's name and firm, plus sliders for number of locations (1–20+) and current marketing vendors (0–20+), each with an info circle. The service-area population is estimated from the ZIP rather than asked.
2. **How they buy marketing** — whether digital and traditional spend each clear $2,500 a month, lead services, agency vs. in house (and whether in-house staff get training), traditional channels, digital vendors, in-house marketing headcount and payroll, live events, who owns the website and ad accounts, lead response time, CRM tracking, seasonality, and month-to-month consistency.
3. **Competition and website** — optional Google rating and review count, top services by revenue, then competitors looked up automatically from the website, ZIP, and industry; the partner confirms or dismisses each one and can add their own. Every confirmed competitor with a website is scanned and compared against the client's site in the background. The client's own conversion scan also starts in the background as soon as a URL is entered.
4. **Profit leak warning signs** — eight questions, each answered Yes / No / Unsure. Two of the original ten (monthly spend above $2,500, multiple vendors) were removed because Section 2 already captures them directly. Point values are never shown to the partner; an "unsure" carries the same weight as a "yes", because an unknown is itself a warning sign, and the report distinguishes the two.
5. **Monthly investment** — seventeen spend categories as sliders, each with a category-appropriate ceiling and an info circle explaining what belongs there, plus the optional expense-document upload.
6. **Performance indicators** — marketing-generated leads (referrals and repeat customers explicitly excluded, so cost per lead reflects the marketing), customers from those leads, average sale, purchase frequency, relationship length, plus optional questions on repeat-revenue mix and whether the business could handle more leads. The report models +15% and +25% growth scenarios automatically — unless capacity is "already full", in which case the findings pivot to pricing and efficiency instead of volume.
7. **Target market and context** — B2C or B2B, service radius, age ranges, household income, gender skew, homeowner focus, and free text for leadership changes, lost accounts, or new locations.

Only Section 4 affects the numeric score. Everything else feeds the written findings, the report sections, and the questions the partner brings to the client meeting.

## Scanning the client's website

Section 3 fetches the client's home page and detects conversion and measurement signals directly from the served HTML: forms, click-to-call links, mailto links, booking and scheduling tools, chat widgets, call-to-action language, review mentions, and tracking tags (GA4, GTM, Google Ads conversion, Meta pixel, LinkedIn, Microsoft UET, TikTok, Hotjar/Clarity, call tracking). It also checks HTTPS, mobile viewport, meta description, H1, and schema markup. The model then comments on what it found, ranked by revenue impact.

Two limits are stated in the output rather than hidden: the scan reads only the **initial HTML response**, so a site that renders in the browser will under-report and the result says so; and it never claims to assess design, speed, or copy, because it hasn't seen the rendered page.

**Safety.** Submitted URLs are resolved and checked before fetching. Private ranges, loopback, and link-local addresses are refused, which blocks the standard SSRF path to cloud metadata endpoints. Set `ALLOW_LOCAL_FETCH=1` only for local development.

## Estimating audience size

The partner is never asked for a population figure. The audit sends the ZIP code, city, industry, and service radius to the model, which estimates the reachable service area and returns it with a confidence rating, the basis for the figure, and local demographics where it knows them (median household income, median age, homeownership). If the model is unavailable or returns something implausible, a radius-based fallback applies, so **there is always an audience number**. The report always states which of the two produced it.

That population is then filtered by the target-market answers, with the arithmetic shown line by line:

```
Service-area population                             905,000
Adults aged 35–44, 45–54, 55–64 (38% of population) 323,000
Household income $100k–$200k (26% of households)     83,980
Homeowners only (65% ownership rate)                 54,587
Estimated reachable consumers                        54,587
Working range: 38,211 – 70,963
```

This is deliberately transparent arithmetic, not a data product. It uses approximate national US shares for age, income, household size, homeownership, and business density, and reports a ±30% band. Every figure carries the caveat that it is directional and should be confirmed against census or ad-platform reach data. `audience.js` holds the share tables if you want to substitute local figures.

For B2B clients it estimates establishments instead, at roughly 25 per 1,000 residents. Without a population figure, the report says what it could not assess rather than guessing.



## Partner experience

Three things keep a busy accountant from abandoning a ten-minute form:

- **Save and resume.** Every answer persists in the browser (localStorage) as it's typed. Returning to the page offers "Pick up where you left off" with the client's name; progress clears when the audit completes or on "Start over", and goes stale after 14 days. Nothing leaves the machine until submission.
- **A completeness check before the report.** "Calculate results" first lists what's blank and what each blank costs — "Without leads and customers, the report can't compute cost per lead" — with the choice to go back or generate anyway. This is why dashes in the report are always a decision, never a surprise.
- **A sample report on the intro page** (`/sample-report.pdf`, served from `public/`), so the partner sees the payoff before investing the time. Regenerate it whenever the format changes by saving any audit PDF over `public/sample-report.pdf`.

## Calculation policy

Decisions that shape the numbers, so nobody has to reverse-engineer them:

- **ROI is deliberately conservative**: first-month math only — (new customers × average sale − spend) ÷ spend. Repeat purchases are excluded from ROI; the findings may note that true return including lifetime value runs higher, but the printed figure never inflates.
- **Benchmark comparisons use media spend only.** In-house staff and live events count toward total spend and ROI, but are excluded from the % -of-revenue benchmark, because published industry ranges are media-only and including payroll would make every client with a team look like an overspender. The report labels this wherever the comparison appears.
- **Leads means marketing-generated leads.** The form says so, and explains why: counting referrals flatters cost per lead and hides the real number.
- **Savings rates are 20% (digital consolidation) and 25% (traditional/digital overlap)**, always labelled as typical recovery rates rather than quotes.

## The vendor questions section

Every report closes with "Five questions to ask any marketing vendor" — cost per acquired customer by channel, asset ownership, notice period, change log, and budget overlap. These apply to the client's current vendors and to anyone they might hire, which is exactly the point: the questions do the differentiating, and the report never has to.

The webhook payload also carries `lastScreen`, so a GHL workflow can tell where a partner abandoned when a `started` lead never converts to `completed`.

## Modelling savings

Where the numbers support it, the report shows what tightening the program could return:

- **Consolidating digital vendors** — 20% of digital spend, applied when two or more vendors are in play. Covers duplicate tools, overlapping audiences, brand terms bid against the client's own organic listing, and management fees paid twice on the same work.
- **Removing traditional and digital overlap** — 25% of traditional spend, applied when both are running. Media bought separately usually reaches the same people at the same time without either side knowing.

Both are followed by a before-and-after table on monthly spend, cost per lead, acquisition cost, and ROI. **Both columns are computed from the same spend figure** rather than reusing stored metrics, so the comparison can never show savings making a metric worse.

The percentages are labelled as typical recovery rates, never a quote. Edit `savingsModel()` in `public/app.js` to change them, along with `DIGITAL_CATS` and `TRADITIONAL_CATS` which decide what counts as each.

## Uploading marketing expenses

Section 4 accepts a P&L export, ledger, vendor statement, or invoice list — PDF, XLSX, XLS, CSV, TXT, or a photo, up to 15 MB. The partner picks one of two modes:

- **AI evaluation** — the server extracts the text (PDFKit's parser for PDFs, SheetJS for spreadsheets, the model's vision for images), asks the model to sort line items into the ten spend categories, and writes the resulting monthly figures straight into the form fields. The partner reviews and corrects before continuing; the audit always uses what is in the fields, not what was read.
- **Human review** — the file is stored and flagged for a Smart 1 analyst, with no automated interpretation.

Either way the file goes to Cloudinary under `smart1-audits/expense-uploads/`, so there is always a copy to go back to.

Two behaviors worth knowing. **Anything the model cannot place with confidence goes to "Other"** rather than being guessed into a named category — a large Other is expected and correct, and unrecognized category labels are folded in too rather than trusted. And **annual or quarterly documents are divided down to a monthly average**, with the conversion stated in the results panel so the partner can check it. Each line carries a high/medium/low confidence badge and the source line items it came from.

If the file has no readable text — a scan saved as a PDF, say — the partner is told to re-upload it as an image, which routes it through vision instead.

## Scoring model

**Marketing Efficiency Score™ (0–100)**

Warning-sign weights are normalised against `FLAG_MAX`, so adding or removing a question rescales the score automatically rather than silently shifting every tier.

| Component | Points | Basis |
|---|---|---|
| Measurement and visibility | 45 | The 10 warning signs (30 possible points), inverted |
| Spend alignment | 20 | Annualized spend as % of revenue vs. the industry budget range |
| Acquisition efficiency | 15 | Cost per lead vs. the industry CPL range |
| Return | 20 | ROI: ≥300% = 20, ≥150% = 15, ≥50% = 10, ≥0% = 5 |

Tiers: 80+ Strong · 65–79 Monitor · 50–64 Opportunity exists · 35–49 Significant opportunity · under 35 Immediate review recommended.

The raw warning-sign tiers from the Client Profit Leak Assessment™ (0–5 Healthy through 21+ Immediate review) are preserved separately and shown in the findings.

**Formulas** — CPL = spend ÷ leads · CAC = spend ÷ new customers · Close rate = customers ÷ leads × 100 · CLV = average sale × purchases per year × customer years · ROI = ((revenue − cost) ÷ cost) × 100 · Growth opportunity = leads × lift % × close rate × average sale × 12.

**Benchmarks** — 20 industries, each with three or four industry facts shown in a dedicated benchmarks section, a budget-as-%-of-revenue range, a cost-per-lead range where one is published, a typical digital/traditional channel split, and a one-line note on what drives spend in that industry. The report shows the industry midpoint converted to dollars at the client's own revenue, so the gap reads as "$7,179 per month below the midpoint" rather than a percentage. Edit `INDUSTRIES` at the top of `public/app.js` to adjust.

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
  - `ALLOW_LOCAL_FETCH` — development only; set to `1` to let the website scanner reach private addresses
  - `GHL_WEBHOOK_URL` — Smart 1 Suite inbound webhook (see below)
  - `GHL_API_KEY` / `GHL_LOCATION_ID` — GHL API v2 contact upsert and PDF attach
  - `GHL_PDF_FIELD_ID` — file custom field on Contact that receives the PDF
  - `BOOKING_URL` — where the "Schedule a review" button goes; defaults to the Smart 1 contact page
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
2. **Page 2** — the six calculated metrics, the growth-opportunity figure, and what the industry typically spends including the channel-mix bar.
3. **Page 3 onward** — industry benchmarks and facts, the audience estimate with its arithmetic, the website conversion review, competitive position, how the client buys marketing, target market and business context, the written findings, the vendor-consolidation case, where money may be leaking, questions to ask, next steps, warning-sign detail, and the call-to-action.

Reports run four to seven pages depending on how much the partner supplied. Sections with no data are omitted rather than printed empty.

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

Two paths, and they can run together. The webhook is the simplest and fires workflows; the API is what attaches the PDF file to the contact record.

### Option A — inbound webhook (simplest)

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

### Option B — GHL API v2, with the PDF attached to the contact

This is the path that puts the actual file on the contact record rather than a link. Three calls run per completed audit: upsert the contact, attach the PDF to a file custom field, then write a note with the score summary.

**1. Create the custom field.** In Smart 1 Suite: **Settings → Custom Fields → Add Field → File Upload**, with Object Type **Contact**. Name it something like `Marketing Audit Report`. Allow PDF, and allow multiple files if partners will run more than one audit — otherwise each new report replaces the last.

**2. Get the field ID.** Open the field in Settings and copy the ID from the browser URL, or call `GET /locations/{locationId}/customFields?model=contact` with your token and find it by name. Set it as `GHL_PDF_FIELD_ID`. If you'd rather not hunt for the ID, set `GHL_PDF_FIELD_KEY` to the field's key instead and the server resolves it once on first use and caches it.

**3. Create the token.** **Settings → Private Integrations → Create**, with scopes `contacts.write`, `contacts.readonly`, `locations/customFields.readonly`, and `objects/record.write`. Copy the token to `GHL_API_KEY`. Your sub-account ID from **Settings → Business Profile** goes in `GHL_LOCATION_ID`.

```
GHL_API_KEY=pit-...
GHL_LOCATION_ID=ve9EPM428h8vShlRW1KT
GHL_PDF_FIELD_ID=1c8Xn9...
```

The upload uses `POST /forms/upload-custom-files?contactId=…&locationId=…` with the PDF as a multipart field named `<fieldId>_<uuid>`. Some accounts want the bare `<fieldId>` instead, so that's retried automatically if the first form fails. GHL caps these at 50 MB; audit reports run about 45 KB.

The contact is tagged `marketing-efficiency-audit` and `cpa-partner-referral`, and the note records the client business, partner name and firm, score, tier, warning-sign points, monthly spend, and whether the PDF attached.

**Failures are isolated.** If the attachment fails, the contact and note are still created and the note says so, with the Cloudinary link included as a fallback. Nothing in the GHL path can block the visitor's own download. Watch your Render logs for `ghl pdf attach failed:` with the API's reason.

Verify what's live at `/api/health`:

```json
{"ok":true,"aiEnabled":true,"pdfEnabled":true,"pdfStorage":"cloudinary",
 "ghl":{"webhook":true,"api":true,"pdfAttach":true}}
```

`pdfAttach: false` with `api: true` means the token and location are set but the field ID isn't — you'll get contacts and notes, but no attached file. Each completed audit also logs a line like `GHL: {"contactId":"...","attached":true,"noted":true}`.

Options A and B can run together: use the webhook to fire a workflow (email the partner, notify a rep) while the API attaches the file.

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

At `gpt-4o-mini`, each completed audit is roughly 2,600 input and 900 output tokens, and an expense-document evaluation adds roughly 6,000 input and 800 output tokens — well under a cent per audit. PDF generation is free; each report is about 45 KB, stored on Cloudinary or disk. Rate limiting is set to 15 analyses per IP per hour in `server.js`.

## Customizing

- **The "Schedule a review" button** — set `BOOKING_URL` in Render rather than editing code. It drives both the on-screen button and the clickable button in the PDF. The wording lives in the `.cta-band` block of `index.html` and section 9 of `pdf.js`.
- **Tone and structure of the findings** — `SYSTEM_PROMPT` in `server.js`.
- **Questions and weights** — `FLAGS` in `public/app.js`. Weights are internal only and never displayed; keep the total at 30 or adjust the 45-point divisor in `calculate()`.
- **Spend categories, slider ceilings, and the info-circle text** — `SPEND_ITEMS` at the top of `public/app.js`. If you change a category name, change the matching entry in `SPEND_CATEGORIES` in `expenses.js` too, or the AI expense reader will drop that category into Other.
- **Growth scenarios** — the `LIFTS` array in `calculate()`, currently `[15, 25]`.
- **Traditional media and age-range options** — `TRADITIONAL_MEDIA` and `AGE_RANGES` in `public/app.js`.
- **Expense categorization rules** — the `SYSTEM` prompt in `expenses.js`. The "unknown goes to Other" rule lives there and in `normalize()`.
- **The thinking spinner's stages** — `THINK_STEPS` in `public/app.js`. It holds for a minimum of 2.4 seconds so it never flashes.
- **Partner attribution** — read a `?partner=firm-name` query parameter in `app.js` and include it in the `/api/lead` payload to track which firm sent each audit.
