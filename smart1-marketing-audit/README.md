# Marketing Efficiency Audit™ — Smart 1 Marketing

An interactive marketing audit questionnaire and calculator for accounting and bookkeeping partners. It scores a client's marketing efficiency, benchmarks spend and cost per lead against industry ranges, calculates CPL / CAC / close rate / CLV / ROI / growth opportunity, and uses the OpenAI API to write plain-English findings the partner can bring to a client meeting.

Results are gated behind a name, firm, email, and phone capture, so the tool doubles as a lead engine for the Strategic Referral Partnership program.

## What's inside

| File | Purpose |
|---|---|
| `server.js` | Express server, `/api/analyze` OpenAI proxy, `/api/lead` capture, rate limiting, rules-based fallback |
| `public/index.html` | Five-step questionnaire and report layout |
| `public/app.js` | Benchmark data, scoring model, all calculations, rendering |
| `public/styles.css` | Smart 1 brand styling (navy / sky / green / gold, Montserrat) plus a print stylesheet |
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

Render sets `PORT` automatically. Free-tier services sleep after 15 minutes of inactivity and take roughly 30 seconds to wake — move to the Starter plan before sending real partner traffic.

Confirm the deploy at `https://your-service.onrender.com/api/health`, which returns `{"ok":true,"aiEnabled":true}` once the key is set.

## Connecting leads to Smart 1 Suite

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

Point that at a Zapier or Make webhook to create the opportunity, tag it **CPA Partner Referral**, and start referral commission tracking as described in the Smart 1 Suite Referral Flow.

## Cost

At `gpt-4o-mini`, each completed audit is roughly 2,000 input and 900 output tokens — well under a cent per audit. Rate limiting is set to 15 analyses per IP per hour in `server.js`.

## Customizing

- **Contact CTA** — the mailto link near the bottom of `index.html`; swap it for your scheduling link.
- **Tone and structure of the findings** — `SYSTEM_PROMPT` in `server.js`.
- **Questions and weights** — `FLAGS` in `public/app.js`; keep the total at 30 or adjust the 45-point divisor in `calculate()`.
- **Partner attribution** — read a `?partner=firm-name` query parameter in `app.js` and include it in the `/api/lead` payload to track which firm sent each audit.
