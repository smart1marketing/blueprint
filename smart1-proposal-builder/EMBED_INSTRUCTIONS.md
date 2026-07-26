# Fixing the Proposal Builder embed

## What's wrong
The builder's full HTML page was pasted directly into the WordPress page, so its
global styles and its fixed top/bottom bars collide with the WooCommerce theme.
Fix: run the builder in its own document and embed it with an **iframe**.

---

## Recommended: serve it from Render, iframe it on WordPress
This keeps the builder same-origin with your API (no CORS, no "AI endpoint" prompt).

### 1. Add the builder file to your app
Put `smart1_proposal_wizard_v2.html` into your project's `templates/` folder and
rename it `proposal.html` (next to your existing `index.html`).

### 2. In that file, set the API base to same-origin
Find this line near the top of its <script>:

    let API_BASE="https://insertionordersmart.onrender.com";

and change it to:

    let API_BASE="";   // same origin — served from this Flask app

### 3. Add this route to app.py (near the `/` route, ~line 65)

    @app.get('/proposal-builder')
    def proposal_builder():
        return render_template('proposal.html')

Commit + redeploy. Confirm it loads at:
https://insertionordersmart.onrender.com/proposal-builder

### 4. On the WordPress page, replace the pasted HTML with ONLY this
(Use a "Custom HTML" block — delete everything else you pasted before.)

    <iframe
      src="https://insertionordersmart.onrender.com/proposal-builder"
      title="Smart 1 Proposal Builder"
      style="width:100%;height:90vh;min-height:760px;border:0;display:block"
      loading="lazy"></iframe>

The fixed top/bottom bars now stay inside the iframe, and the builder scrolls
within it — no collision with the theme.

---

## Alternative: no redeploy (host the file on WordPress)
1. Upload `smart1_proposal_wizard_v2.html` to Media (or /wp-content/uploads/).
   Copy its URL, e.g. https://smart1marketing.com/wp-content/uploads/2026/07/smart1_proposal_wizard_v2.html
2. Leave API_BASE as the Render URL (cross-origin is fine — CORS is open on /api/*).
3. On the page, use the same iframe block but point src at that uploaded URL:

    <iframe
      src="https://smart1marketing.com/wp-content/uploads/2026/07/smart1_proposal_wizard_v2.html"
      title="Smart 1 Proposal Builder"
      style="width:100%;height:90vh;min-height:760px;border:0;display:block"
      loading="lazy"></iframe>

---

## Notes
- If the page still shows the shop "Add to cart / Sold Out" template, switch the
  WordPress page template to a blank/full-width one (not the product template) so
  only the iframe shows.
- `height:90vh` makes the builder fill most of the screen and scroll internally.
  If you'd rather it grow to fit content (no inner scrollbar), I can add
  auto-resize (postMessage) so the parent page height adjusts automatically.
