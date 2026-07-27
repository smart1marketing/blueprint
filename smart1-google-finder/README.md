# Smart 1 Google Account Finder — Multi-Account Version

Internal Flask app that connects multiple Google identities and searches their accessible Google Analytics 4 properties and Google Tag Manager containers together.

## Intended Smart 1 logins

- `adops@smart1marketing.com`
- `smartadops@gmail.com`
- `smart1sites@gmail.com`

Each search result shows **Google Login** so staff know which identity contains or can access that GA4 property or GTM container.

## Google Cloud setup

1. Create/select one Google Cloud project.
2. Enable **Google Analytics Admin API** and **Google Tag Manager API**.
3. Configure the OAuth consent screen.
4. Create one OAuth 2.0 Client ID for a **Web application**.
5. Add your Render callback URI:
   `https://YOUR-SERVICE.onrender.com/oauth2callback`
6. If the OAuth app is in Testing mode, add all three Google identities as test users.

## Render

Build command:
`pip install -r requirements.txt`

Start command:
`gunicorn app:app`

Environment variables:

- `GOOGLE_CLIENT_ID` = OAuth Web Client ID
- `GOOGLE_CLIENT_SECRET` = OAuth Web Client Secret
- `FLASK_SECRET_KEY` = a long random string
- `CACHE_SECONDS` = `900`
- `ALLOWED_EMAILS` = `adops@smart1marketing.com,smartadops@gmail.com,smart1sites@gmail.com`

Do **not** use `ALLOWED_EMAIL_DOMAIN`, because two of the intended identities are Gmail accounts.

## Connect all three accounts

1. Open the Render app directly.
2. Click **Add Google Account**.
3. Connect the first identity and grant read-only Analytics + Tag Manager permissions.
4. Click **Add Google Account** again and select the second identity.
5. Repeat for the third identity.
6. Search normally; results are merged across all connected identities.

## Session note

OAuth refresh tokens are stored in a server-side filesystem session under `/tmp`, not in the browser cookie. Render's local filesystem is ephemeral, so after some deployments/restarts you may need to reconnect the three Google identities. This keeps the initial version free and avoids adding a database/Redis dependency.

## Search coverage

- GA4 property names and IDs
- Analytics account names and IDs
- GTM container names and public IDs (`GTM-...`)
- GTM account names and IDs
- GTM domains when Google provides them
- Google login email
- aliases from `clients.json`

## Embed

```html
<iframe
  src="https://YOUR-SERVICE.onrender.com/"
  width="100%"
  height="800"
  style="border:0;border-radius:14px;overflow:hidden;"
  loading="lazy"
  referrerpolicy="strict-origin-when-cross-origin">
</iframe>
```

Google OAuth itself is best completed by opening the Render app directly in a browser tab. Once the accounts are connected, test the iframe in Smart 1 Suite/Simvoly.
