@app.route("/api/ga4/channels", methods=["POST"])
def api_ga4_channels():
    """Returns top active source/medium channels for a given GA4 property."""
    data = request.json or {}
    property_id = data.get("property_id", "").strip()
    google_login = data.get("google_login", "").strip().lower()

    if not property_id or not google_login:
        return jsonify({"channels": []})

    account = next((a for a in connected_accounts() if a["email"] == google_login), None)
    if not account:
        return jsonify({"channels": []})

    try:
        access_token = refresh_access_token(account["refresh_token"])
        url = f"https://analyticsdata.googleapis.com/v1beta/properties/{property_id}:runReport"
        req_body = {
            "dateRanges": [{"startDate": "30daysAgo", "endDate": "yesterday"}],
            "dimensions": [{"name": "sessionSourceMedium"}],
            "metrics": [{"name": "sessions"}],
            "limit": 25
        }
        report = google_post(access_token, url, req_body)
        channels = [row["dimensionValues"][0]["value"] for row in report.get("rows", [])]
        return jsonify({"channels": sorted(channels)})
    except Exception as exc:
        logger.warning("Failed fetching GA4 channels for property %s: %s", property_id, exc)
        return jsonify({"channels": []})
