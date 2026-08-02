/* Generates the "company-stadium-report" proposal PDF as a Buffer (pdfkit). */
const PDFDocument = require("pdfkit");

const NAVY = "#0a1626", BLUE = "#1e9de3", GREEN = "#2fd07a", INK = "#12202f", GREY = "#6b7f95", HAIR = "#dbe4ee";
const SPREAD = 0.12; // ± range shown on estimates

function n(v) { const x = Number(v); return isFinite(x) ? Math.round(x) : null; }
function comma(x) { return x == null ? "—" : x.toLocaleString("en-US"); }
function range(v) { const x = n(v); if (x == null) return "—"; return `${comma(Math.round(x*(1-SPREAD)))} – ${comma(Math.round(x*(1+SPREAD)))}`; }
function truncate(s, k) { s = String(s || ""); return s.length > k ? s.slice(0, k - 1).trimEnd() + "…" : s; }
function names(arr) { if (!Array.isArray(arr) || !arr.length) return "—"; return truncate(arr.map(i => (typeof i === "string" ? i : i.name)).filter(Boolean).join(", "), 72); }
function rule(doc, y) { doc.strokeColor(HAIR).lineWidth(1).moveTo(50, y).lineTo(562, y).stroke(); }
function kv(doc, label, value, y) {
  doc.fillColor(GREY).font("Helvetica-Bold").fontSize(8.5).text(String(label).toUpperCase(), 50, y + 1, { width: 120, lineBreak: false });
  doc.fillColor(INK).font("Helvetica").fontSize(10.5).text(value == null || value === "" ? "—" : truncate(value, 74), 175, y, { width: 387, lineBreak: false });
  return y + 18;
}
function section(doc, title, y) { doc.fillColor(BLUE).font("Helvetica-Bold").fontSize(10).text(title.toUpperCase(), 50, y, { lineBreak: false }); return y + 17; }

function deviceChart(doc, d, y) {
  const items = [
    ["Phones", n(d.estDevicesPhones) || Math.round((n(d.estDevicesTotal) || 0) * 0.35)],
    ["Computers", n(d.estDevicesComputers) || Math.round((n(d.estDevicesTotal) || 0) * 0.22)],
    ["Tablets", n(d.estDevicesTablets) || Math.round((n(d.estDevicesTotal) || 0) * 0.12)],
    ["Conn. TV", n(d.estDevicesCTV) || Math.round((n(d.estDevicesTotal) || 0) * 0.31)]
  ];
  const max = Math.max(1, ...items.map(i => i[1]));
  const x0 = 175, w = 300;
  items.forEach(([lab, val], i) => {
    const yy = y + i * 20;
    doc.fillColor(GREY).font("Helvetica").fontSize(8.5).text(lab, 50, yy + 2, { width: 120, lineBreak: false });
    doc.roundedRect(x0, yy, w, 11, 3).fill("#eef3f8");
    const bw = Math.max(3, Math.round((val / max) * w));
    doc.roundedRect(x0, yy, bw, 11, 3).fill(i % 2 ? GREEN : BLUE);
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(8).text(comma(val), x0 + w + 6, yy + 2, { width: 60, lineBreak: false });
  });
  return y + items.length * 20 + 4;
}

function generateProposalPdf(d = {}, rep = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margins: { top: 50, bottom: 14, left: 50, right: 50 } });
    const chunks = [];
    doc.on("data", c => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.rect(0, 0, 612, 92).fill(NAVY);
    doc.rect(0, 92, 612, 4).fill(GREEN);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(21).text("Smart 1 Marketing", 50, 26, { lineBreak: false });
    doc.fillColor(BLUE).font("Helvetica-Bold").fontSize(11).text("STADIUM TO SCREEN  ·  PROPOSAL REPORT", 50, 54, { lineBreak: false });
    doc.fillColor("#9fb2c6").font("Helvetica").fontSize(9)
      .text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), 360, 34, { width: 202, align: "right", lineBreak: false });

    let y = 116;
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(17).text(truncate(`The ${d.team || "Football"} Play`, 46), 50, y, { lineBreak: false }); y += 24;
    doc.fillColor(GREY).font("Helvetica").fontSize(10).text(truncate([d.scopeLabel, d.venue, d.city].filter(Boolean).join("   ·   "), 78), 50, y, { lineBreak: false }); y += 22;
    rule(doc, y); y += 14;

    y = section(doc, "Prepared for", y);
    y = kv(doc, "Name", [d.name, d.company].filter(Boolean).join("  ·  "), y);
    y = kv(doc, "Contact", [d.email, d.phone].filter(Boolean).join("  ·  "), y);
    y += 6; rule(doc, y); y += 14;

    y = section(doc, "Campaign request", y);
    y = kv(doc, "League", d.league, y);
    y = kv(doc, "Targeting scope", d.scopeLabel ? `${d.scopeLabel} (${d.scope || ""})` : d.scope, y);
    y = kv(doc, "Channel focus", d.focus, y);
    y = kv(doc, "Budget", d.budget, y);
    y = kv(doc, "Timeline", d.timeline, y);
    y += 6; rule(doc, y); y += 14;

    y = section(doc, "Recommended package", y);
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(13).text(truncate(d.recommendedPackage || "—", 44), 50, y, { lineBreak: false });
    doc.fillColor(GREEN).font("Helvetica-Bold").fontSize(13).text(d.packagePrice || "", 360, y, { width: 202, align: "right", lineBreak: false });
    y += 24; rule(doc, y); y += 14;

    y = section(doc, "Modeled audience  (estimated ranges)", y);
    y = kv(doc, "Reachable fan base", range(d.estFanBase), y);
    y = kv(doc, "Households in scope", range(d.estHouseholds), y);
    y = kv(doc, "Matchable audience", range(d.estMatchable), y);
    y += 4;
    doc.fillColor(GREY).font("Helvetica-Bold").fontSize(8.5).text("DEVICE MIX", 50, y + 1, { width: 120, lineBreak: false });
    y = deviceChart(doc, d, y);
    y += 6; rule(doc, y); y += 14;

    if (d.recommendations) {
      const r = d.recommendations;
      y = section(doc, "Matched media plan", y);
      y = kv(doc, "Streaming", names(r.streamingServices), y);
      if (Array.isArray(r.podcasts) && r.podcasts.length) y = kv(doc, "Podcasts", names(r.podcasts), y);
      y = kv(doc, "Sports networks", names(r.sportsNetworks), y);
      y = kv(doc, "Related audiences", names(r.relatedAudiences), y);
    }

    // rep / contact block
    if (rep && (rep.name || rep.email || rep.phone || rep.calendar)) {
      const by = 672;
      doc.roundedRect(50, by, 512, 34, 6).fill("#0f2036");
      doc.fillColor("#9fb2c6").font("Helvetica-Bold").fontSize(8).text("YOUR STRATEGIST", 62, by + 7, { lineBreak: false });
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(10).text(rep.name || "Smart 1 Marketing", 62, by + 17, { lineBreak: false });
      const contact = [rep.email, rep.phone, rep.calendar].filter(Boolean).join("   ·   ");
      doc.fillColor("#5ee39a").font("Helvetica").fontSize(9).text(truncate(contact, 78), 200, by + 18, { width: 350, align: "right", lineBreak: false });
    }

    const fy = 720;
    rule(doc, fy);
    doc.fillColor(GREY).font("Helvetica").fontSize(7.5).text(
      "Audience figures are modeled planning estimates from baseline DMA/Census data and industry-average device and match-rate assumptions — shown as ranges, not guaranteed delivery. Lists are suggestions to validate against live DSP availability. Final inventory, reach, and pricing confirmed on your strategy call.",
      50, fy + 7, { width: 512, align: "left" });
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(8).text("Smart 1 Marketing  ·  Strong partnerships create smarter marketing.", 50, fy + 46, { lineBreak: false });

    doc.end();
  });
}
module.exports = { generateProposalPdf };
