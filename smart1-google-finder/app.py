import json
import os
import secrets
import sqlite3
import time
import logging
from datetime import datetime, timedelta
from urllib.parse import urlencode

import requests
from flask import Flask, redirect, render_template, request, session, url_for, jsonify
from flask_session import Session
from cryptography.fernet import Fernet, InvalidToken
from werkzeug.middleware.proxy_fix import ProxyFix

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("google-account-finder")

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", secrets.token_hex(32))
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

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
    "https://www.googleapis.com/auth/business.manage",
    "https://www.googleapis.com/auth/webmasters.readonly",
]

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
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS saved_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_name TEXT NOT NULL,
            summary_title TEXT NOT NULL,
            property_id TEXT NOT NULL,
            google_login TEXT NOT NULL,
            report_data TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS report_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id INTEGER NOT NULL,
            notification_email TEXT NOT NULL,
            frequency TEXT NOT NULL,
            ghl_webhook_url TEXT,
            created_at INTEGER NOT NULL,
            FOREIGN KEY(report_id) REFERENCES saved_reports(id)
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
        timeout=10,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def google_get(access_token, url, params=None):
    r = requests.get(
        url,
        headers={"Authorization": f"Bearer {access_token}"},
        params=params or {},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()


def google_post(access_token, url, json_body=None):
    r = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        },
        json=json_body or {},
        timeout=15,
    )
    r.raise_for_status()
    return r.json()


def fetch_ga_items(access_token, google_login):
    items = []
    token = None
    try:
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
    except Exception as exc:
        logger.warning("Failed fetching GA4 items for %s: %s", google_login, exc)
    return items


def fetch_gtm_items(access_token, google_login):
    items = []
    token = None
    accounts = []

    try:
        while True:
            params = {}
            if token:
                params["pageToken"] = token
            data = google_get(access_token, "https://tagmanager.googleapis.com/tagmanager/v2/accounts", params=params)
            accounts.extend(data.get("account", []))
            token = data.get("nextPageToken")
            if not token:
                break
    except Exception as exc:
        logger.warning("Failed fetching GTM accounts for %s: %s", google_login, exc)
        return items

    for acct in accounts:
        account_id = acct.get("accountId", "")
        account_name = acct.get("name", "")
        parent = acct.get("path") or f"accounts/{account_id}"
        ctoken = None

        while True:
            params = {}
            if ctoken:
                params["pageToken"] = ctoken

            try:
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
            except Exception as exc:
                logger.warning("Skipping container for GTM account %s (%s): %s", account_id, google_login, exc)
                break

            if not ctoken:
                break

    return items


def fetch_gmb_items(access_token, google_login):
    items = []
    try:
        acct_data = google_get(
            access_token,
            "https://mybusinessaccountmanagement.googleapis.com/v1/accounts"
        )
        accounts = acct_data.get("accounts", [])

        for acct in accounts:
            account_resource = acct.get("name", "")
            account_id = account_resource.split("/")[-1] if account_resource else ""
            account_name = acct.get("accountName", "Google Business Profile")

            try:
                loc_data = google_get(
                    access_token,
                    f"https://mybusinessbusinessinformation.googleapis.com/v1/{account_resource}/locations",
                    params={"readMask": "name,title,websiteUri,storefrontAddress,locationState"}
                )
                for loc in loc_data.get("locations", []):
                    loc_resource = loc.get("name", "")
                    loc_id = loc_resource.split("/")[-1] if loc_resource else ""
                    loc_title = loc.get("title", "(Unnamed Location)")
                    website_url = loc.get("websiteUri", "")
                    
                    loc_state = loc.get("locationState", {})
                    is_verified = loc_state.get("isVerified", False)
                    has_pending = loc_state.get("hasPendingVerification", False)
                    
                    if is_verified:
                        claimed_status = "Claimed & Verified"
                    elif has_pending:
                        claimed_status = "Verification Pending"
                    else:
                        claimed_status = "Unclaimed / Unverified"

                    address_data = loc.get("storefrontAddress", {})
                    address_str = " ".join(address_data.get("addressLines", []) or [])

                    items.append({
                        "platform": "Google Business Profile",
                        "type": f"GMB Listing ({claimed_status})",
                        "name": loc_title,
                        "account_name": account_name,
                        "account_id": account_id,
                        "resource_id": loc_id,
                        "search_extra": f"{website_url} {address_str} {claimed_status}".strip(),
                        "google_login": google_login,
                        "open_url": f"https://business.google.com/dashboard/l/{loc_id}" if loc_id else "https://business.google.com/",
                    })
            except Exception as loc_exc:
                logger.warning("Failed fetching locations for GMB account %s (%s): %s", account_id, google_login, loc_exc)

    except Exception as exc:
        logger.warning("Failed fetching GMB accounts for %s: %s", google_login, exc)

    return items


def fetch_gsc_items(access_token, google_login):
    items = []
    try:
        data = google_get(access_token, "https://www.googleapis.com/webmasters/v3/sites")
        entries = data.get("siteEntry", [])
        for site in entries:
            site_url = site.get("siteUrl", "")
            permission = site.get("permissionLevel", "")
            
            items.append({
                "platform": "Search Console",
                "type": "GSC Property",
                "name": site_url,
                "account_name": f"Permission: {permission}",
                "account_id": site_url,
                "resource_id": site_url,
                "search_extra": permission,
                "google_login": google_login,
                "open_url": f"https://search.google.com/search-console?resource_id={urlencode({'': site_url})[1:]}",
            })
    except Exception as exc:
        logger.warning("Failed fetching Search Console sites for %s: %s", google_login, exc)

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
    items = (
        fetch_ga_items(access_token, email)
        + fetch_gtm_items(access_token, email)
        + fetch_gmb_items(access_token, email)
        + fetch_gsc_items(access_token, email)
    )
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


def generate_ga4_ai_analysis(p1_name, p2_name, m1, m2, dimension_breakdown):
    sessions_p1 = m1.get("sessions", 0)
    sessions_p2 = m2.get("sessions", 0)
    users_p1 = m1.get("activeUsers", 0)
    users_p2 = m2.get("activeUsers", 0)
    conversions_p1 = m1.get("keyEvents", 0)
    conversions_p2 = m2.get("keyEvents", 0)

    sess_change = ((sessions_p1 - sessions_p2) / sessions_p2 * 100) if sessions_p2 > 0 else 0
    user_change = ((users_p1 - users_p2) / users_p2 * 100) if users_p2 > 0 else 0
    conv_change = ((conversions_p1 - conversions_p2) / conversions_p2 * 100) if conversions_p2 > 0 else 0

    if sess_change > 5:
        summary_tone = "Positive Traffic Growth"
        verdict = f"Overall traffic grew by **+{sess_change:.1f}%** during {p1_name} compared to {p2_name}."
    elif sess_change < -5:
        summary_tone = "Traffic Decline Warning"
        verdict = f"Traffic decreased by **{sess_change:.1f}%** during {p1_name} compared to {p2_name}."
    else:
        summary_tone = "Stable Performance"
        verdict = f"Traffic remained relatively flat (**{sess_change:+.1f}%**) between periods."

    insights = [verdict]

    if dimension_breakdown:
        top_gainer = max(dimension_breakdown, key=lambda x: x.get("session_diff", 0), default=None)
        top_loser = min(dimension_breakdown, key=lambda x: x.get("session_diff", 0), default=None)

        if top_gainer and top_gainer.get("session_diff", 0) > 0:
            insights.append(
                f"🚀 **Primary Growth Driver:** `{top_gainer['name']}` added **+{top_gainer['session_diff']:,}** sessions "
                f"({top_gainer['p2_sessions']:,} → {top_gainer['p1_sessions']:,})."
            )

        if top_loser and top_loser.get("session_diff", 0) < 0:
            insights.append(
                f"⚠️ **Largest Traffic Drop:** `{top_loser['name']}` dropped by **{top_loser['session_diff']:,}** sessions "
                f"({top_loser['p2_sessions']:,} → {top_loser['p1_sessions']:,})."
            )

    c_rate_p1 = (conversions_p1 / sessions_p1 * 100) if sessions_p1 > 0 else 0
    c_rate_p2 = (conversions_p2 / sessions_p2 * 100) if sessions_p2 > 0 else 0
    if c_rate_p1 or c_rate_p2:
        insights.append(
            f"🎯 **Conversion Rate:** Shifted from **{c_rate_p2:.2f}%** to **{c_rate_p1:.2f}%** "
            f"({conv_change:+.1f}% change in total key events)."
        )

    return {
        "status": summary_tone,
        "sess_change_pct": round(sess_change, 1),
        "user_change_pct": round(user_change, 1),
        "conv_change_pct": round(conv_change, 1),
        "insights": insights,
    }


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
    try:
        google_error = request.args.get("error")
        if google_error:
            desc = request.args.get("error_description", "Google declined authorization.")
            logger.error("OAuth callback returned Google error: %s - %s", google_error, desc)
            return f"OAuth authorization failed: {google_error}. {desc}", 400

        expected_state = session.get("oauth_state")
        received_state = request.args.get("state")
        if not expected_state or received_state != expected_state:
            logger.error("OAuth state mismatch. expected_present=%s received_present=%s", bool(expected_state), bool(received_state))
            return "OAuth state validation failed. Start again from Connect Google Account.", 400

        code = request.args.get("code")
        if not code:
            return "Google returned to the callback without an authorization code.", 400

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
            timeout=10,
        )
        if not token_resp.ok:
            return f"Google token exchange failed (HTTP {token_resp.status_code}).", 500

        token = token_resp.json()
        access_token = token.get("access_token")
        refresh_token = token.get("refresh_token")
        if not access_token:
            return "Google did not return an access token.", 500

        userinfo = requests.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        if not userinfo.ok:
            return f"Google login succeeded, but profile lookup failed.", 500

        email = userinfo.json().get("email", "").lower()
        if not email or not is_allowed(email):
            return "This Google account is not allowed to connect to this finder.", 403

        existing = next((a for a in connected_accounts() if a.get("email", "").lower() == email), None)
        if not refresh_token and not existing:
            return "Google did not issue a refresh token. Remove this app from your Google account permissions, then reconnect.", 400

        if refresh_token:
            save_account(email, refresh_token)

        session.pop("oauth_state", None)
        CACHE.pop(email, None)
        return redirect(url_for("index"))
    except Exception as exc:
        logger.exception("Unhandled OAuth callback error")
        return f"Authentication failed: {exc}", 500


@app.route("/disconnect/<path:email>", methods=["POST"])
def disconnect(email):
    email = email.lower()
    delete_account(email)
    CACHE.pop(email, None)
    return jsonify({"ok": True})


@app.route("/logout")
def logout():
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
        if platform == "gmb" and item["platform"] != "Google Business Profile":
            continue
        if platform == "gsc" and item["platform"] != "Search Console":
            continue

        haystack = " ".join([
            item.get("name", ""), item.get("account_name", ""), item.get("account_id", ""),
            item.get("resource_id", ""), item.get("search_extra", ""), item.get("google_login", "")
        ]).lower()
        if any(t and t in haystack for t in tokens):
            key = (item.get("platform"), item.get("account_id"), item.get("resource_id"), item.get("google_login"))
            if key not in seen:
                seen.add(key)
                results.append(item)

    results.sort(key=lambda x: (x.get("name", "").lower(), x.get("google_login", "")))
    return jsonify({"results": results[:200], "errors": errors})


@app.route("/api/ga4/compare", methods=["POST"])
def api_ga4_compare():
    data = request.json or {}
    property_id = data.get("property_id", "").strip()
    google_login = data.get("google_login", "").strip().lower()
    period_type = data.get("period_type", "previous_period")
    scope_type = data.get("scope_type", "site")
    page_path = data.get("page_path", "").strip()
    source_medium = data.get("source_medium", "").strip()

    p1_start = data.get("p1_start")
    p1_end = data.get("p1_end")
    p2_start = data.get("p2_start")
    p2_end = data.get("p2_end")

    if not property_id or not google_login:
        return jsonify({"error": "Missing GA4 Property ID or Google Login."}), 400

    account = next((a for a in connected_accounts() if a["email"] == google_login), None)
    if not account:
        return jsonify({"error": f"Account {google_login} is not connected."}), 404

    try:
        access_token = refresh_access_token(account["refresh_token"])
    except Exception as exc:
        return jsonify({"error": f"Failed to authenticate {google_login}: {exc}"}), 401

    today = datetime.utcnow().date()
    if not p1_start or not p1_end:
        p1_end_dt = today - timedelta(days=1)
        p1_start_dt = p1_end_dt - timedelta(days=29)
        p1_start = p1_start_dt.strftime("%Y-%m-%d")
        p1_end = p1_end_dt.strftime("%Y-%m-%d")
    else:
        p1_start_dt = datetime.strptime(p1_start, "%Y-%m-%d").date()
        p1_end_dt = datetime.strptime(p1_end, "%Y-%m-%d").date()

    num_days = (p1_end_dt - p1_start_dt).days + 1

    if period_type == "previous_period":
        p2_end_dt = p1_start_dt - timedelta(days=1)
        p2_start_dt = p2_end_dt - timedelta(days=num_days - 1)
        p2_start = p2_start_dt.strftime("%Y-%m-%d")
        p2_end = p2_end_dt.strftime("%Y-%m-%d")
        p2_label = f"Prior {num_days} Days ({p2_start} to {p2_end})"
    elif period_type == "previous_year":
        p2_start = p1_start_dt.replace(year=p1_start_dt.year - 1).strftime("%Y-%m-%d")
        p2_end = p1_end_dt.replace(year=p1_end_dt.year - 1).strftime("%Y-%m-%d")
        p2_label = f"Previous Year ({p2_start} to {p2_end})"
    else:
        p2_label = f"Custom Period ({p2_start} to {p2_end})"

    p1_label = f"Selected Period ({p1_start} to {p1_end})"

    dimension_name = "pagePath" if scope_type in ["page", "multiple"] else "sessionSourceMedium"
    dimension_filter = None
    expressions = []

    if scope_type == "page" and page_path:
        expressions.append({
            "filter": {
                "fieldName": "pagePath",
                "stringFilter": {"matchType": "EXACT", "value": page_path}
            }
        })
    elif scope_type == "multiple" and page_path:
        expressions.append({
            "filter": {
                "fieldName": "pagePath",
                "stringFilter": {"matchType": "PARTIAL_REGEXP", "value": page_path}
            }
        })

    if source_medium:
        expressions.append({
            "filter": {
                "fieldName": "sessionSourceMedium",
                "stringFilter": {"matchType": "CONTAINS", "value": source_medium}
            }
        })

    if len(expressions) == 1:
        dimension_filter = expressions[0]["filter"]
    elif len(expressions) > 1:
        dimension_filter = {"andGroup": {"expressions": expressions}}

    req_body = {
        "dateRanges": [
            {"startDate": p1_start, "endDate": p1_end, "name": "period_1"},
            {"startDate": p2_start, "endDate": p2_end, "name": "period_2"}
        ],
        "dimensions": [{"name": dimension_name}],
        "metrics": [
            {"name": "sessions"},
            {"name": "activeUsers"},
            {"name": "keyEvents"}
        ],
        "limit": 50
    }
    if dimension_filter:
        req_body["dimensionFilter"] = dimension_filter

    url = f"https://analyticsdata.googleapis.com/v1beta/properties/{property_id}:runReport"
    
    try:
        report = google_post(access_token, url, req_body)
    except Exception as exc:
        return jsonify({"error": f"GA4 Data API call failed: {exc}"}), 500

    m1 = {"sessions": 0, "activeUsers": 0, "keyEvents": 0}
    m2 = {"sessions": 0, "activeUsers": 0, "keyEvents": 0}
    breakdown_map = {}

    for row in report.get("rows", []):
        dim_val = row["dimensionValues"][0]["value"]
        range_idx = row.get("dateRange", "period_1")
        
        sess = int(row["metricValues"][0]["value"])
        users = int(row["metricValues"][1]["value"])
        convs = int(row["metricValues"][2]["value"])

        if dim_val not in breakdown_map:
            breakdown_map[dim_val] = {"name": dim_val, "p1_sessions": 0, "p2_sessions": 0}

        if range_idx == "period_1" or range_idx == "date_range_0":
            m1["sessions"] += sess
            m1["activeUsers"] += users
            m1["keyEvents"] += convs
            breakdown_map[dim_val]["p1_sessions"] += sess
        else:
            m2["sessions"] += sess
            m2["activeUsers"] += users
            m2["keyEvents"] += convs
            breakdown_map[dim_val]["p2_sessions"] += sess

    breakdown_list = []
    for k, v in breakdown_map.items():
        v["session_diff"] = v["p1_sessions"] - v["p2_sessions"]
        breakdown_list.append(v)

    ai_result = generate_ga4_ai_analysis(p1_label, p2_label, m1, m2, breakdown_list)

    return jsonify({
        "property_id": property_id,
        "p1_label": p1_label,
        "p2_label": p2_label,
        "metrics_p1": m1,
        "metrics_p2": m2,
        "breakdown": sorted(breakdown_list, key=lambda x: abs(x["session_diff"]), reverse=True)[:10],
        "ai_analysis": ai_result
    })


@app.route("/api/reports/save", methods=["POST"])
def save_report():
    data = request.json or {}
    customer_name = data.get("customer_name", "").strip()
    summary_title = data.get("summary_title", "").strip()
    property_id = data.get("property_id", "").strip()
    google_login = data.get("google_login", "").strip()
    report_data = data.get("report_data", {})

    if not customer_name or not summary_title or not report_data:
        return jsonify({"error": "Customer name, summary title, and report payload are required."}), 400

    now = int(time.time())
    with _db() as conn:
        cursor = conn.execute(
            """
            INSERT INTO saved_reports (customer_name, summary_title, property_id, google_login, report_data, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (customer_name, summary_title, property_id, google_login, json.dumps(report_data), now)
        )
        report_id = cursor.lastrowid
        conn.commit()

    return jsonify({"ok": True, "report_id": report_id, "message": "Report successfully saved."})


@app.route("/api/reports/search", methods=["GET"])
def search_reports():
    q = (request.args.get("q") or "").strip().lower()
    with _db() as conn:
        if q:
            rows = conn.execute(
                """
                SELECT id, customer_name, summary_title, property_id, google_login, created_at 
                FROM saved_reports 
                WHERE LOWER(customer_name) LIKE ? OR LOWER(summary_title) LIKE ? OR LOWER(property_id) LIKE ?
                ORDER BY created_at DESC
                """,
                (f"%{q}%", f"%{q}%", f"%{q}%")
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, customer_name, summary_title, property_id, google_login, created_at FROM saved_reports ORDER BY created_at DESC LIMIT 50"
            ).fetchall()

    reports = [dict(row) for row in rows]
    return jsonify({"reports": reports})


@app.route("/api/reports/subscribe", methods=["POST"])
def subscribe_alerts():
    data = request.json or {}
    report_id = data.get("report_id")
    notification_email = data.get("notification_email", "").strip()
    frequency = data.get("frequency", "weekly").lower()
    ghl_webhook_url = data.get("ghl_webhook_url", "").strip()

    if not report_id or not notification_email:
        return jsonify({"error": "Report ID and notification email are required."}), 400

    now = int(time.time())
    with _db() as conn:
        conn.execute(
            """
            INSERT INTO report_alerts (report_id, notification_email, frequency, ghl_webhook_url, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (report_id, notification_email, frequency, ghl_webhook_url, now)
        )
        conn.commit()

    if ghl_webhook_url:
        try:
            ghl_payload = {
                "event": "report_alert_subscribed",
                "report_id": report_id,
                "email": notification_email,
                "frequency": frequency,
                "timestamp": datetime.utcnow().isoformat(),
                "message": f"New report alert scheduled for {notification_email} ({frequency})."
            }
            requests.post(ghl_webhook_url, json=ghl_payload, timeout=5)
        except Exception as exc:
            logger.warning("Failed sending GoHighLevel webhook: %s", exc)

    return jsonify({"ok": True, "message": f"Alert subscribed for {notification_email} ({frequency})."})


@app.route("/api/refresh", methods=["POST"])
def api_refresh():
    if not connected_accounts():
        return jsonify({"error": "No Google accounts connected."}), 401
    items, errors = get_index(force=True)
    return jsonify({"ok": not errors, "count": len(items), "errors": errors})


@app.route("/health")
def health():
    checks = {
        "google_client_id_configured": bool(GOOGLE_CLIENT_ID),
        "google_client_secret_configured": bool(GOOGLE_CLIENT_SECRET),
        "token_encryption_key_configured": bool(TOKEN_ENCRYPTION_KEY),
        "token_db_path": TOKEN_DB_PATH,
        "connected_account_count": len(connected_accounts()),
    }
    checks["ok"] = all([
        checks["google_client_id_configured"],
        checks["google_client_secret_configured"],
        checks["token_encryption_key_configured"],
    ])
    return checks, (200 if checks["ok"] else 500)


@app.route("/debug/accounts")
def debug_accounts():
    diagnostics = []
    accounts = connected_accounts()
    if not accounts:
        return jsonify({"status": "No connected accounts found in token database."})

    for acc in accounts:
        email = acc.get("email", "unknown")
        info = {"email": email, "refresh_token_present": bool(acc.get("refresh_token"))}
        
        try:
            access_token = refresh_access_token(acc["refresh_token"])
            info["token_refresh_status"] = "SUCCESS"
        except Exception as exc:
            info["token_refresh_status"] = f"FAILED: {exc}"
            diagnostics.append(info)
            continue

        try:
            google_get(access_token, "https://analyticsadmin.googleapis.com/v1beta/accountSummaries", params={"pageSize": 1})
            info["ga4_api_status"] = "SUCCESS"
        except Exception as exc:
            info["ga4_api_status"] = f"FAILED: {exc}"

        try:
            google_get(access_token, "https://tagmanager.googleapis.com/tagmanager/v2/accounts")
            info["gtm_api_status"] = "SUCCESS"
        except Exception as exc:
            info["gtm_api_status"] = f"FAILED: {exc}"

        try:
            google_get(access_token, "https://www.googleapis.com/webmasters/v3/sites")
            info["gsc_api_status"] = "SUCCESS"
        except Exception as exc:
            info["gsc_api_status"] = f"FAILED: {exc}"

        diagnostics.append(info)

    return jsonify({"connected_account_count": len(accounts), "diagnostics": diagnostics})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "10000")))
