# =====================================================================
# ADD THIS ROUTE TO app.py
# Paste it anywhere among the other @app.post routes — a good spot is
# right ABOVE  @app.errorhandler(Exception)  (around line 650).
# It reuses the existing _openai_response() helper (web search enabled),
# so no new imports are needed. `re` and `json` are already imported.
# =====================================================================

@app.post('/api/estimate-audience')
def estimate_audience():
    """AI-estimate the reachable audience for a geography + demographic filters.
    Used by the Proposal Builder so the salesperson never has to know population.
    Returns strict JSON: population, addressable_audience, households, devices, rationale.
    """
    data = request.get_json(force=True) or {}
    geo_type = str(data.get('geoType') or '').strip()
    area = str(data.get('area') or '').strip()
    radius = str(data.get('radius') or '').strip()
    industry = str(data.get('industry') or '').strip()
    gender = str(data.get('gender') or 'Both').strip()
    ages = data.get('ages') or []
    income = data.get('income') or []

    prompt = (
        "You are a media-planning analyst. Estimate the reachable digital advertising audience for the "
        "geography and filters below. Use current, authoritative U.S. population and Census-style figures "
        "(look them up with web search when helpful). "
        "Return STRICT JSON ONLY — no prose, no citations, no code fences — with exactly these keys:\n"
        '{"population": <integer total people in the geography>, '
        '"addressable_audience": <integer people who match the age/income/gender filters AND are reachable online>, '
        '"households": <integer households in the addressable audience>, '
        '"devices": <integer connected devices for that audience>, '
        '"rationale": "<one or two plain sentences on how you estimated it>"}\n\n'
        f"Geography type: {geo_type or 'not specified'}\n"
        f"Area / location: {area or 'not specified'}\n"
        f"Radius in miles (only for a City/ZIP + Radius target): {radius or 'n/a'}\n"
        f"Industry: {industry or 'general'}\n"
        f"Gender: {gender}\n"
        f"Age ranges: {', '.join(map(str, ages)) or 'all adults'}\n"
        f"Household income filters: {', '.join(map(str, income)) or 'no filter'}\n\n"
        "Guidance: assume roughly 85% of the population is reachable online before applying age/income/gender "
        "filters; households is about addressable_audience / 1.9; devices is about addressable_audience * 2.3. "
        "Return only the JSON object."
    )
    try:
        text = _openai_response(prompt, max_output_tokens=1500)
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r'^```(?:json)?\s*|\s*```$', '', cleaned, flags=re.I | re.S)
        result = json.loads(cleaned)
        return jsonify({'ok': True, 'estimate': result})
    except json.JSONDecodeError:
        return jsonify({
            'ok': False,
            'error': 'The AI returned a non-JSON estimate.',
            'raw': (text if 'text' in locals() else '')[:400]
        }), 502
    except Exception as exc:
        detail = ''
        if getattr(exc, 'response', None) is not None:
            detail = (exc.response.text or '')[:400]
        return jsonify({'ok': False, 'error': 'Audience estimate failed', 'detail': detail or str(exc)}), 502
