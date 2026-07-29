import os
import io
import re
import requests
import cloudinary
import cloudinary.uploader
from flask import Flask, request, jsonify
from openai import OpenAI
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

app = Flask(__name__)

# Read Environment Variables
GHL_WEBHOOK_URL = os.environ.get("GHL_WEBHOOK_URL")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")

# Configure Cloudinary SDK
cloudinary.config(cloudinary_url=os.environ.get("CLOUDINARY_URL"))

def sanitize_filename_part(text):
    """Sanitizes text strings for clean Cloudinary public IDs."""
    if not text:
        return ""
    clean_str = re.sub(r'[^\w\s-]', '', str(text)).strip()
    return re.sub(r'[-\s]+', '_', clean_str)

def generate_ai_analysis(data):
    """Calls OpenAI API to build a Stadium-to-Screen campaign strategy audit."""
    if not OPENAI_API_KEY:
        return (
            "Stadium-to-Screen Strategy Overview:\n\n"
            "1. Pre-Game Hype (Thu/Fri): Target fans listening to pre-game podcasts and sports talk audio with companion banners.\n"
            "2. Game Day Saturation (Sat/Sun): Capture stadium & tailgate mobile Device IDs via geo-fencing while deploying CTV unskippable video.\n"
            "3. The Recap (Sun/Mon): Household IP retargeting across post-game recaps and commute streaming."
        )

    try:
        client = OpenAI(api_key=OPENAI_API_KEY)
        prompt = (
            f"Generate a 3-paragraph Stadium-to-Screen sports marketing audit for a business named '{data.get('company', 'Sports Brand')}'. "
            f"Contact Name: {data.get('name', 'Valued Partner')}. "
            f"Detail recommendations for: "
            f"1) Venue Replay stadium geo-fencing and device ID capture on game days. "
            f"2) 3-block audio drip across Spotify/Pandora/iHeart with 300x250 companion banners. "
            f"3) Unskippable CTV video ads targeted to matched sports fan household IPs."
        )
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=350
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        return f"Stadium-to-Screen Strategy Plan: Multi-screen stadium capture & audio/CTV targeting. (AI Note: {str(e)})"

def build_pdf_buffer(data):
    """Builds the PDF report in memory using ReportLab."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=20, textColor=colors.HexColor("#1e3a8a"), spaceAfter=12)
    body_style = ParagraphStyle('Body', parent=styles['Normal'], fontSize=11, spaceAfter=8)

    ai_report_text = generate_ai_analysis(data)

    story = [
        Paragraph("Smart1 — Stadium-to-Screen Sports Media Blueprint", title_style),
        Spacer(1, 12),
        Paragraph(f"<b>Contact Name:</b> {data.get('name', 'N/A')}", body_style),
        Paragraph(f"<b>Email:</b> {data.get('email', 'N/A')}", body_style),
        Paragraph(f"<b>Phone:</b> {data.get('phone', 'N/A')}", body_style),
        Paragraph(f"<b>Business / Brand:</b> {data.get('company', 'N/A')}", body_style),
        Spacer(1, 14),
        Paragraph("<b>AI-Generated Multi-Screen Campaign Blueprint:</b>", styles['Heading2']),
        Paragraph(ai_report_text.replace('\n', '<br/>'), body_style)
    ]
    doc.build(story)
    buffer.seek(0)
    return buffer

def upload_to_cloudinary(pdf_buffer, file_name):
    """Uploads the PDF buffer directly to Cloudinary under the 'stadiumtoscreen' folder."""
    try:
        response = cloudinary.uploader.upload(
            pdf_buffer,
            resource_type="raw",
            public_id=f"reports/stadiumtoscreen/{file_name}.pdf",
            overwrite=True
        )
        return response.get("secure_url")
    except Exception as e:
        print(f"Cloudinary upload error: {e}")
        return None

@app.route('/api/submit-lead', methods=['POST'])
def submit_lead():
    try:
        data = request.json or request.form.to_dict()
        if not data:
            return jsonify({"status": "error", "message": "No data provided"}), 400

        client_email = data.get("email", "client").strip()
        client_name = sanitize_filename_part(data.get("name", "lead"))
        company_name = sanitize_filename_part(data.get("company", data.get("company_name", "")))

        # Format filename with Business Name + Client Name + Email
        if company_name:
            file_identifier = f"stadiumtoscreen_{company_name}_{client_name}_{client_email}"
        else:
            file_identifier = f"stadiumtoscreen_{client_name}_{client_email}"

        # 1. Build ReportLab PDF Buffer
        pdf_buffer = build_pdf_buffer(data)

        # 2. Upload to Cloudinary
        cloudinary_url = upload_to_cloudinary(pdf_buffer, file_identifier)

        # Fallback to local server route if Cloudinary is unconfigured
        base_url = request.host_url.rstrip('/')
        pdf_url = cloudinary_url or f"{base_url}/api/download-report?email={client_email}"

        # 3. Build GoHighLevel Payload
        ghl_payload = {
            "opportunity_name": f"{data.get('company', data.get('name', 'Client'))} - Stadium to Screen Lead",
            "client_name": data.get("name", ""),
            "client_email": client_email,
            "client_phone": data.get("phone", ""),
            "company_name": data.get("company", ""),
            "client_pdf_url": pdf_url,
            "source": "Stadium to Screen Landing Page",
            "campaign_data": data
        }

        # 4. Trigger GoHighLevel Inbound Webhook
        ghl_res_code = None
        if GHL_WEBHOOK_URL:
            res = requests.post(GHL_WEBHOOK_URL, json=ghl_payload, timeout=10)
            ghl_res_code = res.status_code

        return jsonify({
            "status": "success",
            "client_pdf_url": pdf_url,
            "cloudinary_upload": bool(cloudinary_url),
            "ghl_status_code": ghl_res_code
        }), 200

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/download-report', methods=['GET'])
def download_report():
    """Backup endpoint to download generated PDF directly."""
    email = request.args.get("email", "client")
    buffer = build_pdf_buffer({"email": email})
    return send_file(buffer, mimetype='application/pdf', as_attachment=True, download_name=f"StadiumToScreen_Report_{email}.pdf")

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 5000)))
