# Quoting tool — what changed

**Your page is untouched.** Same design, same copy, same sections, same order, same
animations. Every change below is inside the proposal builder (`#builder` / `#proposal`)
and the server that feeds it.

Files changed: `public/index.html` (builder only), `public/data.js`, `server.js`, `lib/pdf.js`

---

## 1. The PDF download — root cause found

`public/index.html` line 950 shipped as:

```js
const BACKEND_URL = "";
```

Every call was built as `BACKEND_URL + "/api/lead"`. The widget is embedded on
smart1marketing.com, so that resolved to `https://smart1marketing.com/api/lead` → **404**.

The old handler caught that failure and *still* ran the success path:

```js
const hasPdf = !!(pdfBase64 || pdfUrl);   // false
const dl = pdfBase64 ? '<button…>' : '';  // no button
ft.textContent = "Your report is ready";  // printed anyway
```

**It caught the error, threw the PDF away, and said "Your report is ready."** Your
`downloadPdf()` function was correct the whole time — it just never got a button.

Same reason the podcasts were always national: `/api/recommendations` 404'd too, so the
widget silently used the curated fallback. It was never reaching the AI.

**Fixed four ways:**

1. `BACKEND_URL` is now `https://blueprint-2.onrender.com` — verified live
   (`/api/health` → `{ok:true, ai:true, cloudinary:true, ghl:true}`). It probes a list of
   candidates and uses whichever answers, so a mis-pasted embed self-corrects.
2. New **`POST /api/playbook`** builds and streams the PDF and does *nothing else* — no
   Cloudinary, no email, no CRM. The download can't be broken by an integration.
3. If `/api/lead` fails or returns no PDF, the widget falls back to that endpoint. The
   lead is still retried via `sendBeacon`.
4. **No more fake success.** If the PDF genuinely can't be built, the visitor sees a real
   error with your phone number. There's a specific message for rate-limiting.

Verified: with `/api/lead` forced to 404 — the exact production failure — the customer
still gets `stadium-to-screen-playbook.pdf`. With everything failing, they get an honest
error and the success panel never appears.

---

## 2. The audience numbers

The old model multiplied devices off **every household in the market** instead of the fan
households we can reach, so the funnel got *wider* as it got more specific:

| | Old | Problem |
|---|---|---|
| Households | 940,000 | — |
| Fan base | 470,000 | counted *people*, so fans looked smaller than houses |
| Matchable devices | 3,825,800 | 4× the households, 8× the fan base |

Now every line narrows, in **homes**, and only the last changes unit to **screens**:

```
Homes in your market       940,000
Football-fan homes         188,000   20% of homes
Homes we can reach         161,680   86% of fan homes
Screens inside those homes 658,037   ~4.1 screens per home
```

With this on screen and in the PDF:

> **Why is the last number bigger?** The first three lines count homes and get smaller at
> every step. The last counts screens — the average reachable home has about 4.1 connected
> screens. So 161,680 homes give us roughly 658,037 places to show your ad. It is not
> 658,037 extra households.

"Fan base" no longer sits next to a household count. It appears once, in context:
*"Roughly 413,600 football fans live inside those 188,000 fan homes."*

Funnel figures use full numbers (`161,680`), not `162K` — precision reads as credible in a
quote. **Pricing tiers are unchanged**; every market lands where it did before.

Verified: the widget's inline model and `public/data.js` now return identical numbers for
every market, so the screen and the PDF can't disagree.

---

## 3. The form and the gate

| Removed | Why |
|---|---|
| Monthly budget | Already chosen in the package above |
| Timeline | Season is starting |
| Anything else we should know | Open textarea mid-conversion, unused |
| Company website | Redundant with company |
| The blur-gate over the results | You were being asked to "unlock" details you hadn't seen |
| "Unlock full report" / "Compare packages" | Same reason |

The form is now **name, email, company, phone** — and it comes *after* the full breakdown
is visible, not on top of a blurred one. Honeypot kept.

"Full breakdown" / "report" is **Playbook** everywhere — page, button, PDF header, email
subject, filename.

---

## 4. Logos and local podcasts

Streaming services and sports networks render as brand tiles with real logos, styled in
your existing dark theme. Four-step chain so a box is never empty:
`public/logos/<domain>.svg` → Clearbit → favicon → coloured monogram. Drop official SVGs
into `public/logos/` to lock them in permanently.

**Podcasts.** I called your live endpoint for the Bengals. The AI returned:

```
The Bill Simmons Podcast · Pardon My Take · The Lowe Post · Around the NFL · The Rich Eisen Show
```

Five national shows, zero local, and *The Lowe Post is an NBA podcast*. The AI was fine —
the old prompt just asked for "5-7 real sports/football podcasts on major DSPs".

Now: the prompt requires at least 3 local/team shows tagged and listed first; the server
injects them if the model ignores it; and there's a curated fallback. The tool splits them
into **Local & team shows · [City]** with a green LOCAL badge, and **National** below.

Add your own in `LOCAL_OVERRIDES` near the top of the builder script — that's the only place.

---

## 5. Also fixed

The PDF was **9 pages, 6 of them blank**, with page numbers reading "1 / 3" on page 5. The
footer draws below the bottom margin, so PDFKit appended a page for each one. **Now 3 clean
pages.**

---

## Two things for you

**Set these on Render** — `/api/health` says they're off:

| Variable | Effect |
|---|---|
| `SMTP_URL` + `MAIL_FROM` | Prospects are **not** being emailed their Playbook. The tool no longer claims they are, and will start claiming it automatically once this is set. |
| `ADMIN_TOKEN` | `/leads` is disabled — you can't see captured leads |
| `CALENDAR_URL` | "Book a strategy call" never appears next to the download |
| `NOTIFY_WEBHOOK_URL` | No instant ping when a lead lands |

**There are two copies of the page.** `index.html` (86 KB) at the repo root and
`public/index.html` (94 KB). I patched `public/index.html` — it's the one Render serves and
the one with the GoHighLevel full-bleed styling. The root copy is stale and now differs;
delete it or replace it with the patched file so you don't edit the wrong one.

---

## Test results

| Test | Result |
|---|---|
| Funnel narrows | 940,000 → 188,000 → 161,680 → 658,037 |
| No blur gate | Details visible immediately |
| Logos | 14 brand tiles, none empty |
| Local podcasts | 3 local of 7 shows |
| Form fields | name, email, company, phone (+ honeypot) |
| PDF downloads | `stadium-to-screen-playbook.pdf` |
| `/api/lead` returns 404 | **PDF still delivered** |
| Everything fails | Honest error, no fake success |
| JS errors | None |
| Widget vs server model | Identical across 4 markets |
