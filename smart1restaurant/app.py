import io
import json
import os
import re
import time
from typing import Any

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

from openai import OpenAI

# reportlab is pure-Python (no system libraries) so the PDF builder deploys
# cleanly on Render's native Python runtime with no Docker/apt changes.
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

load_dotenv()

app = Flask(__name__)

MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
WEBHOOK_URL = os.getenv("SMART1_WEBHOOK_URL", "").strip()
# Absolute base used to build the public report_pdf_url (e.g. https://smart1restaurant.onrender.com).
# If empty, the app derives it from the incoming request.
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "").strip().rstrip("/")
ENABLE_PDF = os.getenv("ENABLE_PDF", "1").strip() not in ("0", "false", "False", "")
REPORT_DIR = os.path.join(app.static_folder, "reports")

SYSTEM_PROMPT = """
You are the Smart 1 Marketing Restaurant Market Intelligence Architect.
Create a practical, sales-oriented market and geofencing report for a restaurant, bar, cafe, or foodservice business.

IMPORTANT ACCURACY RULES
- You do not have live access to maps, POS/foot-traffic databases, or exact census tables unless supplied in the request.
- Use geographic knowledge and conservative planning assumptions. Never claim a location or statistic was live-verified.
- Clearly label all population, household, frequent-diner, and traffic figures as AI planning estimates.
- Give ranges, confidence levels, and a short explanation of the assumptions.
- Do not invent precise street addresses. Use recognizable place names plus city/state. An address field may be null.
- Prefer real, well-known nearby businesses, venues, and landmarks you are reasonably confident exist. If uncertain, lower confidence.
- Avoid duplicate locations and avoid recommending polygons that cannot be practically geofenced. Favor specific points of interest.

TARGET TYPES TO CONSIDER
1. Office parks, business districts, and large employers (lunch and happy-hour daypart traffic)
2. Apartment, condo, and dense residential communities (dinner and delivery daypart traffic)
3. Hotels and short-term lodging clusters (tourist and business-traveler traffic)
4. Colleges, universities, and large high schools (value-driven, late-night, and delivery traffic)
5. Gyms, fitness studios, and grocery/health-food retail (health-conscious or post-workout traffic)
6. Shopping centers, movie theaters, and entertainment districts (pre/post-activity dining)
7. Stadiums, arenas, concert venues, and convention centers (event-driven surge traffic)
8. Competing restaurants and comparable concepts for conquesting
9. Tourist attractions, downtown/main-street corridors, and commuter corridors

FREQUENT-DINER ESTIMATION METHOD
Estimate the adult population and households in the requested market, then estimate the number of likely "frequent diner" households (households that eat out or order delivery multiple times per month) using a market-sensitive dine-out rate. Use lower rates for lower-density, lower-income areas and higher rates for dense urban, high-income, high-employment-density, or heavy-tourism areas. Adjust for daytime employment population, nearby residential density, income, competitive saturation, and the restaurant's category (QSR/fast-casual skews toward frequency; fine dining skews toward occasion-based visits).
Return low/base/high frequent-diner household estimates. Do not present the estimate as verified POS or loyalty data.

GEOFENCE GUIDANCE
- Recommend a practical radius or polygon approach for each location.
- Typical point-of-interest radii: 0.10-0.20 mile for compact venues (offices, competitors, cafes), 0.20-0.40 mile for larger venues (shopping centers, hotels, campuses), and polygons for stadiums/arenas/large campuses.
- Separate "location lookback" sites from "real-time/proximity" sites.
- Rank locations Priority 1, 2, or 3.

MEDIA AND TRIGGER RULES
- The campaign is trigger-driven around dayparts, weather, and local events rather than static always-on spend.
- ALLOWED channels ONLY: geofencing, location look-back retargeting, programmatic / data-driven targeted display, CTV/OTT, streaming audio, YouTube/online video, and website retargeting.
- NEVER recommend social media or social advertising (Facebook, Instagram, TikTok, LinkedIn, Snapchat, Pinterest, X, or any other social channel).
- NEVER recommend paid search, email, or SMS. Do not mention them anywhere in the report.
- Build practical triggers around dayparts, weather, and local demand signals, such as lunch rush windows, evening/dinner windows, extreme heat, rain/cold (comfort food and delivery), first snow, home sports team game days, local event nights, and holiday weekends.
- Keep trigger labels short and punchy (e.g. "Lunch rush 11-1", "90°+ heat", "Rainy day", "Home game night", "Holiday weekend").
- Do not imply that a trigger guarantees demand. Treat it as a budget-pacing and timing signal.

OUTPUT
Return only valid JSON matching the requested schema. Do not use markdown fences.
"""

REPORT_SCHEMA = {
    "name": "restaurant_report",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "market_summary": {"type": "string"},
            "market_type": {"type": "string"},
            "market_type_description": {"type": "string"},
            "market_opportunity": {"type": "string"},
            "market_profile": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "estimated_population_low": {"type": "integer"},
                    "estimated_population_base": {"type": "integer"},
                    "estimated_population_high": {"type": "integer"},
                    "estimated_households_low": {"type": "integer"},
                    "estimated_households_base": {"type": "integer"},
                    "estimated_households_high": {"type": "integer"},
                    "estimated_frequent_diner_households_low": {"type": "integer"},
                    "estimated_frequent_diner_households_base": {"type": "integer"},
                    "estimated_frequent_diner_households_high": {"type": "integer"},
                    "estimated_dine_out_rate_low": {"type": "number"},
                    "estimated_dine_out_rate_base": {"type": "number"},
                    "estimated_dine_out_rate_high": {"type": "number"},
                    "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
                    "assumptions": {"type": "array", "items": {"type": "string"}},
                },
                "required": [
                    "estimated_population_low",
                    "estimated_population_base",
                    "estimated_population_high",
                    "estimated_households_low",
                    "estimated_households_base",
                    "estimated_households_high",
                    "estimated_frequent_diner_households_low",
                    "estimated_frequent_diner_households_base",
                    "estimated_frequent_diner_households_high",
                    "estimated_dine_out_rate_low",
                    "estimated_dine_out_rate_base",
                    "estimated_dine_out_rate_high",
                    "confidence",
                    "assumptions",
                ],
            },
            "recommended_package": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "package_name": {"type": "string"},
                    "monthly_investment": {"type": "string"},
                    "description": {"type": "string"},
                },
                "required": ["package_name", "monthly_investment", "description"],
            },
            "media_channels": {"type": "array", "items": {"type": "string"}},
            "streaming_audio_note": {"type": "string"},
            "demand_triggers": {"type": "array", "items": {"type": "string"}},
            "monthly_plan": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "month": {"type": "string"},
                        "focus": {"type": "string"},
                        "message": {"type": "string"},
                        "triggers": {"type": "array", "items": {"type": "string"}},
                        "pacing": {"type": "string"},
                    },
                    "required": ["month", "focus", "message", "triggers", "pacing"],
                },
            },
            "geofence_locations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "name": {"type": "string"},
                        "city_state": {"type": "string"},
                        "address": {"type": ["string", "null"]},
                        "category": {"type": "string"},
                        "district_or_market": {"type": "string"},
                        "priority": {"type": "integer", "enum": [1, 2, 3]},
                        "recommended_method": {
                            "type": "string",
                            "enum": ["location_lookback", "real_time_proximity", "both"],
                        },
                        "recommended_radius_miles": {"type": "number"},
                        "audience_reason": {"type": "string"},
                        "best_message": {"type": "string"},
                        "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
                    },
                    "required": [
                        "name",
                        "city_state",
                        "address",
                        "category",
                        "district_or_market",
                        "priority",
                        "recommended_method",
                        "recommended_radius_miles",
                        "audience_reason",
                        "best_message",
                        "confidence",
                    ],
                },
            },
            "disclaimer": {"type": "string"},
        },
        "required": [
            "market_summary",
            "market_type",
            "market_type_description",
            "market_opportunity",
            "market_profile",
            "recommended_package",
            "media_channels",
            "streaming_audio_note",
            "demand_triggers",
            "monthly_plan",
            "geofence_locations",
            "disclaimer",
        ],
    },
    "strict": True,
}


def clean_payload(data: dict) -> dict:
    fields = [
        "restaurant_name",
        "website",
        "restaurant_zip",
        "target_radius",
        "cuisine_types",
        "service_style",
        "campaign_objective",
        "contact_name",
        "contact_email",
        "contact_phone",
        "notes",
    ]
    cleaned = {k: str(data.get(k, "")).strip()[:1500] for k in fields}
    if not re.fullmatch(r"\d{5}(-\d{4})?", cleaned["restaurant_zip"]):
        raise ValueError("A valid U.S. ZIP code is required.")
    return cleaned


def generate_report(payload: dict) -> Any:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured.")
    client = OpenAI(api_key=api_key)
    user_prompt = (
        "\nBuild a trigger-driven Restaurant Demand & Geofencing Report from these inputs:\n"
        f"{json.dumps(payload, indent=2)}"
        "\n\nThe restaurant did NOT provide daypart patterns, a media budget, trigger preferences, or "
        "lists of nearby generators and competitors. You must supply all of these yourself:\n"
        "- Assume realistic lunch, happy-hour, dinner, and (if relevant) late-night daypart patterns from the "
        "restaurant's category and ZIP code.\n"
        "- Identify the local office parks, residential density, hotels, colleges, gyms, shopping/entertainment "
        "venues, stadiums/arenas, and competing restaurants yourself from geographic knowledge of the market, "
        "and include the best of them in geofence_locations.\n\n"
        "Populate every field of the schema:\n"
        "- market_summary: one or two sentences framing the trigger-driven dining demand opportunity "
        "for this restaurant and market (reference the restaurant name and area).\n"
        "- market_type: a short badge label for the market, e.g. 'Dense Urban Business District' "
        "or 'Suburban Residential / Family Market'. market_type_description: one sentence on the daypart pattern.\n"
        "- market_profile: low/base/high estimates for population, households, and likely frequent-diner "
        "households, plus a dine-out rate (as a percentage decimal such as 22.5, not 0.225), confidence, "
        "and assumptions.\n"
        "- market_opportunity: keep this SIMPLE — one short, plain sentence on the restaurant's opportunity "
        "in this market.\n"
        "- recommended_package: choose the best-fit package for this market from the Smart 1 package menu below. "
        "Use its exact NAME and monthly price as monthly_investment (e.g. '$3,000/month'), and write a short "
        "description of what that level buys. Pick the tier based on market size, competitive density, and "
        "the number of daypart/occasion opportunities (lunch, happy hour, dinner, delivery, events, catering).\n"
        "  SMART 1 PACKAGE MENU (use these, do not invent prices):\n"
        "    * $1,500/month — Corner Table\n"
        "    * $3,000/month — Local Favorite\n"
        "    * $5,500/month — Regional Draw\n"
        "    * $8,500/month — Market Leader\n"
        "- media_channels: ALLOWED channels/data only. ALWAYS include 'In-Market Diner & Foot-Traffic Audience "
        "Data' as one of the chips (we layer third-party in-market dining and delivery-app-user data across the "
        "plan). Then choose from: geofencing offices/residential/venues, location look-back retargeting, "
        "data-driven / programmatic targeted display, connected TV (CTV/OTT), streaming audio, YouTube/online "
        "video, website retargeting. Return 4-7 chips total. NEVER include paid search, email, SMS, or any "
        "social channel.\n"
        "- streaming_audio_note: a short recommendation to geotarget streaming audio (streaming radio) around "
        "nearby offices and residential density during commute and pre-meal windows, since diners stream audio "
        "while deciding where to eat. Specify a daypart running around lunch and evening commute windows.\n"
        "- demand_triggers: 5-8 short trigger labels for this market (e.g. 'Lunch rush 11-1', '90°+ patio "
        "weather', 'Rainy day', 'Home game night', 'Holiday weekend').\n"
        "- monthly_plan: all 12 months (January through December). Each month has a focus title, a short "
        "customer-facing message, 1-2 relevant demand trigger labels drawn from demand_triggers, and a "
        "'pacing' string. Match focus to the season and local calendar (patio/summer promotion, back-to-school, "
        "holiday parties/catering, football season, Valentine's/Mother's Day occasions, etc. as relevant).\n"
        "  BUDGET PACING RULE for the 'pacing' field: the recommended_package monthly_investment is the PEAK "
        "in-season monthly budget (100%). In shoulder months spend 60% of the package; in the slowest months "
        "spend 35% of the package. Classify each month as Peak, Shoulder, or Slow based on this market and "
        "concept, and set pacing to a short string with the tier, percent, and computed dollar amount — e.g. "
        "'Peak — 100% ($3,000)', 'Shoulder — 60% ($1,800)', 'Slow — 35% ($1,050)'. Compute the dollars from "
        "the chosen package price.\n"
        "- geofence_locations: 12-18 locations (offices, residential density, hotels, colleges, gyms, shopping/"
        "entertainment venues, stadiums/arenas, competitors, event venues). Prioritize locations inside the "
        "target radius; lower confidence for uncertain ones. Keep text concise.\n"
        "- disclaimer: a short note that figures are AI planning estimates for the market, not exact counts.\n"
    )
    response = client.responses.create(
        model=MODEL,
        input=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        text={"format": {"type": "json_schema", **REPORT_SCHEMA}},
        temperature=0.25,
        max_output_tokens=8000,
    )
    text = (response.output_text or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()
    return json.loads(text)


# ---------------------------------------------------------------------------
# PDF report — reportlab, pure Python. Produces a hosted PDF your team can send
# from Smart1Suite. Guarded so any failure never blocks the lead/webhook.
# ---------------------------------------------------------------------------

NAVY = colors.HexColor("#0a2240")
BLUE = colors.HexColor("#009ed2")
GREEN = colors.HexColor("#2dbb72")
LINE = colors.HexColor("#dbe5ed")
MUTED = colors.HexColor("#68798c")
AQUA = colors.HexColor("#eff9fc")


def _money_to_int(value: str):
    """'$3,000/month' -> 3000 (int) or None."""
    digits = re.sub(r"[^\d]", "", (value or "").split("/")[0])
    return int(digits) if digits else None


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "report").lower()).strip("-") or "report"


def _pdf_styles():
    ss = getSampleStyleSheet()
    body = ParagraphStyle("s1body", parent=ss["Normal"], fontName="Helvetica",
                          fontSize=9.5, leading=14, textColor=colors.HexColor("#25364b"))
    h2 = ParagraphStyle("s1h2", parent=ss["Heading2"], fontName="Helvetica-Bold",
                        fontSize=13, leading=16, textColor=NAVY, spaceBefore=16, spaceAfter=6)
    title = ParagraphStyle("s1title", parent=ss["Title"], fontName="Helvetica-Bold",
                           fontSize=22, leading=25, textColor=NAVY, alignment=TA_LEFT, spaceAfter=4)
    eyebrow = ParagraphStyle("s1eye", parent=body, fontName="Helvetica-Bold",
                             fontSize=8, textColor=BLUE, spaceAfter=2)
    small = ParagraphStyle("s1small", parent=body, fontSize=8, textColor=MUTED, leading=11)
    cell = ParagraphStyle("s1cell", parent=body, fontSize=8, leading=10.5)
    cellw = ParagraphStyle("s1cellw", parent=cell, textColor=colors.white)
    return dict(body=body, h2=h2, title=title, eyebrow=eyebrow, small=small, cell=cell, cellw=cellw)


def build_report_pdf(report: dict, restaurant: str, base_url: str) -> str:
    """Render the report JSON to a branded PDF, save under static/reports,
    and return its absolute public URL (or '' on failure)."""
    if not ENABLE_PDF:
        return ""
    try:
        os.makedirs(REPORT_DIR, exist_ok=True)
        st = _pdf_styles()
        fmt = lambda n: f"{int(n):,}" if n is not None else "—"
        rng = lambda a, b: f"{fmt(a)}–{fmt(b)}"
        m = report.get("market_profile", {}) or {}
        rp = report.get("recommended_package", {}) or {}

        filename = f"{_slug(restaurant)}-{int(time.time())}.pdf"
        path = os.path.join(REPORT_DIR, filename)

        story = []
        story.append(Paragraph("SMART 1 MARKETING &nbsp;|&nbsp; RESTAURANT MARKET REPORT", st["eyebrow"]))
        story.append(Paragraph(restaurant or "Market Report", st["title"]))
        story.append(Paragraph(report.get("market_summary", ""), st["body"]))
        story.append(Spacer(1, 6))

        if report.get("market_type"):
            story.append(Paragraph(f"<b>{report.get('market_type')}</b> — {report.get('market_type_description','')}", st["small"]))

        stat_data = [[
            Paragraph(f"<b>{rng(m.get('estimated_population_low'), m.get('estimated_population_high'))}</b><br/><font size=7 color='#68798c'>ESTIMATED POPULATION</font>", st["cell"]),
            Paragraph(f"<b>{rng(m.get('estimated_households_low'), m.get('estimated_households_high'))}</b><br/><font size=7 color='#68798c'>ESTIMATED HOUSEHOLDS</font>", st["cell"]),
            Paragraph(f"<b>{rng(m.get('estimated_frequent_diner_households_low'), m.get('estimated_frequent_diner_households_high'))}</b><br/><font size=7 color='#68798c'>LIKELY FREQUENT-DINER HOUSEHOLDS</font>", st["cell"]),
        ]]
        stat = Table(stat_data, colWidths=[2.4 * inch] * 3)
        stat.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), AQUA),
            ("BOX", (0, 0), (-1, -1), 0.5, LINE),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ]))
        story.append(Spacer(1, 8))
        story.append(stat)

        story.append(Paragraph("Your Market Opportunity", st["h2"]))
        story.append(Paragraph(report.get("market_opportunity", ""), st["body"]))

        story.append(Paragraph("Recommended Package", st["h2"]))
        story.append(Paragraph(f"<b>{rp.get('monthly_investment','')} — {rp.get('package_name','')}</b>", st["body"]))
        story.append(Paragraph(rp.get("description", ""), st["small"]))

        chans = report.get("media_channels", []) or []
        if chans:
            story.append(Paragraph("Recommended Media Channels", st["h2"]))
            story.append(Paragraph(" &nbsp;•&nbsp; ".join(chans), st["body"]))

        trigs = report.get("demand_triggers", []) or []
        if trigs:
            story.append(Paragraph("Demand Triggers", st["h2"]))
            story.append(Paragraph(" &nbsp;•&nbsp; ".join(trigs), st["body"]))

        plan = report.get("monthly_plan", []) or []
        if plan:
            story.append(Paragraph("Month-by-Month Campaign Plan", st["h2"]))
            rows = [[Paragraph("<b>Month</b>", st["cellw"]), Paragraph("<b>Focus</b>", st["cellw"]), Paragraph("<b>Budget Pacing</b>", st["cellw"])]]
            for x in plan:
                rows.append([
                    Paragraph(x.get("month", ""), st["cell"]),
                    Paragraph(x.get("focus", ""), st["cell"]),
                    Paragraph(x.get("pacing", ""), st["cell"]),
                ])
            t = Table(rows, colWidths=[1.1 * inch, 3.3 * inch, 2.8 * inch], repeatRows=1)
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fbfc")]),
                ("GRID", (0, 0), (-1, -1), 0.5, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]))
            story.append(t)

        geo = sorted(report.get("geofence_locations", []) or [], key=lambda g: g.get("priority", 3))
        if geo:
            story.append(Paragraph("Recommended Geofence Locations", st["h2"]))
            rows = [[Paragraph(f"<b>{h}</b>", st["cellw"]) for h in ("P", "Location", "Category", "Method", "Radius", "Conf.")]]
            for g in geo:
                rows.append([
                    Paragraph(f"P{g.get('priority','')}", st["cell"]),
                    Paragraph(f"<b>{g.get('name','')}</b><br/>{g.get('city_state','')}", st["cell"]),
                    Paragraph(g.get("category", ""), st["cell"]),
                    Paragraph(str(g.get("recommended_method", "")).replace("_", " "), st["cell"]),
                    Paragraph(f"{g.get('recommended_radius_miles','')} mi", st["cell"]),
                    Paragraph(g.get("confidence", ""), st["cell"]),
                ])
            t = Table(rows, colWidths=[0.4 * inch, 2.2 * inch, 1.5 * inch, 1.3 * inch, 0.7 * inch, 0.6 * inch], repeatRows=1)
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fbfc")]),
                ("GRID", (0, 0), (-1, -1), 0.5, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]))
            story.append(t)

        story.append(Spacer(1, 12))
        story.append(Paragraph(report.get("disclaimer", ""), st["small"]))

        doc = SimpleDocTemplate(path, pagesize=letter, title=f"{restaurant} Market Report",
                                leftMargin=0.6 * inch, rightMargin=0.6 * inch,
                                topMargin=0.6 * inch, bottomMargin=0.6 * inch)
        doc.build(story)

        base = base_url or PUBLIC_BASE_URL
        return f"{base.rstrip('/')}/static/reports/{filename}" if base else f"/static/reports/{filename}"
    except Exception:
        app.logger.exception("PDF generation failed")
        return ""


def send_webhook(payload: dict, report: Any, status: str, pdf_url: str = "") -> None:
    if not WEBHOOK_URL:
        return
    report = report or {}
    mp = report.get("market_profile", {}) or {}
    rp = report.get("recommended_package", {}) or {}
    monthly = _money_to_int(rp.get("monthly_investment", ""))
    body = {
        # --- Contact / lead fields (already sent) ---
        **payload,
        "source": "Smart 1 Restaurant Market Intelligence",
        "report_status": status,
        # --- Opportunity fields (new) ---
        "opportunity_name": f"{payload.get('restaurant_name', 'Lead')} — Restaurant Market Report",
        "recommended_package": rp.get("package_name", ""),
        "recommended_investment": rp.get("monthly_investment", ""),
        "opportunity_value_monthly": monthly,
        "opportunity_value_annual": monthly * 12 if monthly else None,
        # --- Report custom fields ---
        "market_type": report.get("market_type", ""),
        "market_summary": report.get("market_summary", ""),
        "est_households": mp.get("estimated_frequent_diner_households_base"),
        "estimated_frequent_diner_households_base": mp.get("estimated_frequent_diner_households_base"),
        "demand_triggers": ", ".join(report.get("demand_triggers", []) or []),
        "report_pdf_url": pdf_url,
        "report_json": json.dumps(report, separators=(",", ":"))[:60000],
    }
    try:
        requests.post(WEBHOOK_URL, json=body, timeout=12)
    except requests.RequestException:
        app.logger.exception("Webhook delivery failed")


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/api/analyze")
def analyze():
    try:
        payload = clean_payload(request.get_json(silent=True) or {})
        report = generate_report(payload)
        base_url = PUBLIC_BASE_URL or request.url_root
        pdf_url = build_report_pdf(report, payload.get("restaurant_name", "Market Report"), base_url)
        send_webhook(payload, report, "completed", pdf_url)
        return jsonify({"ok": True, "report": report, "report_pdf_url": pdf_url})
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    except Exception as exc:
        app.logger.exception("Analysis failed")
        try:
            send_webhook(clean_payload(request.get_json(silent=True) or {}), None, "failed")
        except Exception:
            pass
        return (
            jsonify(
                {
                    "ok": False,
                    "error": "The report could not be generated. Check the server configuration and try again.",
                    "detail": f"{type(exc).__name__}: {exc}",
                }
            ),
            500,
        )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=False)
