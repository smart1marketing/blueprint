# Smart 1 Google Account Finder

Internal Flask app for searching across Google Analytics accounts/properties and Google Tag Manager accounts/containers.

## Google Cloud setup

1. Create or select a Google Cloud project.
2. Enable:
   - Google Analytics Admin API
   - Google Tag Manager API
3. Configure the OAuth consent screen.
4. Create an OAuth 2.0 Client ID for a **Web application**.
5. Add your Render callback URL as an authorized redirect URI:
   `https://YOUR-RENDER-SERVICE.onrender.com/oauth2callback`
6. Use a Google identity that has access to the GA and GTM accounts you want indexed.

## Render

Create a Web Service from the GitHub repo.

Build command:
`pip install -r requirements.txt`

Start command:
`gunicorn app:app`

Environment variables:

- `GOOGLE_CLIENT_ID` = OAuth web client ID
- `GOOGLE_CLIENT_SECRET` = OAuth web client secret
- `FLASK_SECRET_KEY` = long random string (Render can generate)
- `ALLOWED_EMAIL_DOMAIN` = optional, e.g. `smart1marketing.com`
- `CACHE_SECONDS` = `900`

## Search

Searches:
- Analytics property names
- Analytics account names/IDs
- GA4 property IDs
- GTM account names/IDs
- GTM container names
- GTM public IDs (`GTM-...`)
- GTM container domain names when supplied by Google
- aliases in `clients.json`

## Simvoly / Smart 1 Suite iframe

```html
<iframe
  src="https://YOUR-RENDER-SERVICE.onrender.com/"
  width="100%"
  height="760"
  style="border:0;border-radius:14px;overflow:hidden;"
  loading="lazy"
  referrerpolicy="strict-origin-when-cross-origin">
</iframe>
```

## Important note about OAuth inside iframes

Google sign-in may be restricted in some embedded/browser contexts. The easiest setup is to sign in to the Render URL directly once, then use the internal page. If your embedded environment blocks the auth flow or session cookies, link the "Connect Google" step to open the Render app in a new tab.

## Optional next phase

Add workspace/tag enumeration to identify a pasted `G-XXXXXXXXXX`, Google Ads conversion ID, Meta Pixel, etc., inside GTM. This is intentionally not enabled in the base build because scanning every workspace/tag substantially increases API requests and refresh time.
