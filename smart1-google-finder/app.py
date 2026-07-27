import json
import os
import secrets
import sqlite3
import time
from urllib.parse import urlencode

import requests
from flask import Flask, redirect, render_template, request, session, url_for, jsonify
from flask_session import Session
from cryptography.fernet import Fernet, InvalidToken
from werkzeug.middleware.proxy_fix import ProxyFix

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", secrets.token_hex(32))
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

# Keep OAuth refresh tokens server-side instead of inside Flask's signed browser cookie.
app.config.update(
    SESSION_TYPE="filesystem",
    SESSION_FILE_DIR=os.environ.get("SESSION_FILE_DIR", "/tmp/smart1-google-finder-sessions"),
    SESSION_PERMANENT=False,
    SESSION_USE_SIGNER=True,
)
Session(app)

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
CACHE_SECONDS = int(os.environ.get("CACHE_SECONDS", "900"))
TOKEN_DB_PATH = os.environ.get("TOKEN_DB_PATH", "/var/data/google_tokens.db")
TOKEN_ENCRYPTION_KEY = os.environ.get("TOKEN_ENCRYPTION_KEY", "")

ALLOWED_EMAILS = {
    x.strip().lower()
    for x in os.environ.get("ALLOWED_EMAILS", "").split(",")
    if x.strip()
}

SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/analytics.readonly",
    "https://www.googleapis.com/auth/tagmanager.readonly",
]

# Cache is keyed by Google login so each account can refresh independently.
CACHE = {}


def load_aliases():
    path = os.path.join(os.path.dirname(__file__), "clients.json")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _fernet():
    if not TOKEN_ENCRYPTION_KEY:
        raise RuntimeError("TOKEN_ENCRYPTION_KEY is not configured.")
    try:
        return Fernet(TOKEN_ENCRYPTION_KEY.encode("utf-8"))
    except Exception as exc:
        raise RuntimeError("TOKEN_ENCRYPTION_KEY must be a valid Fernet key.") from exc


def _db():
    db_dir = os.path.dirname(TOKEN_DB_PATH)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(TOKEN_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS google_accounts (
            email TEXT PRIMARY KEY,
            refresh_token_enc TEXT NOT NULL,
            connected_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        """
    )
    conn.commit()
    return conn


def connected_accounts():
    try:
        with _db() as conn:
            rows = conn.execute(
                "SELECT email, refresh_token_enc FROM google_accounts ORDER BY email"
            ).fetchall()
        f = _fernet()
        accounts = []
        for row in rows:
            try:
                token = f.decrypt(row["refresh_token_enc"].encode("utf-8")).decode("utf-8")
            except InvalidToken:
                continue
            accounts.append({"email": row["email"], "refresh_token": token})
        return accounts
    except Exception:
        return []


def save_account(email, refresh_token):
    now = int(time.time())
    token_enc = _fernet().encrypt(refresh_token.encode("utf-8")).decode("utf-8")
    with _db() as conn:
        conn.execute(
            """
            INSERT INTO google_accounts (email, refresh_token_enc, connected_at, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(email) DO UPDATE SET
                refresh_token_enc=excluded.refresh_token_enc,
                updated_at=excluded.updated_at
            """,
            (email.lower(), token_enc, now, now),
        )
        conn.commit()


def delete_account(email):
    with _db() as conn:
        conn.execute("DELETE FROM google_accounts WHERE email = ?", (email.lower(),))
        conn.commit()


def is_allowed(email):
    return not ALLOWED_EMAILS or email.lower() in ALLOWED_EMAILS


def refresh_access_token(refresh_token):
    r = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def google_get(access_token, url, params=None):
    r = requests.get(
        url,
        headers={"Authorization": f"Bearer {access_token}"},
        params=params or {},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def fetch_ga_items(access_token, google_login):
    items = []
    token = None
    while True:
        params = {"pageSize": 200}
        if token:
            params["pageToken"] = token
        data = google_get(
            access_token,
            "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
            params=params,
        )
        for acct in data.get("accountSummaries", []):
            account_resource = acct.get("account", "")
            account_id = account_resource.split("/")[-1] if account_resource else ""
            account_name = acct.get("displayName", "")
            for prop in acct.get("propertySummaries", []):
                property_resource = prop.get("property", "")
                property_id = property_resource.split("/")[-1] if property_resource else ""
                property_name = prop.get("displayName", "")
                items.append({
                    "platform": "Google Analytics",
                    "type": "GA4 Property",
                    "name": property_name,
                    "account_name": account_name,
                    "account_id": account_id,
                    "resource_id": property_id,
                    "search_extra": "",
                    "google_login": google_login,
                    "open_url": f"https://analytics.google.com/analytics/web/#/p{property_id}" if property_id else "",
                })
        token = data.get("nextPageToken")
        if not token:
            break
    return items


def fetch_gtm_items(access_token, google_login):
    items = []
    token = None
    accounts = []
    while True:
        params = {}
        if token:
            params["pageToken"] = token
        data = google_get(access_token, "https://tagmanager.googleapis.com/tagmanager/v2/accounts", params=params)
        accounts.extend(data.get("account", []))
        token = data.get("nextPageToken")
        if not token:
            break

    for acct in accounts:
        account_id = acct.get("accountId", "")
        account_name = acct.get("name", "")
        parent = acct.get("path") or f"accounts/{account_id}"
        ctoken = None
        while True:
            params = {}
            if ctoken:
                params["pageToken"] = ctoken
            data = google_get(
                access_token,
                f"https://tagmanager.googleapis.com/tagmanager/v2/{parent}/containers",
                params=params,
            )
            for c in data.get("container", []):
                public_id = c.get("publicId", "")
                container_id = c.get("containerId", "")
                container_name = c.get("name", "")
                domains = " ".join(c.get("domainName", []) or [])
                items.append({
                    "platform": "Google Tag Manager",
                    "type": "GTM Container",
                    "name": container_name,
                    "account_name": account_name,
                    "account_id": account_id,
                    "resource_id": public_id or container_id,
                    "search_extra": domains,
                    "google_login": google_login,
                    "open_url": f"https://tagmanager.google.com/#/container/accounts/{account_id}/containers/{container_id}" if account_id and container_id else "",
                })
            ctoken = data.get("nextPageToken")
            if not ctoken:
                break
    return items


def client_alias_tokens(query):
    aliases = load_aliases()
    q = query.lower().strip()
    tokens = {q}
    for canonical, data in aliases.items():
        vals = [canonical] + data.get("aliases", [])
        lowered = [str(v).lower() for v in vals]
        if any(q in v or v in q for v in lowered):
            tokens.update(lowered)
    return tokens


def get_account_index(account, force=False):
    email = account["email"].lower()
    cached = CACHE.get(email, {"expires": 0, "items": []})
    now = time.time()
    if not force and cached["expires"] > now:
        return cached["items"]

    access_token = refresh_access_token(account["refresh_token"])
    items = fetch_ga_items(access_token, email) + fetch_gtm_items(access_token, email)
    CACHE[email] = {"expires": now + CACHE_SECONDS, "items": items}
    return items


def get_index(force=False):
    items = []
    errors = []
    for account in connected_accounts():
        try:
            items.extend(get_account_index(account, force=force))
        except Exception as exc:
            errors.append({"email": account.get("email", "unknown"), "error": str(exc)})
    return items, errors


@app.route("/")
def index():
    return render_template(
        "index.html",
        accounts=[a.get("email", "") for a in connected_accounts()],
    )


@app.route("/login")
def login():
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        return "Google OAuth environment variables are not configured.", 500

    state = secrets.token_urlsafe(24)
    session["oauth_state"] = state
    redirect_uri = url_for("oauth_callback", _external=True, _scheme="https")
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent select_account",
        "include_granted_scopes": "true",
        "state": state,
    }
    return redirect("https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params))


@app.route("/oauth2callback")
def oauth_callback():
    if request.args.get("state") != session.get("oauth_state"):
        return "Invalid OAuth state.", 400
    code = request.args.get("code")
    if not code:
        return "Google authorization failed.", 400

    redirect_uri = url_for("oauth_callback", _external=True, _scheme="https")
    token_resp = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
        timeout=30,
    )
    token_resp.raise_for_status()
    token = token_resp.json()

    access_token = token.get("access_token")
    refresh_token = token.get("refresh_token")
    if not access_token:
        return "Google did not return an access token.", 400

    userinfo = requests.get(
        "https://openidconnect.googleapis.com/v1/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=30,
    )
    userinfo.raise_for_status()
    email = userinfo.json().get("email", "").lower()

    if not email or not is_allowed(email):
        return "This Google account is not allowed to connect to this finder.", 403

    existing = next((a for a in connected_accounts() if a.get("email", "").lower() == email), None)

    if not refresh_token and not existing:
        return "Google did not return a refresh token. Remove this app from your Google account permissions, then reconnect.", 400

    if refresh_token:
        save_account(email, refresh_token)
    CACHE.pop(email, None)
    return redirect(url_for("index"))


@app.route("/disconnect/<path:email>", methods=["POST"])
def disconnect(email):
    email = email.lower()
    delete_account(email)
    CACHE.pop(email, None)
    return jsonify({"ok": True})


@app.route("/logout")
def logout():
    # Clears only the browser session/OAuth state. Connected Google accounts remain
    # stored on the persistent disk until explicitly disconnected.
    session.clear()
    return redirect(url_for("index"))


@app.route("/api/search")
def api_search():
    if not connected_accounts():
        return jsonify({"error": "No Google accounts connected."}), 401

    q = (request.args.get("q") or "").strip()
    platform = (request.args.get("platform") or "all").lower()
    if not q:
        return jsonify({"results": [], "errors": []})

    tokens = client_alias_tokens(q)
    indexed, errors = get_index()
    results = []
    seen = set()

    for item in indexed:
        if platform == "analytics" and item["platform"] != "Google Analytics":
            continue
        if platform == "gtm" and item["platform"] != "Google Tag Manager":
            continue

        haystack = " ".join([
            item.get("name", ""), item.get("account_name", ""), item.get("account_id", ""),
            item.get("resource_id", ""), item.get("search_extra", ""), item.get("google_login", "")
        ]).lower()
        if any(t and t in haystack for t in tokens):
            # If the exact same property/container is visible to multiple logins, keep each login visible.
            key = (item.get("platform"), item.get("account_id"), item.get("resource_id"), item.get("google_login"))
            if key not in seen:
                seen.add(key)
                results.append(item)

    results.sort(key=lambda x: (x.get("name", "").lower(), x.get("google_login", "")))
    return jsonify({"results": results[:200], "errors": errors})


@app.route("/api/refresh", methods=["POST"])
def api_refresh():
    if not connected_accounts():
        return jsonify({"error": "No Google accounts connected."}), 401
    items, errors = get_index(force=True)
    return jsonify({"ok": not errors, "count": len(items), "errors": errors})


@app.route("/health")
def health():
    return {"ok": True}


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "10000")))
