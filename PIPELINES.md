# Create the 4 Pipelines (one-time, in the GHL UI)

GoHighLevel's API cannot create pipelines — only read them — so these four are
made by hand. It takes about two minutes total. The custom-field script handles
everything else.

## Steps

1. In your sub-account go to **Opportunities → Pipelines** (or
   **Settings → Pipelines**).
2. Click **+ Create new Pipeline** (top right).
3. Name it, add the stages, click **Save**. Repeat for all four.

## Suggested pipelines and stages

Adjust names to taste — the script doesn't depend on these.

**Boat Dealers**
`New Lead` → `Report Generated` → `Proposal Sent` → `Follow-up` → `Won` / `Lost`

**RV Dealers**
`New RV Demand Lead` → `Estimate Generated` → `Proposal Sent` → `Review Booked` → `Won` / `Lost`

**Ski Resorts**
`New Lead` → `Report Generated` → `Proposal Sent` → `Follow-up` → `Won` / `Lost`

**IO Requests**
`New IO / Pending Setup` → `IO Built` → `Client Approval` → `Live / In Flight` → `Complete`

## Then wire the opportunity in your workflow

For each tool's inbound-webhook workflow, the **Create/Update Opportunity** action
sets these built-in opportunity properties (no custom fields needed here):

- **Pipeline** → the matching pipeline above
- **Stage** → the entry stage (e.g. "New Lead" / "New IO / Pending Setup")
- **Opportunity Name** → from the webhook `opportunity_name` (e.g. "{Dealer} — Market Report")
- **Lead Value** → from `recommended_investment` / `lead_value` / `base_monthly_budget`
- **Status** → `Open`
- **Source** → from the webhook `source`
- **Assigned To** → your rep (map by email) or a round-robin rule

The report data and PDF link land in the **Contact custom fields** the script
creates, which you reference in your email/SMS as `{{contact.proposal_report_link}}`
(Boat/Ski), `{{contact.rv_proposal_pdf_url}}` (RV), or `{{contact.io_client_io_pdf_url}}` (IO).
