/**
 * Smart 1 Marketing — Marketing Efficiency Audit™
 * Branded PDF report generator (PDFKit, no headless browser required).
 *
 * buildAuditPdf(payload) -> Promise<Buffer>
 */

const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

const C = {
  navy: '#1a2e58', navy2: '#22365f', sky: '#35c4f4', green: '#01cdb0', green2: '#01b8a0',
  gold: '#fbbc00', ink: '#1A2233', muted: '#5A6577', line: '#E4E8EF', bg: '#F6F8FB',
  red: '#e0574d', amber: '#f0a02a', white: '#ffffff', lightText: '#D6E0EE',
};

const PAGE = { w: 612, h: 792, m: 46 };
const CONTENT_W = PAGE.w - PAGE.m * 2;
const FOOT_Y = PAGE.h - 58;
const LOGO = path.join(__dirname, 'public', 'img', 'logo-white.png');

const money = (n, dp = 0) =>
  (n === null || n === undefined || !isFinite(n)) ? '—'
    : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

const pct = (n, dp = 1) => (n === null || n === undefined || !isFinite(n)) ? '—' : n.toFixed(dp) + '%';

function buildAuditPdf(payload = {}) {
  return new Promise((resolve, reject) => {
    try {
      const s = payload.snapshot || {};
      const m = payload.metrics || {};
      const b = payload.benchmark || {};
      const a = payload.analysis || {};
      const lead = payload.lead || {};

      const doc = new PDFDocument({ size: 'LETTER', margin: PAGE.m, bufferPages: true, autoFirstPage: false });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.info.Title = `Marketing Efficiency Audit — ${s.clientName || 'Client'}`;
      doc.info.Author = 'Smart 1 Marketing';
      doc.info.Subject = 'Marketing Efficiency Audit findings';

      let y = 0;
      let firstPage = true;

      /* ---------- page chrome ---------- */
      function newPage() {
        doc.addPage();
        const bandH = firstPage ? 108 : 62;
        doc.rect(0, 0, PAGE.w, bandH).fill(C.navy);
        doc.rect(0, bandH - 4, PAGE.w, 4).fill(C.green);

        if (fs.existsSync(LOGO)) {
          try { doc.image(LOGO, PAGE.m, firstPage ? 26 : 20, { height: firstPage ? 26 : 20 }); } catch (e) { /* ignore */ }
        }

        if (firstPage) {
          doc.font('Helvetica-Bold').fontSize(20).fillColor(C.white)
            .text('Marketing Efficiency Audit\u2122', PAGE.m, 62, { width: CONTENT_W });
          doc.font('Helvetica').fontSize(9).fillColor(C.lightText)
            .text('Directional assessment prepared for internal discussion', PAGE.m, 86, { width: CONTENT_W });
          y = bandH + 26;
        } else {
          doc.font('Helvetica-Bold').fontSize(10).fillColor(C.white)
            .text('Marketing Efficiency Audit\u2122', PAGE.m + 130, 26, { width: 240 });
          doc.font('Helvetica').fontSize(8.5).fillColor(C.lightText)
            .text(s.clientName || 'Client report', PAGE.w - PAGE.m - 220, 27, { width: 220, align: 'right' });
          y = bandH + 22;
        }
        firstPage = false;
      }

      function ensure(h) {
        if (y + h > FOOT_Y - 12) newPage();
      }

      /* ---------- primitives ---------- */
      function sectionTitle(text) {
        ensure(40);
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.muted)
          .text(text.toUpperCase(), PAGE.m, y, { width: CONTENT_W, characterSpacing: 0.9, wordSpacing: 3 });
        y += 15;
        doc.moveTo(PAGE.m, y).lineTo(PAGE.m + CONTENT_W, y).lineWidth(1).strokeColor(C.line).stroke();
        y += 14;
      }

      function body(text, opts = {}) {
        const width = opts.width || CONTENT_W;
        const size = opts.size || 10;
        const font = opts.font || 'Helvetica';
        const color = opts.color || C.ink;
        doc.font(font).fontSize(size).fillColor(color);
        const h = doc.heightOfString(text, { width, lineGap: opts.lineGap ?? 2 });
        ensure(h);
        doc.font(font).fontSize(size).fillColor(color)
          .text(text, opts.x ?? PAGE.m, y, { width, lineGap: opts.lineGap ?? 2 });
        y += h + (opts.after ?? 8);
      }

      function panel(h, fill = C.white, stroke = C.line) {
        ensure(h);
        doc.roundedRect(PAGE.m, y, CONTENT_W, h, 8).fillAndStroke(fill, stroke);
      }

      /* ---------- 1. client snapshot ---------- */
      newPage();

      const preparedBits = [
        s.preparedBy || lead.name ? `Prepared by ${s.preparedBy || lead.name}` : null,
        s.partnerFirm || lead.firm || null,
        new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      ].filter(Boolean).join('  ·  ');

      doc.font('Helvetica-Bold').fontSize(22).fillColor(C.navy)
        .text(s.clientName || 'Client business', PAGE.m, y, { width: CONTENT_W });
      y += 30;
      doc.font('Helvetica').fontSize(9.5).fillColor(C.muted)
        .text(preparedBits, PAGE.m, y, { width: CONTENT_W });
      y += 22;

      const facts = [
        ['Industry', s.industry || '—'],
        ['Annual revenue', money(s.annualRevenue)],
        ['Locations', s.locations ? String(s.locations) : '—'],
        ['Marketing vendors', s.vendors !== undefined && s.vendors !== null ? String(s.vendors) : '—'],
        ['Monthly investment', money(m.spend)],
        ['Annualized investment', money((m.spend || 0) * 12)],
      ];
      panel(64);
      const colW = CONTENT_W / 3;
      facts.forEach((f, i) => {
        const col = i % 3, row = Math.floor(i / 3);
        const fx = PAGE.m + col * colW + 14;
        const fy = y + 12 + row * 26;
        doc.font('Helvetica').fontSize(7.5).fillColor(C.muted)
          .text(f[0].toUpperCase(), fx, fy, { width: colW - 20, characterSpacing: 0.6 });
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor(C.navy)
          .text(f[1], fx, fy + 9, { width: colW - 20 });
      });
      y += 64 + 20;

      /* ---------- 2. score ---------- */
      sectionTitle('Marketing Efficiency Score\u2122');

      const score = Math.max(0, Math.min(100, Number(payload.score) || 0));
      const gaugeColor = score >= 65 ? C.green : score >= 50 ? C.gold : C.red;
      const panelH = 132;
      panel(panelH);

      const cx = PAGE.m + 92, cy = y + 96, r = 62;
      doc.path(`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`)
        .lineWidth(13).strokeColor('#EDF1F6').lineCap('round').stroke();
      const ang = Math.PI * (1 - score / 100);
      const ex = cx + r * Math.cos(ang), ey = cy - r * Math.sin(ang);
      if (score > 0.5) {
        doc.path(`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${ex} ${ey}`)
          .lineWidth(13).strokeColor(gaugeColor).lineCap('round').stroke();
      }
      doc.font('Helvetica-Bold').fontSize(30).fillColor(C.navy)
        .text(String(score), cx - 50, cy - 34, { width: 100, align: 'center' });
      doc.font('Helvetica').fontSize(9).fillColor(C.muted)
        .text('out of 100', cx - 50, cy - 4, { width: 100, align: 'center' });

      const tx = PAGE.m + 190, tw = CONTENT_W - 210;
      doc.font('Helvetica-Bold').fontSize(14).fillColor(C.navy)
        .text(payload.scoreTier || '', tx, y + 24, { width: tw });
      doc.font('Helvetica').fontSize(9.5).fillColor(C.muted)
        .text(payload.scoreNote || '', tx, y + 44, { width: tw, lineGap: 2 });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(C.ink)
        .text(`Warning signs: ${payload.leakPoints || 0} of 30 points  ·  ${payload.leakTier || ''}`,
          tx, y + panelH - 34, { width: tw });
      y += panelH + 20;

      /* ---------- 3. benchmarks ---------- */
      sectionTitle('Against industry benchmarks');

      function rangeBar(label, lo, hi, value, fmt, verdict, verdictClass, fmtValue) {
        const fmtV = fmtValue || fmt;
        const barH = 16, blockH = 58;
        ensure(blockH);
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.navy).text(label, PAGE.m, y, { width: CONTENT_W });
        const by = y + 15;

        if (lo === null || lo === undefined || value === null || value === undefined || !isFinite(value)) {
          doc.font('Helvetica').fontSize(9).fillColor(C.muted)
            .text(verdict || 'Not enough information to compare.', PAGE.m, by + 2, { width: CONTENT_W });
          y += 38;
          return;
        }

        const max = Math.max(hi * 1.6, value * 1.15);
        const px = (v) => PAGE.m + Math.min(CONTENT_W, Math.max(0, (v / max) * CONTENT_W));
        doc.roundedRect(PAGE.m, by, CONTENT_W, barH, 4).fillAndStroke(C.bg, C.line);
        doc.rect(px(lo), by, px(hi) - px(lo), barH).fill('#CFF3EC');
        doc.rect(px(lo), by, 1.6, barH).fill(C.green);
        doc.rect(px(hi) - 1.6, by, 1.6, barH).fill(C.green);
        doc.rect(px(value) - 1.2, by - 3, 2.4, barH + 6).fill(C.navy);

        doc.font('Helvetica').fontSize(7.5).fillColor(C.muted)
          .text(`benchmark ${fmt(lo)} – ${fmt(hi)}`, PAGE.m, by + barH + 4, { width: CONTENT_W / 2 });
        const vColor = verdictClass === 'bad' ? C.red : verdictClass === 'warn' ? C.amber : C.green2;
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(vColor)
          .text(`This client: ${fmtV(value)} — ${verdict}`, PAGE.m + CONTENT_W / 2, by + barH + 3,
            { width: CONTENT_W / 2, align: 'right' });
        y += blockH;
      }

      rangeBar('Marketing spend as a share of revenue', b.budgetLo, b.budgetHi, m.spendPct,
        (v) => v.toFixed(0) + '%', b.spendVerdict, b.spendClass, (v) => v.toFixed(1) + '%');

      rangeBar('Cost per lead', b.cplLo, b.cplHi, m.cpl, (v) => money(v),
        b.cplLo == null ? `No published range for ${s.industry || 'this industry'}. This client: ${money(m.cpl)} per lead.` : b.cplVerdict,
        b.cplClass);
      y += 6;

      /* ---------- 4. metrics ---------- */
      sectionTitle('Calculated performance');

      const cards = [
        ['Cost per lead', money(m.cpl), m.leads ? `${m.leads} leads per month` : 'Leads not provided'],
        ['Customer acquisition cost', money(m.cac), m.customers ? `${m.customers} new customers / month` : 'Customers not provided'],
        ['Close rate', pct(m.closeRate), 'Customers ÷ leads'],
        ['Customer lifetime value', money(m.clv), `${money(m.avgSale)} × ${m.purchasesPerYear || 1}/yr × ${m.customerYears || 1} yrs`],
        ['Monthly revenue from marketing', money(m.revenue), 'New customers × average sale'],
        ['Marketing ROI', m.roi != null ? Math.round(m.roi) + '%' : '—', '(Revenue − cost) ÷ cost'],
      ];
      const cardW = (CONTENT_W - 20) / 3, cardH = 62;
      ensure(cardH * 2 + 10);
      cards.forEach((c, i) => {
        const col = i % 3, row = Math.floor(i / 3);
        const x = PAGE.m + col * (cardW + 10);
        const cy2 = y + row * (cardH + 10);
        doc.roundedRect(x, cy2, cardW, cardH, 7).fillAndStroke(C.white, C.line);
        doc.font('Helvetica').fontSize(7).fillColor(C.muted)
          .text(c[0].toUpperCase(), x + 11, cy2 + 11, { width: cardW - 22, characterSpacing: 0.5 });
        doc.font('Helvetica-Bold').fontSize(15).fillColor(C.navy)
          .text(c[1], x + 11, cy2 + 24, { width: cardW - 22 });
        doc.font('Helvetica').fontSize(7).fillColor(C.muted)
          .text(c[2], x + 11, cy2 + 45, { width: cardW - 22 });
      });
      y += cardH * 2 + 10 + 20;

      /* ---------- 5. opportunity ---------- */
      const oppH = 92;
      ensure(oppH);
      doc.roundedRect(PAGE.m, y, CONTENT_W, oppH, 8).fill(C.navy);
      doc.font('Helvetica').fontSize(7.5).fillColor('#9FB4D0')
        .text(`GROWTH OPPORTUNITY AT +${m.liftPct || 0}% LEAD VOLUME`, PAGE.m + 18, y + 14,
          { width: CONTENT_W - 36, characterSpacing: 1 });
      doc.font('Helvetica-Bold').fontSize(26).fillColor(C.gold)
        .text(money(m.opportunityAnnual) + ' / year', PAGE.m + 18, y + 28, { width: CONTENT_W - 36 });
      doc.font('Helvetica').fontSize(8.5).fillColor(C.lightText)
        .text(`About ${money(m.opportunityMonthly)} per month at the current close rate of ${pct(m.closeRate)} and average sale of ${money(m.avgSale)}, with no change to average sale value.`,
          PAGE.m + 18, y + 62, { width: CONTENT_W - 36, lineGap: 1.5 });
      y += oppH + 22;

      /* ---------- 6. written findings ---------- */
      sectionTitle('Findings');

      if (a.headline) body(a.headline, { font: 'Helvetica-Bold', size: 13, color: C.navy, after: 8 });
      if (a.executiveSummary) body(a.executiveSummary, { size: 10, color: C.ink, after: 14 });

      (a.findings || []).forEach((f) => {
        const barColor = f.severity === 'high' ? C.red : f.severity === 'medium' ? C.amber : C.green;
        const tW = CONTENT_W - 16;
        doc.font('Helvetica-Bold').fontSize(10);
        const th = doc.heightOfString(f.title || '', { width: tW });
        doc.font('Helvetica').fontSize(9.5);
        const dh = doc.heightOfString(f.detail || '', { width: tW, lineGap: 2 });
        ensure(th + dh + 16);
        doc.rect(PAGE.m, y, 3, th + dh + 6).fill(barColor);
        doc.font('Helvetica-Bold').fontSize(10).fillColor(C.navy)
          .text(f.title || '', PAGE.m + 14, y, { width: tW });
        doc.font('Helvetica').fontSize(9.5).fillColor(C.muted)
          .text(f.detail || '', PAGE.m + 14, y + th + 2, { width: tW, lineGap: 2 });
        y += th + dh + 16;
      });

      if ((a.leaks || []).length) {
        y += 6;
        sectionTitle('Where money may be leaking');
        a.leaks.forEach((l) => {
          const lw = CONTENT_W - 145;
          doc.font('Helvetica-Bold').fontSize(9.5);
          const ah = doc.heightOfString(l.area || '', { width: lw });
          doc.font('Helvetica').fontSize(8.5);
          const wh = doc.heightOfString(l.why || '', { width: lw, lineGap: 1.5 });
          doc.font('Helvetica-Bold').fontSize(9.5);
          const amtH = doc.heightOfString(l.estimatedMonthlyImpact || '—', { width: 130 });
          const rowH = Math.max(ah + wh + 2, amtH);
          ensure(rowH + 14);
          doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.navy)
            .text(l.area || '', PAGE.m, y, { width: lw });
          doc.font('Helvetica').fontSize(8.5).fillColor(C.muted)
            .text(l.why || '', PAGE.m, y + ah + 1, { width: lw, lineGap: 1.5 });
          doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.red)
            .text(l.estimatedMonthlyImpact || '—', PAGE.m + CONTENT_W - 130, y + 1, { width: 130, align: 'right' });
          y += rowH + 8;
          doc.moveTo(PAGE.m, y).lineTo(PAGE.m + CONTENT_W, y).lineWidth(0.5).strokeColor(C.line).dash(2, { space: 2 }).stroke().undash();
          y += 8;
        });
      }

      /* ---------- 7. questions + next steps ---------- */
      function numberedList(title, items, accent) {
        if (!items || !items.length) return;
        y += 6;
        sectionTitle(title);
        items.forEach((item, i) => {
          const tw = CONTENT_W - 26;
          doc.font('Helvetica').fontSize(9.5);
          const h = doc.heightOfString(item, { width: tw, lineGap: 2 });
          ensure(h + 12);
          doc.circle(PAGE.m + 7, y + 6, 7).fill(accent);
          doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.white)
            .text(String(i + 1), PAGE.m + 2, y + 3.5, { width: 10, align: 'center' });
          doc.font('Helvetica').fontSize(9.5).fillColor(C.ink)
            .text(item, PAGE.m + 26, y, { width: tw, lineGap: 2 });
          y += h + 10;
        });
      }

      numberedList('Questions to ask in your next client meeting', a.questionsToAsk, C.sky);
      numberedList('Recommended next steps', a.nextSteps, C.green2);

      if (a.partnerTalkingPoint) {
        y += 4;
        const qw = CONTENT_W - 26;
        doc.font('Helvetica-Bold').fontSize(10.5);
        const qh = doc.heightOfString(`“${a.partnerTalkingPoint}”`, { width: qw, lineGap: 2 });
        ensure(qh + 26);
        doc.roundedRect(PAGE.m, y, CONTENT_W, qh + 22, 6).fillAndStroke(C.bg, C.line);
        doc.rect(PAGE.m, y, 3, qh + 22).fill(C.sky);
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor(C.navy)
          .text(`“${a.partnerTalkingPoint}”`, PAGE.m + 16, y + 11, { width: qw, lineGap: 2 });
        y += qh + 32;
      }

      /* ---------- 8. warning sign detail ---------- */
      const flags = payload.flags || [];
      if (flags.length) {
        y += 4;
        sectionTitle('Warning sign detail');
        flags.forEach((f) => {
          ensure(18);
          const flagged = f.answer === true;
          doc.font('Helvetica').fontSize(9).fillColor(flagged ? C.ink : C.muted)
            .text(f.label, PAGE.m + 16, y, { width: CONTENT_W - 90 });
          doc.circle(PAGE.m + 5, y + 5, 4).fill(flagged ? C.red : C.green);
          doc.font('Helvetica-Bold').fontSize(8.5).fillColor(flagged ? C.red : C.muted)
            .text(flagged ? `Flagged · ${f.points} pts` : 'Not flagged',
              PAGE.m + CONTENT_W - 84, y, { width: 84, align: 'right' });
          y += 17;
        });
        y += 8;
      }

      /* ---------- 9. CTA ---------- */
      const ctaH = 104;
      ensure(ctaH);
      doc.roundedRect(PAGE.m, y, CONTENT_W, ctaH, 8).fill(C.navy);
      doc.font('Helvetica-Bold').fontSize(14).fillColor(C.white)
        .text('Complimentary Marketing Efficiency Audit\u2122', PAGE.m + 18, y + 16, { width: CONTENT_W - 36 });
      doc.font('Helvetica').fontSize(9).fillColor(C.lightText)
        .text('Advertising spend analysis · conversion review · website evaluation · marketing technology review · competitive insights · recommendations report · 30–45 minute Zoom review.',
          PAGE.m + 18, y + 38, { width: CONTENT_W - 36, lineGap: 2 });
      doc.font('Helvetica-Bold').fontSize(10).fillColor(C.gold)
        .text('(614) 536-0768   ·   info@smart1marketing.com', PAGE.m + 18, y + ctaH - 26, { width: CONTENT_W - 36 });
      y += ctaH + 10;

      /* ---------- footers ---------- */
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.page.margins.bottom = 0; // footers sit below the text margin; without this PDFKit adds blank pages
        doc.moveTo(PAGE.m, FOOT_Y).lineTo(PAGE.m + CONTENT_W, FOOT_Y).lineWidth(0.5).strokeColor(C.line).stroke();
        doc.font('Helvetica').fontSize(7).fillColor(C.muted)
          .text('Smart 1 Marketing · Directional assessment based on information supplied by the preparer. Benchmarks vary by market, competition, maturity, and geography.',
            PAGE.m, FOOT_Y + 8, { width: CONTENT_W - 60, lineGap: 1 });
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.muted)
          .text(`${i + 1} / ${range.count}`, PAGE.m + CONTENT_W - 60, FOOT_Y + 8, { width: 60, align: 'right' });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { buildAuditPdf };
