# Smart 1 Proposal Builder

Guided, click-through campaign → proposal builder for Smart 1 Marketing.
Runs entirely in the browser and calls the Smart 1 API (on Render) for the
AI business description and AI audience/population estimate.

## Files
| File | What it is |
|---|---|
| `index.html` | The proposal builder app (this is what gets hosted/embedded). |
| `embed.html` | A full-page iframe wrapper + copy-paste embed snippet. |
| `estimate_audience_route.py` | The one Flask route to add to your `app.py` for the AI population estimate. |

---

## Publish it (GitHub Pages → public URL)

1. Create a new GitHub repo, e.g. **smart1-proposal-builder**.
2. Upload these files to the repo root (drag-and-drop on github.com works).
3. Repo → **Settings → Pages**.
4. Under **Build and deployment → Source**, choose **Deploy from a branch**.
5. Branch: **main**, folder: **/ (root)** → **Save**.
6. Wait ~1 minute. Your live URL will be:

   `https://YOURUSERNAME.github.io/smart1-proposal-builder/`

That URL serves `index.html` (the builder) directly.

---

## Embed it (Simvoly, WordPress, anywhere)

Add an **Embed / Custom HTML** element on the page and paste ONLY this,
swapping in your Pages URL:

```html
<iframe
  src="https://YOURUSERNAME.github.io/smart1-proposal-builder/"
  title="Smart 1 Proposal Builder"
  style="width:100%;height:90vh;min-height:760px;border:0;display:block"
  loading="lazy"></iframe>
```

The iframe keeps the builder isolated, so its styles never collide with the
site theme. Give the page a blank / full-width template so only the iframe shows.

---

## AI endpoints

The builder calls two routes on your API (CORS is already open on `/api/*`,
so cross-origin calls from GitHub Pages work):

- `POST /api/generate-business-description` — already exists in `app.py`.
- `POST /api/estimate-audience` — **new**. Paste `estimate_audience_route.py`
  into `app.py` just above `@app.errorhandler(Exception)` and redeploy.

The API base is set near the top of `index.html`'s script:

```js
let API_BASE="https://insertionordersmart.onrender.com";
```

Change it if your API moves. The in-app "⚙ AI endpoint" button can also
override it at runtime. If the API is unreachable, the builder falls back to a
built-in estimate so it never blocks the salesperson.

---

## Updating
Edit `index.html`, commit, and GitHub Pages redeploys automatically (~1 min).
