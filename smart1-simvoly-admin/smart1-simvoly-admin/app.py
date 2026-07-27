import os
import secrets
from decimal import Decimal, InvalidOperation
from functools import wraps
from urllib.parse import urlparse

from dotenv import load_dotenv
from flask import Flask, abort, flash, redirect, render_template, request, session, url_for

load_dotenv()

from config import SETTINGS
from db import all_meta, get_meta, init_db, save_meta
from pricing import default_retail_price, money, normalize_plan, wholesale_cost
from simvoly_client import SimvolyAPIError, SimvolyClient, SimvolyConfigError

app = Flask(__name__)
app.config["SECRET_KEY"] = SETTINGS.secret_key
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = os.getenv("FLASK_ENV") == "production"

init_db()
client = SimvolyClient()


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("authenticated"):
            return redirect(url_for("login", next=request.path))
        return view(*args, **kwargs)
    return wrapped


def safe_next(value: str | None) -> str:
    if not value:
        return url_for("dashboard")
    parsed = urlparse(value)
    if parsed.netloc or parsed.scheme:
        return url_for("dashboard")
    return value


@app.context_processor
def inject_helpers():
    return {"money": money, "mock_mode": SETTINGS.mock_mode, "wl_tier": SETTINGS.wl_tier}


@app.get("/health")
def health():
    return {"ok": True, "mock_mode": SETTINGS.mock_mode}, 200


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username", "")
        password = request.form.get("password", "")
        if secrets.compare_digest(username, SETTINGS.admin_username) and secrets.compare_digest(password, SETTINGS.admin_password):
            session.clear()
            session["authenticated"] = True
            session["csrf"] = secrets.token_urlsafe(24)
            return redirect(safe_next(request.args.get("next")))
        flash("Incorrect username or password.", "danger")
    return render_template("login.html")


@app.post("/logout")
@login_required
def logout():
    validate_csrf()
    session.clear()
    return redirect(url_for("login"))


def validate_csrf():
    expected = session.get("csrf")
    supplied = request.form.get("csrf_token") or request.headers.get("X-CSRF-Token")
    if not expected or not supplied or not secrets.compare_digest(expected, supplied):
        abort(400, "Invalid CSRF token")


def project_view(project, meta):
    plan = normalize_plan(project.plan)
    cost = wholesale_cost(plan, SETTINGS.wl_tier)
    retail = meta.get("retail_price")
    if retail is None:
        retail = default_retail_price(plan)
    else:
        retail = Decimal(str(retail))
    margin = retail - cost if retail is not None and cost is not None else None
    margin_pct = (margin / retail * 100) if margin is not None and retail and retail != 0 else None
    return {
        "project": project,
        "plan": plan,
        "cost": cost,
        "retail": retail,
        "margin": margin,
        "margin_pct": margin_pct,
        "meta": meta,
    }


@app.get("/")
@login_required
def dashboard():
    try:
        projects = client.list_projects()
        error = None
    except (SimvolyAPIError, SimvolyConfigError) as exc:
        projects = []
        error = str(exc)
    metas = all_meta()
    rows = [project_view(p, metas.get(str(p.id), {})) for p in projects]
    q = request.args.get("q", "").strip().lower()
    status = request.args.get("status", "").strip().lower()
    if q:
        rows = [r for r in rows if q in " ".join([r["project"].name, r["project"].domain, r["project"].owner_email]).lower()]
    if status:
        rows = [r for r in rows if r["project"].status.lower() == status]

    monthly_cost = sum((r["cost"] or Decimal("0")) for r in rows)
    monthly_retail = sum((r["retail"] or Decimal("0")) for r in rows)
    active = sum(1 for r in rows if r["project"].status.lower() in {"active", "activated", "live"})
    suspended = sum(1 for r in rows if "suspend" in r["project"].status.lower() or "inactive" in r["project"].status.lower())
    return render_template(
        "dashboard.html",
        rows=rows,
        error=error,
        q=q,
        status=status,
        monthly_cost=monthly_cost,
        monthly_retail=monthly_retail,
        monthly_margin=monthly_retail - monthly_cost,
        active=active,
        suspended=suspended,
    )


@app.route("/sites/add", methods=["GET", "POST"])
@login_required
def add_site():
    if request.method == "POST":
        validate_csrf()
        required = ["site_name", "email", "first_name", "last_name", "plan", "subdomain"]
        values = {k: request.form.get(k, "").strip() for k in required}
        if any(not values[k] for k in required):
            flash("Complete all required fields.", "danger")
            return render_template("add_site.html", form=values)
        try:
            result = client.create_site(values)
            project_result = result.get("project", result) if isinstance(result, dict) else {}
            project_id = ""
            if isinstance(project_result, dict):
                project_id = str(project_result.get("id") or project_result.get("project_id") or "")
            if not project_id and SETTINGS.mock_mode:
                project_id = str(result.get("id", ""))
            retail_price = request.form.get("retail_price", "").strip()
            if project_id and retail_price:
                try:
                    save_meta(project_id, float(Decimal(retail_price)), "", values["site_name"])
                except InvalidOperation:
                    pass
            flash(f"Site request completed{' in demo mode' if SETTINGS.mock_mode else ''}.", "success")
            return redirect(url_for("dashboard"))
        except (SimvolyAPIError, SimvolyConfigError) as exc:
            flash(str(exc), "danger")
    return render_template("add_site.html", form={})


@app.get("/sites/<project_id>")
@login_required
def site_detail(project_id):
    try:
        projects = client.list_projects()
    except (SimvolyAPIError, SimvolyConfigError) as exc:
        flash(str(exc), "danger")
        return redirect(url_for("dashboard"))
    project = next((p for p in projects if str(p.id) == str(project_id)), None)
    if not project:
        abort(404)
    row = project_view(project, get_meta(project_id))
    return render_template("site_detail.html", row=row)


@app.post("/sites/<project_id>/pricing")
@login_required
def update_pricing(project_id):
    validate_csrf()
    raw_price = request.form.get("retail_price", "").strip()
    notes = request.form.get("notes", "").strip()
    internal_client_name = request.form.get("internal_client_name", "").strip()
    price = None
    if raw_price:
        try:
            price = float(Decimal(raw_price))
        except InvalidOperation:
            flash("Retail price must be a valid number.", "danger")
            return redirect(url_for("site_detail", project_id=project_id))
    save_meta(project_id, price, notes, internal_client_name)
    flash("Pricing and notes saved.", "success")
    return redirect(url_for("site_detail", project_id=project_id))


@app.post("/sites/<project_id>/<action>")
@login_required
def action_site(project_id, action):
    validate_csrf()
    if action not in {"suspend", "reactivate", "cancel"}:
        abort(404)
    confirm = request.form.get("confirm", "")
    if action == "cancel" and confirm != "CANCEL":
        flash("Cancellation was not sent. Type CANCEL to confirm permanent cancellation.", "danger")
        return redirect(url_for("site_detail", project_id=project_id))
    try:
        client.project_action(project_id, action)
        flash(f"{action.title()} request sent{' in demo mode' if SETTINGS.mock_mode else ''}.", "success")
    except (SimvolyAPIError, SimvolyConfigError) as exc:
        flash(str(exc), "danger")
    return redirect(url_for("site_detail", project_id=project_id))


@app.errorhandler(404)
def not_found(_):
    return render_template("error.html", code=404, message="That site or page was not found."), 404


@app.errorhandler(400)
def bad_request(exc):
    return render_template("error.html", code=400, message=str(exc.description)), 400
