/* Smart 1 Marketing — Marketing Efficiency Audit™
   Scoring, benchmarks, and formulas from the Client Profit Leak Assessment™,
   Marketing ROI Calculator Toolkit™, and Marketing Expense Benchmark Report™. */

/* ---------- Benchmark data ---------- */
const INDUSTRIES = {
  'Home Services':          { budget:[8,15],  cpl:[40,250] },
  'HVAC':                   { budget:[8,15],  cpl:[50,250] },
  'Plumbing':               { budget:[8,15],  cpl:[40,200] },
  'Roofing':                { budget:[8,15],  cpl:[100,450] },
  'Solar':                  { budget:[8,15],  cpl:[150,500] },
  'Construction':           { budget:[5,10],  cpl:null },
  'Healthcare':             { budget:[5,12],  cpl:[50,300] },
  'Legal':                  { budget:[7,15],  cpl:[150,700] },
  'Insurance':              { budget:[5,12],  cpl:[50,250] },
  'Real Estate':            { budget:[5,15],  cpl:[50,300] },
  'Restaurants / Catering': { budget:[3,8],   cpl:[15,100] },
  'Retail':                 { budget:[5,10],  cpl:null },
  'E-commerce':             { budget:[10,20], cpl:null },
  'Automotive':             { budget:[6,12],  cpl:null },
  'Manufacturing':          { budget:[2,7],   cpl:null },
  'Professional / B2B Services': { budget:[5,12], cpl:[100,500] },
  'Senior Living':          { budget:[6,12],  cpl:null },
  'Campgrounds / RV':       { budget:[4,10],  cpl:null },
  'Hospitality':            { budget:[4,12],  cpl:null },
  'Other / Not listed':     { budget:[5,12],  cpl:null },
};

const FLAGS = [
  { id:'f1',  label:'Spends more than $2,500 monthly on marketing', points:2 },
  { id:'f2',  label:'Cannot clearly explain marketing ROI', points:3 },
  { id:'f3',  label:'Lead volume has declined over the last 6 months', points:3 },
  { id:'f4',  label:'Marketing expenses increased without revenue growth', points:4 },
  { id:'f5',  label:'Multiple marketing vendors are being used', points:2 },
  { id:'f6',  label:'Website receives traffic but few inquiries', points:3 },
  { id:'f7',  label:'Does not know cost per lead', points:4 },
  { id:'f8',  label:'Does not track conversions', points:4 },
  { id:'f9',  label:'Agency reporting is difficult to understand', points:2 },
  { id:'f10', label:'No marketing strategy review within 12 months', points:3 },
];

const SPEND_CATEGORIES = [
  'Google advertising','Social advertising','SEO','Streaming TV',
  'Programmatic advertising','Retargeting','Website expenses',
  'Agency fees','Marketing software','Email marketing',
];

/* ---------- State ---------- */
const state = { flags:{}, spend:{}, lead:null, results:null, analysis:null, pdfUrl:null, unlocked:false };
let gaugeTimer = null;

/* ---------- Helpers ---------- */
const $ = (s) => document.querySelector(s);
const num = (id) => { const v = parseFloat(($(id)?.value ?? '').toString().replace(/,/g,'')); return isFinite(v) ? v : 0; };
const usd = (n, dp = 0) => (n == null || !isFinite(n)) ? '—' :
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

/* ---------- Build dynamic UI ---------- */
function buildUI() {
  const sel = $('#industry');
  Object.keys(INDUSTRIES).forEach((k) => {
    const o = document.createElement('option');
    o.value = k; o.textContent = k; sel.appendChild(o);
  });
  sel.value = 'Home Services';

  $('#flags').innerHTML = FLAGS.map((f) => `
    <div class="flag">
      <p>${f.label}<span class="pts">${f.points} point${f.points > 1 ? 's' : ''} if yes</span></p>
      <div class="toggle" data-flag="${f.id}" role="group" aria-label="${f.label}">
        <button type="button" data-v="yes">Yes</button>
        <button type="button" data-v="no">No</button>
      </div>
    </div>`).join('');

  $('#flags').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-v]');
    if (!btn) return;
    const group = btn.parentElement;
    group.querySelectorAll('button').forEach((b) => { b.classList.remove('sel'); b.setAttribute('aria-pressed', 'false'); });
    btn.classList.add('sel');
    btn.setAttribute('aria-pressed', 'true');
    state.flags[group.dataset.flag] = btn.dataset.v === 'yes';
    updateLeakTotal();
  });

  $('#spend').innerHTML = SPEND_CATEGORIES.map((c, i) => `
    <label class="sline"><span>${c}</span>
      <div class="prefix"><i>$</i><input type="number" min="0" step="50" data-spend="${c}" id="sp${i}" placeholder="0"></div>
    </label>`).join('');

  $('#spend').addEventListener('input', (e) => {
    if (!e.target.dataset.spend) return;
    state.spend[e.target.dataset.spend] = parseFloat(e.target.value) || 0;
    $('#spendTotal').textContent = usd(totalSpend());
  });
}

const totalSpend = () => Object.values(state.spend).reduce((a, b) => a + (b || 0), 0);
const leakPoints = () => FLAGS.reduce((sum, f) => sum + (state.flags[f.id] ? f.points : 0), 0);

function updateLeakTotal() { $('#leakRunning').textContent = `${leakPoints()} / 30`; }

/* ---------- Embed mode ---------- */
const EMBED = new URLSearchParams(location.search).get('embed') === '1';
if (EMBED) document.documentElement.classList.add('embed');

let lastHeight = 0;
function postHeight(force) {
  if (!EMBED) return;
  const h = Math.ceil(document.documentElement.scrollHeight);
  if (!force && Math.abs(h - lastHeight) < 8) return;
  lastHeight = h;
  parent.postMessage({ type: 's1-audit-height', height: h }, '*');
}
if (EMBED) {
  if (window.ResizeObserver) new ResizeObserver(() => postHeight()).observe(document.body);
  window.addEventListener('load', () => postHeight(true));
  setInterval(() => postHeight(), 800);
}

/* ---------- Navigation ---------- */
const ORDER = ['intro','step1','step2','step3','step4','results'];
function goto(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  const i = ORDER.indexOf(id);
  const prog = $('#progress');
  prog.hidden = (id === 'intro');
  $('#pfill').style.width = ((i / (ORDER.length - 1)) * 100) + '%';
  $('#psteps').querySelectorAll('span').forEach((s) => s.classList.toggle('on', Number(s.dataset.s) <= i));
  if (EMBED) {
    parent.postMessage({ type: 's1-audit-scroll' }, '*');
    postHeight(true);
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-goto]');
  if (!t) return;
  if (t.tagName === 'A') e.preventDefault();
  goto(t.dataset.goto);
});

/* ---------- Calculations ---------- */
function calculate() {
  const industry = $('#industry').value;
  const bm = INDUSTRIES[industry] || INDUSTRIES['Other / Not listed'];
  const annualRevenue = num('#annualRevenue');
  const spend = totalSpend();
  const leads = num('#leads');
  const customers = num('#customers');
  const avgSale = num('#avgSale');
  const purchasesPerYear = num('#purchasesPerYear') || 1;
  const customerYears = num('#customerYears') || 1;
  const liftPct = num('#liftPct');

  const cpl = leads > 0 && spend > 0 ? spend / leads : null;
  const cac = customers > 0 && spend > 0 ? spend / customers : null;
  const closeRate = leads > 0 ? (customers / leads) * 100 : null;
  const clv = avgSale > 0 ? avgSale * purchasesPerYear * customerYears : null;
  const revenue = customers > 0 && avgSale > 0 ? customers * avgSale : null;
  const roi = revenue != null && spend > 0 ? ((revenue - spend) / spend) * 100 : null;
  const spendPct = annualRevenue > 0 && spend > 0 ? ((spend * 12) / annualRevenue) * 100 : null;

  const addLeads = leads * (liftPct / 100);
  const addCustomers = closeRate != null ? addLeads * (closeRate / 100) : 0;
  const opportunityMonthly = addCustomers * avgSale;
  const opportunityAnnual = opportunityMonthly * 12;

  /* Benchmark verdicts */
  let spendVerdict = 'unknown', spendClass = 'na';
  if (spendPct != null) {
    if (spendPct < bm.budget[0]) { spendVerdict = 'below range'; spendClass = 'warn'; }
    else if (spendPct <= bm.budget[1]) { spendVerdict = 'within range'; spendClass = 'ok'; }
    else { spendVerdict = 'above range'; spendClass = 'bad'; }
  }
  let cplVerdict = 'no published range', cplClass = 'na';
  if (cpl != null && bm.cpl) {
    if (cpl < bm.cpl[0]) { cplVerdict = 'below range'; cplClass = 'ok'; }
    else if (cpl <= bm.cpl[1]) { cplVerdict = 'within range'; cplClass = 'ok'; }
    else { cplVerdict = 'above range'; cplClass = 'bad'; }
  }

  /* Marketing Efficiency Score™ — 100 points */
  const pts = leakPoints();
  let score = 45 * (1 - pts / 30);                       // measurement & visibility
  if (spendVerdict === 'within range') score += 20;      // spend alignment
  else if (spendVerdict === 'below range') score += 14;
  else if (spendVerdict === 'above range') score += (spendPct <= bm.budget[1] * 1.25 ? 12 : 5);
  else score += 10;

  if (cplClass === 'ok') score += 15;                    // acquisition efficiency
  else if (cplVerdict === 'above range') score += (cpl <= bm.cpl[1] * 1.5 ? 7 : 2);
  else score += 10;

  if (roi == null) score += 3;                           // return
  else if (roi >= 300) score += 20;
  else if (roi >= 150) score += 15;
  else if (roi >= 50) score += 10;
  else if (roi >= 0) score += 5;

  score = Math.max(0, Math.min(100, Math.round(score)));

  const scoreTier =
    score >= 80 ? 'Strong performance' :
    score >= 65 ? 'Monitor' :
    score >= 50 ? 'Opportunity exists' :
    score >= 35 ? 'Significant opportunity' : 'Immediate review recommended';

  const scoreNote =
    score >= 80 ? 'Spending and measurement appear aligned. Continue quarterly reviews.' :
    score >= 65 ? 'Some inefficiencies may exist. Review reporting and channel performance.' :
    score >= 50 ? 'Several indicators suggest room to optimize spend and conversion.' :
    score >= 35 ? 'Hidden inefficiencies may be affecting profitability. A detailed review is advised.' :
    'Multiple indicators suggest marketing spend is not optimized. Review strongly encouraged.';

  const leakTier =
    pts <= 5 ? 'Healthy' : pts <= 10 ? 'Monitor' : pts <= 15 ? 'Opportunity exists' :
    pts <= 20 ? 'Significant opportunity' : 'Immediate review recommended';

  return {
    snapshot: {
      clientName: $('#clientName').value.trim(), industry,
      annualRevenue, locations: num('#locations'), vendors: num('#vendors'),
      preparedBy: $('#preparedBy').value.trim(),
      partnerFirm: $('#partnerFirm').value.trim(),
    },
    spend: state.spend,
    metrics: { spend, leads, customers, avgSale, purchasesPerYear, customerYears,
      cpl, cac, closeRate, clv, revenue, roi, spendPct, liftPct,
      opportunityMonthly, opportunityAnnual },
    benchmark: { budgetLo: bm.budget[0], budgetHi: bm.budget[1],
      cplLo: bm.cpl?.[0] ?? null, cplHi: bm.cpl?.[1] ?? null,
      spendVerdict, spendClass, cplVerdict, cplClass },
    flags: FLAGS.map((f) => ({ label: f.label, points: f.points, answer: !!state.flags[f.id] })),
    leakPoints: pts, leakTier, score, scoreTier, scoreNote,
  };
}

/* ---------- Rendering ---------- */
function rangeBar({ lo, hi, value, axisMax, fmt }) {
  if (value == null || lo == null) return '<p class="bverdict na">Not enough information to compare.</p>';
  const max = axisMax || Math.max(hi * 1.6, value * 1.15);
  const pct = (v) => Math.min(100, Math.max(0, (v / max) * 100));
  return `
    <div class="brange">
      <div class="bband" style="left:${pct(lo)}%;width:${pct(hi) - pct(lo)}%"></div>
      <div class="bmark" style="left:${pct(value)}%" title="This client"></div>
    </div>
    <div class="blabels"><span>0</span><span>benchmark ${fmt(lo)}–${fmt(hi)}</span><span>${fmt(max)}</span></div>`;
}

function renderReport(r) {
  const m = r.metrics, b = r.benchmark;
  $('#rTitle').textContent = r.snapshot.clientName ? `Findings for ${r.snapshot.clientName}` : 'Findings summary';
  $('#rMeta').textContent = [
    r.snapshot.preparedBy ? `Prepared by ${r.snapshot.preparedBy}${r.snapshot.partnerFirm ? ', ' + r.snapshot.partnerFirm : ''}` : null,
    r.snapshot.industry,
    m.spend ? usd(m.spend) + '/mo marketing investment' : null,
    r.snapshot.annualRevenue ? usd(r.snapshot.annualRevenue) + ' annual revenue' : null,
    'Prepared ' + new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
  ].filter(Boolean).join(' · ');

  /* gauge */
  $('#scoreTier').textContent = r.scoreTier;
  $('#scoreNote').textContent = r.scoreNote;
  const arc = 270;
  const fill = $('#gFill');
  fill.style.stroke = r.score >= 65 ? 'var(--green)' : r.score >= 50 ? 'var(--gold)' : 'var(--red)';
  let n = 0;
  clearInterval(gaugeTimer);
  gaugeTimer = setInterval(() => {
    n += Math.max(1, Math.round(r.score / 28));
    if (n >= r.score) { n = r.score; clearInterval(gaugeTimer); }
    $('#scoreNum').textContent = n;
  }, 26);
  requestAnimationFrame(() => { fill.style.strokeDashoffset = arc - (arc * r.score) / 100; });

  /* benchmarks */
  $('#benchSpend').innerHTML = rangeBar({
    lo: b.budgetLo, hi: b.budgetHi, value: m.spendPct,
    axisMax: Math.max(b.budgetHi * 1.8, (m.spendPct || 0) * 1.2),
    fmt: (v) => v.toFixed(0) + '%',
  }) + (m.spendPct != null
    ? `<p class="bverdict ${b.spendClass}">This client: ${m.spendPct.toFixed(1)}% of revenue — ${b.spendVerdict}</p>`
    : '');

  $('#benchCpl').innerHTML = (b.cplLo != null
    ? rangeBar({ lo: b.cplLo, hi: b.cplHi, value: m.cpl, fmt: (v) => usd(v) }) +
      (m.cpl != null ? `<p class="bverdict ${b.cplClass}">This client: ${usd(m.cpl)} per lead — ${b.cplVerdict}</p>` : '')
    : `<p class="bverdict na">No published cost-per-lead range for ${r.snapshot.industry}. Client cost per lead: ${m.cpl != null ? usd(m.cpl) : 'not calculable'}.</p>`);

  /* metrics */
  const cards = [
    { k: 'Monthly investment', v: usd(m.spend), n: usd(m.spend * 12) + ' annualized' },
    { k: 'Cost per lead', v: m.cpl != null ? usd(m.cpl) : '—', n: m.leads ? `${m.leads} leads / month` : 'Leads not provided', hi: b.cplClass === 'bad' },
    { k: 'Customer acquisition cost', v: m.cac != null ? usd(m.cac) : '—', n: m.customers ? `${m.customers} new customers / month` : 'Customers not provided' },
    { k: 'Close rate', v: m.closeRate != null ? m.closeRate.toFixed(1) + '%' : '—', n: 'Customers ÷ leads' },
    { k: 'Customer lifetime value', v: m.clv != null ? usd(m.clv) : '—', n: `${usd(m.avgSale)} × ${m.purchasesPerYear}/yr × ${m.customerYears} yrs` },
    { k: 'Marketing ROI', v: m.roi != null ? Math.round(m.roi) + '%' : '—', n: m.revenue != null ? usd(m.revenue) + ' monthly revenue' : 'Revenue not calculable', hi: m.roi != null && m.roi < 100 },
  ];
  $('#metrics').innerHTML = cards.map((c) =>
    `<div class="metric${c.hi ? ' hi' : ''}"><div class="k">${c.k}</div><div class="v">${c.v}</div><div class="n">${c.n}</div></div>`).join('');

  /* opportunity */
  $('#oppPanel').innerHTML = `
    <h4>Growth opportunity at +${m.liftPct}% lead volume</h4>
    <div class="big">${usd(m.opportunityAnnual)}</div>
    <p>Additional annual revenue if lead volume improved ${m.liftPct}% at the current close rate of
    ${m.closeRate != null ? m.closeRate.toFixed(1) + '%' : 'unknown'} and average sale of ${usd(m.avgSale)} —
    about ${usd(m.opportunityMonthly)} per month, with no change to average sale value.</p>`;

  /* recap */
  const yes = r.flags.filter((f) => f.answer), no = r.flags.filter((f) => !f.answer);
  $('#flagRecap').innerHTML =
    (yes.map((f) => `<span class="chip">${f.label} · ${f.points}</span>`).join('') || '<span class="chip clear">No warning signs flagged</span>') +
    no.map((f) => `<span class="chip clear">${f.label}</span>`).join('');
}

/* ---------- AI findings ---------- */
function esc(s = '') { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

async function loadAnalysis(r) {
  try {
    const res = await fetch('/api/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r),
    });
    const data = await res.json();
    state.analysis = data.analysis;
    renderAnalysis(data.analysis, data.source);
    buildPdf();
  } catch {
    $('#aiBadge').textContent = 'Unavailable';
    $('#aiBody').innerHTML = '<p>Written findings could not be generated. The scores and calculations above are complete and can be printed.</p>';
    buildPdf();
  }
}

function renderAnalysis(a, source) {
  $('#aiBadge').textContent = source === 'openai' ? 'AI-assisted analysis' : 'Rules-based analysis';
  if (!a) return;
  $('#aiBody').innerHTML = `
    <p class="headline">${esc(a.headline || '')}</p>
    <p>${esc(a.executiveSummary || '')}</p>
    ${a.findings?.length ? '<h5>What the numbers show</h5>' + a.findings.map((f) =>
      `<div class="finding ${['high','medium','low'].includes(f.severity) ? f.severity : 'low'}">
         <b>${esc(f.title)}</b><span>${esc(f.detail)}</span></div>`).join('') : ''}
    ${a.leaks?.length ? '<h5>Where money may be leaking</h5>' + a.leaks.map((l) =>
      `<div class="leak"><span><b>${esc(l.area)}</b><i>${esc(l.why)}</i></span>
         <span class="amt">${esc(l.estimatedMonthlyImpact)}</span></div>`).join('') : ''}
    ${a.questionsToAsk?.length ? '<h5>Questions to ask in your next client meeting</h5><ul>' +
      a.questionsToAsk.map((q) => `<li>${esc(q)}</li>`).join('') + '</ul>' : ''}
    ${a.nextSteps?.length ? '<h5>Recommended next steps</h5><ul>' +
      a.nextSteps.map((s) => `<li>${esc(s)}</li>`).join('') + '</ul>' : ''}
    ${a.partnerTalkingPoint ? `<div class="quote">“${esc(a.partnerTalkingPoint)}”</div>` : ''}`;
}

/* ---------- PDF report ---------- */
function setDownload(state_, url) {
  [$('#dlBtn'), $('#dlBtn2')].forEach((btn) => {
    if (!btn) return;
    if (state_ === 'ready') {
      btn.setAttribute('href', url);
      btn.removeAttribute('aria-disabled');
      // A cross-origin file (Cloudinary) ignores the download attribute, so open it in a tab instead
      if (url.startsWith('http') && !url.startsWith(location.origin)) {
        btn.setAttribute('target', '_blank');
        btn.setAttribute('rel', 'noopener');
        btn.removeAttribute('download');
      } else {
        btn.setAttribute('download', '');
      }
      btn.textContent = btn.id === 'dlBtn' ? 'Download PDF report' : 'Download the PDF report';
    } else if (state_ === 'error') {
      btn.setAttribute('aria-disabled', 'true');
      btn.textContent = 'PDF unavailable';
    } else {
      btn.setAttribute('aria-disabled', 'true');
      btn.textContent = 'Preparing PDF…';
    }
  });
}

async function buildPdf() {
  if (!state.results) return;
  setDownload('pending');
  try {
    const res = await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...state.results, analysis: state.analysis || null, lead: state.lead || null }),
    });
    const data = await res.json();
    if (!data.url) throw new Error('no url');
    state.pdfUrl = data.url;
    setDownload('ready', data.url);
  } catch (err) {
    console.error('PDF generation failed', err);
    setDownload('error');
  }
}

/* ---------- Gate ---------- */
$('#toGate').addEventListener('click', () => {
  state.results = calculate();
  renderReport(state.results);
  if (state.unlocked) {
    $('#aiBadge').textContent = 'Generating…';
    $('#aiBody').innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel short"></div>';
    loadAnalysis(state.results);
  }
  goto('results');
});

$('#unlock').addEventListener('click', async () => {
  const name = $('#gName').value.trim(), firm = $('#gFirm').value.trim(), email = $('#gEmail').value.trim();
  if (!name || !firm || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    $('#gateErr').textContent = 'Enter your name, firm, and a valid email address to continue.';
    return;
  }
  $('#gateErr').textContent = '';
  $('#unlock').disabled = true;
  $('#unlock').textContent = 'Preparing findings…';

  state.lead = { name, firm, email, phone: $('#gPhone').value.trim() };
  fetch('/api/lead', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...state.lead,
      partnerName: state.results.snapshot.preparedBy || state.lead.name,
      partnerFirm: state.results.snapshot.partnerFirm || state.lead.firm,
      client: state.results.snapshot,
      score: state.results.score,
      scoreTier: state.results.scoreTier,
      leakPoints: state.results.leakPoints,
      leakTier: state.results.leakTier,
      monthlySpend: state.results.metrics.spend,
    }),
  }).catch(() => {});

  $('#gate').style.display = 'none';
  $('#report').classList.remove('locked');
  state.unlocked = true;
  renderReport(state.results);
  loadAnalysis(state.results);
});

$('#printBtn').addEventListener('click', () => window.print());
$('#restart').addEventListener('click', () => location.reload());

/* ---------- Init ---------- */
buildUI();

// Partner-specific links: /?partner=Jane%20Doe&firm=Doe%20CPA%20Group
const qs = new URLSearchParams(location.search);
if (qs.get('partner')) $('#preparedBy').value = qs.get('partner');
if (qs.get('firm')) $('#partnerFirm').value = qs.get('firm');

// Carry the partner's details into the gate so they aren't typed twice
$('#toGate').addEventListener('click', () => {
  if (!$('#gName').value) $('#gName').value = $('#preparedBy').value;
  if (!$('#gFirm').value) $('#gFirm').value = $('#partnerFirm').value;
});

goto('intro');
postHeight(true);
