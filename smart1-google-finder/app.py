import json
import os
import secrets
import time
from functools import wraps
from urllib.parse import urlencode

import requests
from flask import Flask, redirect, render_template, request, session, url_for, jsonify
from werkzeug.middleware.proxy_fix import ProxyFix

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", secrets.token_hex(32))
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
ALLOWED_EMAIL_DOMAIN = os.environ.get("ALLOWED_EMAIL_DOMAIN", "")
CACHE_SECONDS = int(os.environ.get("CACHE_SECONDS", "900"))

SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/analytics.readonly",
    "https://www.googleapis.com/auth/tagmanager.readonly",
]

CACHE = {"expires": 0, "items": []}


def load_aliases():
    path = os.path.join(os.path.dirname(__file__), "clients.json")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def logged_in(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("access_token"):
            return redirect(url_for("login"))
        if ALLOWED_EMAIL_DOMAIN:
            email = (session.get("user_email") or "").lower()
            if not email.endswith("@" + ALLOWED_EMAIL_DOMAIN.lower().lstrip("@")):
                session.clear()
                return "Access denied for this Google account.", 403
        return fn(*args, **kwargs)
    return wrapper


def auth_headers():
    return {"Authorization": f"Bearer {session['access_token']}"}


def google_get(url, params=None):
    r = requests.get(url, headers=auth_headers(), params=params or {}, timeout=30)
    if r.status_code == 401:
        session.clear()
    r.raise_for_status()
    return r.json()


def fetch_ga_items():
    items = []
    token = None
    while True:
        params = {"pageSize": 200}
        if token:
            params["pageToken"] = token
        data = google_get(
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
                    "open_url": f"https://analytics.google.com/analytics/web/#/p{property_id}" if property_id else "",
                })
        token = data.get("nextPageToken")
        if not token:
            break
    return items


def fetch_gtm_items():
    items = []
    token = None
    accounts = []
    while True:
        params = {}
        if token:
            params["pageToken"] = token
        data = google_get("https://tagmanager.googleapis.com/tagmanager/v2/accounts", params=params)
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


def get_index(force=False):
    now = time.time()
    if not force and CACHE["expires"] > now:
        return CACHE["items"]
    items = fetch_ga_items() + fetch_gtm_items()
    CACHE["items"] = items
    CACHE["expires"] = now + CACHE_SECONDS
    return items


@app.route("/")
def index():
    return render_template("index.html", user_email=session.get("user_email"))


@app.route("/login")
def login():
    if not GOOGLE_CLIENT_ID:
        return "GOOGLE_CLIENT_ID is not configured.", 500
    state = secrets.token_urlsafe(24)
    session["oauth_state"] = state
    redirect_uri = url_for("oauth_callback", _external=True, _scheme="https")
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
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
    session["access_token"] = token["access_token"]
    userinfo = requests.get(
        "https://openidconnect.googleapis.com/v1/userinfo",
        headers={"Authorization": f"Bearer {token['access_token']}"},
        timeout=30,
    )
    userinfo.raise_for_status()
    info = userinfo.json()
    session["user_email"] = info.get("email", "")
    if ALLOWED_EMAIL_DOMAIN and not session["user_email"].lower().endswith("@" + ALLOWED_EMAIL_DOMAIN.lower().lstrip("@")):
        session.clear()
        return "Access denied for this Google account.", 403
    return redirect(url_for("index"))


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))


@app.route("/api/search")
@logged_in
def api_search():
    q = (request.args.get("q") or "").strip()
    platform = (request.args.get("platform") or "all").lower()
    if not q:
        return jsonify([])
    tokens = client_alias_tokens(q)
    results = []
    for item in get_index():
        if platform == "analytics" and item["platform"] != "Google Analytics":
            continue
        if platform == "gtm" and item["platform"] != "Google Tag Manager":
            continue
        haystack = " ".join([
            item.get("name", ""), item.get("account_name", ""), item.get("account_id", ""),
            item.get("resource_id", ""), item.get("search_extra", "")
        ]).lower()
        if any(t and t in haystack for t in tokens):
            results.append(item)
    return jsonify(results[:100])


@app.route("/api/refresh", methods=["POST"])
@logged_in
def api_refresh():
    items = get_index(force=True)
    return jsonify({"ok": True, "count": len(items)})


@app.route("/health")
def health():
    return {"ok": True}


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "10000")))
