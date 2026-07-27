import json
import math
import os
import secrets
from decimal import Decimal, InvalidOperation
from functools import wraps

from dotenv import load_dotenv
load_dotenv()

from flask import (
    Flask,
    abort,
    flash,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

from config import SETTINGS
from db import (
    alert_rows,
    db_path,
    get_project,
    get_website,
    get_websites,
    infer_partner,
    init_db,
    list_plans_for_ui,
    list_templates_for_ui,
    metrics,
    query_projects,
    save_meta,
    set_lifecycle,
    upsert_project,
)
from simvoly_client import SimvolyClient, SimvolyError, unwrap_data
from sync_service import (
    discover_customer,
    import_inventory,
    refresh_known_projects,
    sync_catalog,
    sync_project,
)

app = Flask(__name__)
app.secret_key = SETTINGS.secret_key
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.getenv("FLASK_ENV") == "production",
    MAX_CONTENT_LENGTH=5 * 1024 * 1024,
)

init_db()
client = SimvolyClient()


def login_required(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        if not session.get("authenticated"):
            return redirect(url_for("login", next=request.path))
        return fn(*args, **kwargs)
    return wrapped


def require_csrf():
    supplied = request.form.get("csrf_token") or request.headers.get("X-CSRF-Token")
    expected = session.get("csrf")
    if not supplied or not expected or not secrets.compare_digest(supplied, expected):
        abort(400, "Invalid CSRF token")


def money(value):
    if value is None or value == "":
        return "—"
    try:
        return f"${Decimal(str(value)):,.2f}"
    except Exception:
        return "—"


def status_class(status):
    return {
        "ACTIVE": "good",
        "TRIAL": "warn",
        "EXPIRED": "bad",
    }.get((status or "").upper(), "muted")


@app.context_processor
def inject_context():
    return {
        "money": money,
        "status_class": status_class,
        "settings": SETTINGS,
    }


@app.get("/health")
def health():
    return {
        "ok": True,
        "mock_mode": SETTINGS.mock_mode,
        "write_actions": SETTINGS.enable_write_actions,
        "api_base_url": SETTINGS.api_base_url,
        "api_key_configured": bool(SETTINGS.api_key),
        "database_path": db_path(),
    }


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        good_user = secrets.compare_digest(
            request.form.get("username", ""), SETTINGS.admin_username
        )
        good_pass = secrets.compare_digest(
            request.form.get("password", ""), SETTINGS.admin_password
        )
        if good_user and good_pass:
            session.clear()
            session["authenticated"] = True
            session["csrf"] = secrets.token_urlsafe(24)
            return redirect(request.args.get("next") or url_for("dashboard"))
        flash("Incorrect username or password.", "danger")
    return render_template("login.html")


@app.post("/logout")
@login_required
def logout():
    require_csrf()
    session.clear()
    return redirect(url_for("login"))


@app.get("/")
@login_required
def dashboard():
    q = request.args.get("q", "").strip()
    status = request.args.get("status", "").strip()
    plan = request.args.get("plan", "").strip()
    partner = request.args.get("partner", "").strip()
    try:
        page = max(1, int(request.args.get("page", "1")))
    except ValueError:
        page = 1

    rows, count = query_projects(q, status, plan, partner, page, 50)
    total, statuses, plans, allmeta, last, template_count = metrics()

    revenue = 0.0
    cost = 0.0
    partner_counts = {}
    for row in allmeta:
        client_price = (
            row["client_price"]
            if row["client_price"] is not None
            else (row["monthly_price"] or 0)
        )
        platform_cost = (
            row["platform_cost"]
            if row["platform_cost"] is not None
            else (
                (row["bg_monthly_price"] or 0)
                if SETTINGS.use_bg_as_platform_cost
                else 0
            )
        )
        if row["status"] == "ACTIVE":
            revenue += client_price or 0
            cost += platform_cost or 0
        p = row["partner"] or infer_partner(row["name"])
        partner_counts[p] = partner_counts.get(p, 0) + 1

    return render_template(
        "dashboard.html",
        rows=rows,
        count=count,
        page=page,
        pages=max(1, math.ceil(count / 50)),
        q=q,
        status=status,
        plan=plan,
        partner=partner,
        total=total,
        statuses=statuses,
        plans=plans,
        last=last,
        template_count=template_count,
        revenue=revenue,
        cost=cost,
        margin=revenue - cost,
        alerts=alert_rows(8),
        partners=sorted(partner_counts.items(), key=lambda x: -x[1])[:15],
    )


@app.post("/sync")
@login_required
def sync():
    require_csrf()
    try:
        out = sync_catalog()
        if SETTINGS.mock_mode:
            flash(
                f"Demo sync complete: {out['projects']} projects, {out['plans']} plans, and {out['templates']} templates.",
                "success",
            )
        else:
            flash(
                f"Platform catalog synced: {out['plans']} plans and {out['templates']} templates. Existing project inventory is managed separately because Simvoly's documented project-list endpoint is customer-scoped.",
                "success",
            )
    except Exception as exc:
        flash(f"Sync failed: {exc}", "danger")
    return redirect(url_for("dashboard"))


@app.route("/inventory", methods=["GET"])
@login_required
def inventory():
    total, _, _, _, last, _ = metrics()
    return render_template("inventory.html", total=total, last=last)


@app.post("/inventory/import")
@login_required
def inventory_import():
    require_csrf()
    raw = request.form.get("payload", "").strip()
    upload = request.files.get("file")
    if upload and upload.filename:
        raw = upload.read().decode("utf-8", errors="replace")
    if not raw:
        flash("Paste JSON or choose a JSON file to import.", "danger")
        return redirect(url_for("inventory"))
    try:
        payload = json.loads(raw)
        count = import_inventory(payload)
        flash(f"Imported {count} unique project records into the local registry.", "success")
    except Exception as exc:
        flash(f"Inventory import failed: {exc}", "danger")
    return redirect(url_for("inventory"))


@app.post("/inventory/discover")
@login_required
def inventory_discover():
    require_csrf()
    identifier_type = request.form.get("identifier_type", "customerEmail")
    value = request.form.get("identifier_value", "").strip()
    try:
        out = discover_customer(identifier_type, value)
        flash(
            f"Customer discovery found {out['imported']} project(s); {out['refreshed']} were refreshed with official project/site details.",
            "success",
        )
    except Exception as exc:
        flash(f"Customer discovery failed: {exc}", "danger")
    return redirect(url_for("inventory"))


@app.post("/inventory/refresh-known")
@login_required
def inventory_refresh_known():
    require_csrf()
    try:
        limit = max(1, min(100, int(request.form.get("limit", "25"))))
    except ValueError:
        limit = 25
    try:
        out = refresh_known_projects(limit=limit)
        msg = f"Refreshed {out['ok']} project(s); {out['failed']} failed."
        if out["errors"]:
            msg += " First errors: " + " | ".join(out["errors"][:3])
        flash(msg, "success" if out["failed"] == 0 else "danger")
    except Exception as exc:
        flash(f"Project refresh failed: {exc}", "danger")
    return redirect(url_for("inventory"))


@app.get("/projects/<pid>")
@login_required
def project_detail(pid):
    p = get_project(pid)
    if not p:
        abort(404)
    return render_template(
        "project_detail.html",
        p=p,
        websites=get_websites(pid),
        plans=list_plans_for_ui(),
    )


@app.post("/projects/<pid>/refresh")
@login_required
def refresh_project(pid):
    require_csrf()
    try:
        out = sync_project(pid)
        flash(
            f"Project refreshed from the official Platform API ({out['websites']} website/funnel record(s)).",
            "success",
        )
    except Exception as exc:
        flash(f"Detail refresh failed: {exc}", "danger")
    return redirect(url_for("project_detail", pid=pid))


@app.post("/projects/<pid>/pricing")
@login_required
def pricing(pid):
    require_csrf()
    if not get_project(pid):
        abort(404)

    def number(name):
        value = request.form.get(name, "").strip()
        if not value:
            return None
        try:
            return float(Decimal(value))
        except InvalidOperation as exc:
            raise ValueError from exc

    try:
        save_meta(
            pid,
            number("client_price"),
            number("platform_cost"),
            request.form.get("partner", "").strip(),
            request.form.get("notes", "").strip(),
            request.form.get("internal_client_name", "").strip(),
        )
        flash("Pricing and account notes saved.", "success")
    except ValueError:
        flash("Pricing fields must be valid numbers.", "danger")
    return redirect(url_for("project_detail", pid=pid))


@app.route("/sites/add", methods=["GET", "POST"])
@login_required
def add_site():
    plans = list_plans_for_ui()
    templates = list_templates_for_ui()
    if request.method == "POST":
        require_csrf()
        values = {
            "site_name": request.form.get("site_name", "").strip(),
            "email": request.form.get("email", "").strip(),
            "first_name": request.form.get("first_name", "").strip(),
            "last_name": request.form.get("last_name", "").strip(),
            "external_customer_id": request.form.get("external_customer_id", "").strip(),
            "user_id": request.form.get("user_id", "").strip(),
            "template_id": request.form.get("template_id", "").strip(),
            "subdomain": request.form.get("subdomain", "").strip(),
            "brand_color": request.form.get("brand_color", "").strip(),
            "personalization_tags": request.form.get("personalization_tags", "").strip(),
        }
        activate_plan_id = request.form.get("plan_id", "").strip()
        period = request.form.get("period", "MONTHLY").strip()
        try:
            if values["personalization_tags"]:
                parsed = json.loads(values["personalization_tags"])
                if not isinstance(parsed, list):
                    raise ValueError("Personalization tags must be a JSON array.")
                values["personalization_tags"] = json.dumps(parsed)
            result = client.create_project_website(values)
            data = unwrap_data(result) if isinstance(result, dict) else {}
            project_id = data.get("projectId") if isinstance(data, dict) else None
            if project_id and activate_plan_id:
                client.set_project_status(project_id, "ACTIVE", activate_plan_id, period)
            if project_id:
                try:
                    sync_project(project_id)
                except Exception:
                    pass
            flash(
                f"Site created{f' as project {project_id}' if project_id else ''}."
                + (" Plan activation requested." if activate_plan_id else ""),
                "success",
            )
            if project_id:
                return redirect(url_for("project_detail", pid=project_id))
        except Exception as exc:
            flash(f"Create site failed: {exc}", "danger")
    return render_template("add_site.html", plans=plans, templates=templates)


@app.post("/projects/<pid>/action/<action>")
@login_required
def project_action(pid, action):
    require_csrf()
    p = get_project(pid)
    if not p:
        abort(404)
    try:
        if action == "suspend":
            client.set_project_status(pid, "EXPIRED")
            set_lifecycle(pid, "SUSPENDED")
        elif action == "cancel":
            if request.form.get("confirm") != "CANCEL":
                flash("Type CANCEL to confirm cancellation.", "danger")
                return redirect(url_for("project_detail", pid=pid))
            client.set_project_status(pid, "EXPIRED")
            set_lifecycle(pid, "CANCELLED")
        elif action == "reactivate":
            plan_id = request.form.get("plan_id") or p.get("plan_id")
            period = request.form.get("period") or p.get("billing_period") or "MONTHLY"
            client.set_project_status(pid, "ACTIVE", plan_id, period)
            set_lifecycle(pid, "")
        else:
            abort(404)
        try:
            sync_project(pid)
        except Exception:
            pass
        flash(f"{action.title()} request completed.", "success")
    except Exception as exc:
        flash(f"{action.title()} failed: {exc}", "danger")
    return redirect(url_for("project_detail", pid=pid))


@app.post("/websites/<website_id>/domain/connect")
@login_required
def connect_domain(website_id):
    require_csrf()
    w = get_website(website_id)
    if not w:
        abort(404)
    domain = request.form.get("domain", "").strip()
    try:
        client.connect_domain(website_id, domain)
        sync_project(w["project_id"])
        flash(f"Domain connection requested for {domain}.", "success")
    except Exception as exc:
        flash(f"Connect domain failed: {exc}", "danger")
    return redirect(url_for("project_detail", pid=w["project_id"]))


@app.post("/websites/<website_id>/domain/disconnect")
@login_required
def disconnect_domain(website_id):
    require_csrf()
    w = get_website(website_id)
    if not w:
        abort(404)
    domain = request.form.get("domain", "").strip() or w.get("domain", "")
    try:
        client.disconnect_domain(website_id, domain)
        sync_project(w["project_id"])
        flash(f"Domain disconnect requested for {domain}.", "success")
    except Exception as exc:
        flash(f"Disconnect domain failed: {exc}", "danger")
    return redirect(url_for("project_detail", pid=w["project_id"]))


@app.post("/websites/<website_id>/personalization")
@login_required
def personalization(website_id):
    require_csrf()
    w = get_website(website_id)
    if not w:
        abort(404)
    raw = request.form.get("tags", "[]").strip() or "[]"
    try:
        tags = json.loads(raw)
        if not isinstance(tags, list):
            raise ValueError("Tags must be a JSON array.")
        colors = {
            "brand_color": request.form.get("brand_color", "").strip(),
            "secondary_color_1": request.form.get("secondary_color_1", "").strip(),
            "secondary_color_2": request.form.get("secondary_color_2", "").strip(),
            "secondary_color_3": request.form.get("secondary_color_3", "").strip(),
            "secondary_color_4": request.form.get("secondary_color_4", "").strip(),
        }
        client.set_personalization_tags(website_id, tags, colors)
        flash("Personalization tags updated.", "success")
    except Exception as exc:
        flash(f"Personalization update failed: {exc}", "danger")
    return redirect(url_for("project_detail", pid=w["project_id"]))


@app.post("/websites/<website_id>/delete")
@login_required
def delete_website(website_id):
    require_csrf()
    w = get_website(website_id)
    if not w:
        abort(404)
    if request.form.get("confirm") != "DELETE":
        flash("Type DELETE to permanently delete the website/funnel.", "danger")
        return redirect(url_for("project_detail", pid=w["project_id"]))
    try:
        client.set_website_status(website_id, "DELETED")
        sync_project(w["project_id"])
        flash("Website/funnel delete request completed.", "success")
    except Exception as exc:
        flash(f"Delete failed: {exc}", "danger")
    return redirect(url_for("project_detail", pid=w["project_id"]))


@app.post("/projects/<pid>/sso")
@login_required
def project_sso(pid):
    require_csrf()
    if not get_project(pid):
        abort(404)
    user_email = request.form.get("user_email", "").strip()
    user_id = request.form.get("user_id", "").strip()
    external_customer_id = request.form.get("external_customer_id", "").strip()
    website_id = request.form.get("website_id", "").strip() or None
    path = request.form.get("path", "").strip() or None
    try:
        result = client.start_building_session(
            project_id=pid,
            website_id=website_id,
            user_email=user_email or None,
            user_id=user_id or None,
            external_customer_id=external_customer_id or None,
            path=path,
        )
        access_url = result.get("accessUrl")
        if not access_url:
            raise SimvolyError("SSO response did not contain accessUrl.")
        return redirect(access_url)
    except Exception as exc:
        flash(f"Builder SSO failed: {exc}", "danger")
        return redirect(url_for("project_detail", pid=pid))


@app.errorhandler(404)
def not_found(_):
    return render_template("error.html", code=404, message="Not found."), 404


@app.errorhandler(400)
def bad_request(error):
    return render_template("error.html", code=400, message=error.description), 400
