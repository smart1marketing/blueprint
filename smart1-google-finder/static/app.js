const q = document.getElementById('q');
const results = document.getElementById('results');
const statusEl = document.getElementById('status');
let platform = 'all';
let timer;
let currentReportPayload = null;

function esc(v='') {
  return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function getBadgeClass(platformName) {
  if (platformName.includes('Tag')) return 'gtm';
  if (platformName.includes('Business')) return 'gmb';
  if (platformName.includes('Console')) return 'gsc';
  return 'ga';
}

function draw(items) {
  if (!items.length) {
    results.innerHTML = '<div class="empty">No matches found.</div>';
    return;
  }
  results.innerHTML = items.map(x => `
    <article class="result">
      <div class="badge ${getBadgeClass(x.platform)}">${esc(x.platform)}</div>
      <div class="main">
        <h3>${esc(x.name || '(unnamed)')}</h3>
        <div class="login"><b>Google Login:</b> ${esc(x.google_login)}</div>
        <div class="meta"><b>Account:</b> ${esc(x.account_name)} <span>${esc(x.account_id)}</span></div>
        <div class="meta"><b>${esc(x.type)}:</b> ${esc(x.resource_id)}</div>
      </div>
      <div style="display:flex; flex-direction:column; gap:6px;">
        ${x.open_url ? `<a class="open" target="_blank" rel="noopener" href="${esc(x.open_url)}">Open</a>` : ''}
        ${x.platform === 'Google Analytics' ? `<button class="btn btn-analyze-ga4" data-id="${esc(x.resource_id)}" data-login="${esc(x.google_login)}" style="font-size:12px; padding:6px 10px; background:#1a2e58!important;">Analyze GA4 Traffic</button>` : ''}
      </div>
    </article>
  `).join('');

  document.querySelectorAll('.btn-analyze-ga4').forEach(btn => {
    btn.addEventListener('click', () => {
      const propId = btn.dataset.id;
      const loginEmail = btn.dataset.login;
      populateGa4Comparator(propId, loginEmail);
    });
  });
}

async function populateGa4Comparator(propertyId, loginEmail) {
  document.getElementById('comp-property-id').value = propertyId;
  document.getElementById('comp-login').value = loginEmail;
  document.getElementById('comp-period-type').value = 'previous_period';

  // Calculate Last Month (P1) and Previous Month (P2)
  const now = new Date();
  const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDayLastMonth = new Date(firstDayThisMonth.getTime() - 86400000);
  const firstDayLastMonth = new Date(lastDayLastMonth.getFullYear(), lastDayLastMonth.getMonth(), 1);

  const formatDate = d => d.toISOString().split('T')[0];
  document.getElementById('p1-start').value = formatDate(firstDayLastMonth);
  document.getElementById('p1-end').value = formatDate(lastDayLastMonth);

  const compCard = document.querySelector('.ai-comparator-card');
  if (compCard) {
    compCard.scrollIntoView({ behavior: 'smooth' });
  }

  const sourceSelect = document.getElementById('comp-source-medium');
  sourceSelect.innerHTML = '<option value="">Loading available channels...</option>';

  try {
    const resp = await fetch('/api/ga4/channels', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ property_id: propertyId, google_login: loginEmail })
    });
    const data = await resp.json();
    if (resp.ok && data.channels && data.channels.length) {
      sourceSelect.innerHTML = '<option value="">All Sources / Mediums (No Filter)</option>' +
        data.channels.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    } else {
      sourceSelect.innerHTML = '<option value="">All Sources / Mediums (No Filter)</option>';
    }
  } catch (err) {
    sourceSelect.innerHTML = '<option value="">All Sources / Mediums (No Filter)</option>';
  }
}

async function search() {
  if (!q) return;
  const value = q.value.trim();
  if (!value) {
    results.innerHTML = '';
    statusEl.textContent = 'Start typing to search all connected accounts.';
    return;
  }
  statusEl.textContent = 'Searching all connected Google accounts…';
  const r = await fetch(`/api/search?q=${encodeURIComponent(value)}&platform=${encodeURIComponent(platform)}`);
  const data = await r.json();
  if (!r.ok) {
    statusEl.textContent = data.error || 'Search failed.';
    return;
  }
  const items = data.results || [];
  const problemCount = (data.errors || []).length;
  statusEl.textContent = `${items.length} match${items.length === 1 ? '' : 'es'}${problemCount ? ` · ${problemCount} account refresh error${problemCount === 1 ? '' : 's'}` : ''}`;
  draw(items);
}

if (q) q.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(search, 250);
});

document.querySelectorAll('.filter').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.filter').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  platform = btn.dataset.platform;
  search();
}));

const refresh = document.getElementById('refresh');
if (refresh) refresh.addEventListener('click', async () => {
  refresh.disabled = true;
  refresh.textContent = 'Refreshing…';
  const r = await fetch('/api/refresh', {method:'POST'});
  const data = await r.json();
  refresh.textContent = `Refreshed ${data.count || 0} records`;
  setTimeout(() => { refresh.textContent = 'Refresh Google data'; refresh.disabled = false; }, 1800);
  search();
});

document.querySelectorAll('.disconnect').forEach(btn => btn.addEventListener('click', async () => {
  const email = btn.dataset.email;
  const r = await fetch(`/disconnect/${encodeURIComponent(email)}`, {method:'POST'});
  if (r.ok) window.location.reload();
}));

// GA4 Comparison Engine Logic
const scopeSelect = document.getElementById('comp-scope-type');
const pageWrapper = document.getElementById('page-path-wrapper');

if (scopeSelect) {
  scopeSelect.addEventListener('change', () => {
    if (scopeSelect.value === 'page' || scopeSelect.value === 'multiple') {
      pageWrapper.style.display = 'block';
    } else {
      pageWrapper.style.display = 'none';
    }
  });
}

const runCompBtn = document.getElementById('run-ga4-comp');
if (runCompBtn) {
  runCompBtn.addEventListener('click', async () => {
    const property_id = document.getElementById('comp-property-id').value.trim();
    const google_login = document.getElementById('comp-login').value.trim();
    const period_type = document.getElementById('comp-period-type').value;
    const scope_type = document.getElementById('comp-scope-type').value;
    const page_path = document.getElementById('comp-page-path').value.trim();
    const source_medium = document.getElementById('comp-source-medium').value;
    const p1_start = document.getElementById('p1-start').value;
    const p1_end = document.getElementById('p1-end').value;

    const resBox = document.getElementById('ai-comp-results');
    resBox.innerHTML = '<p style="font-size:13px; color:#1a2e58;">Running GA4 Data API report and compiling AI analysis…</p>';

    const resp = await fetch('/api/ga4/compare', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        property_id, google_login, period_type, scope_type,
        page_path, source_medium, p1_start, p1_end
      })
    });

    const data = await resp.json();
    if (!resp.ok) {
      resBox.innerHTML = `<div style="color:#c5221f; font-size:13px;">Error: ${esc(data.error || 'Failed to generate comparison.')}</div>`;
      return;
    }

    currentReportPayload = data;
    const ai = data.ai_analysis;
    const m1 = data.metrics_p1;
    const m2 = data.metrics_p2;
    const breakdown = data.breakdown || [];

    resBox.innerHTML = `
      <div class="ai-box">
        <h4 style="margin:0 0 8px; color:#1a2e58; font-size:15px;">🤖 AI Traffic Summary: ${esc(ai.status)}</h4>
        <ul style="margin:0 0 12px; padding-left:18px; font-size:13px; color:#202124;">
          ${ai.insights.map(i => `<li>${i.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/`(.*?)`/g, '<code>$1</code>')}</li>`).join('')}
        </ul>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; background:#fff; padding:12px; border-radius:8px; border:1px solid #d8e0eb; font-size:13px;">
          <div>
            <strong style="color:#1a2e58;">${esc(data.p1_label)}</strong>
            <div>Sessions: <b>${m1.sessions.toLocaleString()}</b></div>
            <div>Active Users: <b>${m1.activeUsers.toLocaleString()}</b></div>
            <div>Key Events: <b>${m1.keyEvents.toLocaleString()}</b></div>
          </div>
          <div>
            <strong style="color:#1a2e58;">${esc(data.p2_label)}</strong>
            <div>Sessions: <b>${m2.sessions.toLocaleString()}</b></div>
            <div>Active Users: <b>${m2.activeUsers.toLocaleString()}</b></div>
            <div>Key Events: <b>${m2.keyEvents.toLocaleString()}</b></div>
          </div>
        </div>

        ${breakdown.length ? `
          <div style="margin-top:14px; background:#fff; padding:12px; border-radius:8px; border:1px solid #d8e0eb;">
            <h5 style="margin:0 0 8px; font-size:13px; color:#1a2e58;">Top Source / Medium Performance Breakdown</h5>
            <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;">
              <thead>
                <tr style="border-bottom:2px solid #e1e7ef; color:#58677e;">
                  <th style="padding:6px;">Source / Medium</th>
                  <th style="padding:6px; text-align:right;">Selected Period</th>
                  <th style="padding:6px; text-align:right;">Prior Period</th>
                  <th style="padding:6px; text-align:right;">Change</th>
                </tr>
              </thead>
              <tbody>
                ${breakdown.map(b => {
                  const diff = b.session_diff;
                  const diffColor = diff > 0 ? '#137333' : (diff < 0 ? '#c5221f' : '#58677e');
                  const diffSign = diff > 0 ? '+' : '';
                  return `
                    <tr style="border-bottom:1px solid #f0f4f9;">
                      <td style="padding:6px;"><code>${esc(b.name)}</code></td>
                      <td style="padding:6px; text-align:right;"><b>${b.p1_sessions.toLocaleString()}</b></td>
                      <td style="padding:6px; text-align:right;">${b.p2_sessions.toLocaleString()}</td>
                      <td style="padding:6px; text-align:right; font-weight:bold; color:${diffColor};">${diffSign}${diff.toLocaleString()}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}

        <div style="margin-top:14px; padding:12px; background:#eaf2ff; border:1px solid #b8d2f8; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:13px; color:#1a2e58; font-weight:600;">Would you like to save this report for future comparison and automated alerts?</span>
          <button id="btn-open-save-modal" class="btn" style="padding:6px 12px; font-size:12px;">Save Report & Setup Alerts</button>
        </div>
      </div>
    `;

    document.getElementById('btn-open-save-modal').addEventListener('click', () => {
      document.getElementById('save-modal').style.display = 'flex';
    });
  });
}

// Save Report & Schedule Modal Handlers
const enableAlertsEl = document.getElementById('modal-enable-alerts');
if (enableAlertsEl) {
  enableAlertsEl.addEventListener('change', (e) => {
    document.getElementById('alert-options-box').style.display = e.target.value === 'yes' ? 'block' : 'none';
  });
}

const cancelBtn = document.getElementById('modal-cancel');
if (cancelBtn) {
  cancelBtn.addEventListener('click', () => {
    document.getElementById('save-modal').style.display = 'none';
  });
}

const confirmSaveBtn = document.getElementById('modal-confirm-save');
if (confirmSaveBtn) {
  confirmSaveBtn.addEventListener('click', async () => {
    const customer_name = document.getElementById('modal-cust-name').value.trim();
    const summary_title = document.getElementById('modal-sum-title').value.trim();
    const enableAlerts = document.getElementById('modal-enable-alerts').value === 'yes';

    if (!customer_name || !summary_title) {
      alert("Please enter both customer name and summary title.");
      return;
    }

    const saveResp = await fetch('/api/reports/save', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        customer_name,
        summary_title,
        property_id: currentReportPayload.property_id,
        google_login: document.getElementById('comp-login').value.trim(),
        report_data: currentReportPayload
      })
    });

    const saveRes = await saveResp.json();
    if (!saveResp.ok) {
      alert("Error saving report: " + saveRes.error);
      return;
    }

    if (enableAlerts) {
      const notification_email = document.getElementById('modal-alert-email').value.trim();
      const frequency = document.getElementById('modal-alert-freq').value;
      const ghl_webhook_url = document.getElementById('modal-ghl-url').value.trim();

      await fetch('/api/reports/subscribe', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          report_id: saveRes.report_id,
          notification_email,
          frequency,
          ghl_webhook_url
        })
      });
    }

    document.getElementById('save-modal').style.display = 'none';
    alert("Report saved successfully!");
    fetchSavedReports();
  });
}

// Search Historical Reports
async function fetchSavedReports(query='') {
  const listEl = document.getElementById('saved-reports-list');
  if (!listEl) return;

  const resp = await fetch(`/api/reports/search?q=${encodeURIComponent(query)}`);
  const data = await resp.json();
  
  if (!data.reports || !data.reports.length) {
    listEl.innerHTML = '<span style="font-size:12px; color:#69758a;">No historical reports found.</span>';
    return;
  }

  listEl.innerHTML = data.reports.map(r => `
    <div style="padding:8px 10px; background:#fff; border:1px solid #d8e0eb; border-radius:6px; margin-bottom:6px; font-size:12px; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <strong>${esc(r.customer_name)}</strong> - ${esc(r.summary_title)} 
        <span style="color:#69758a;">(Property: ${esc(r.property_id)})</span>
      </div>
      <span style="color:#8a95a7;">${new Date(r.created_at * 1000).toLocaleDateString()}</span>
    </div>
  `).join('');
}

const btnSearchSaved = document.getElementById('btn-search-saved');
if (btnSearchSaved) {
  btnSearchSaved.addEventListener('click', () => {
    fetchSavedReports(document.getElementById('search-saved-q').value);
  });
}

// Manual GMB Checker Logic
const manualBtn = document.getElementById('manual-btn');
const manualInput = document.getElementById('manual-q');
const manualResults = document.getElementById('manual-results');

if (manualBtn && manualInput) {
  manualBtn.addEventListener('click', () => {
    const query = manualInput.value.trim();
    if (!query) {
      manualResults.innerHTML = '<span style="font-size:13px; color:#c5221f;">Please enter a business name or URL.</span>';
      return;
    }

    const encoded = encodeURIComponent(query);
    const mapsSearchUrl = `https://www.google.com/maps/search/${encoded}`;
    const gmbClaimUrl = `https://business.google.com/add`;
    const googleSearchUrl = `https://www.google.com/search?q=${encoded}`;

    manualResults.innerHTML = `
      <div class="manual-results-group">
        <strong>Quick Links for "${esc(query)}":</strong>
        <a href="${mapsSearchUrl}" target="_blank" rel="noopener" class="open" style="padding: 6px 10px; font-size: 12px;">Search Maps</a>
        <a href="${googleSearchUrl}" target="_blank" rel="noopener" class="open" style="padding: 6px 10px; font-size: 12px; background: #1a2e58!important;">Google Search</a>
        <a href="${gmbClaimUrl}" target="_blank" rel="noopener" class="open" style="padding: 6px 10px; font-size: 12px; background: #137333!important;">Claim/Add on GMB</a>
      </div>
    `;
  });
}
