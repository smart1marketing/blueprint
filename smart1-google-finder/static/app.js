const q = document.getElementById('q');
const statusEl = document.getElementById('status');
let platform = 'all';
let timer;
let currentReportPayload = null;
let currentGtmContext = { account_id: '', container_id: '', google_login: '' };

function esc(v='') {
  return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function getBadgeClass(platformName) {
  if (platformName.includes('Tag')) return 'gtm';
  if (platformName.includes('Business')) return 'gmb';
  if (platformName.includes('Console')) return 'gsc';
  return 'ga';
}

function renderCard(x) {
  const domainGuess = x.search_extra || x.name || '';
  return `
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
        ${x.platform === 'Google Analytics' ? `<button class="btn btn-auto-all" data-id="${esc(x.resource_id)}" data-login="${esc(x.google_login)}" data-name="${esc(x.name)}" data-extra="${esc(x.search_extra)}" style="font-size:12px; padding:6px 10px; background:#1a2e58!important;">⚡ Auto-Populate All Tools</button>` : ''}
        ${x.platform === 'Google Tag Manager' ? `<button class="btn btn-inspect-gtm" data-account="${esc(x.account_id)}" data-container="${esc(x.internal_container_id || x.resource_id)}" data-login="${esc(x.google_login)}" style="font-size:12px; padding:6px 10px; background:#24519c!important;">Inspect GTM Tags</button>` : ''}
      </div>
    </article>
  `;
}

function draw(items) {
  const boxAnalytics = document.getElementById('box-analytics');
  const boxGmb = document.getElementById('box-gmb');
  const boxGsc = document.getElementById('box-gsc');

  const resAnalytics = document.getElementById('results-analytics');
  const resGmb = document.getElementById('results-gmb');
  const resGsc = document.getElementById('results-gsc');

  if (!items.length) {
    boxAnalytics.style.display = 'none';
    boxGmb.style.display = 'none';
    boxGsc.style.display = 'none';
    statusEl.textContent = 'No matches found.';
    return;
  }

  const analyticsItems = items.filter(x => x.platform === 'Google Analytics' || x.platform === 'Google Tag Manager');
  const gmbItems = items.filter(x => x.platform === 'Google Business Profile');
  const gscItems = items.filter(x => x.platform === 'Search Console');

  if (analyticsItems.length && (platform === 'all' || platform === 'analytics')) {
    resAnalytics.innerHTML = analyticsItems.map(renderCard).join('');
    boxAnalytics.style.display = 'block';
  } else {
    boxAnalytics.style.display = 'none';
  }

  if (gmbItems.length && (platform === 'all' || platform === 'gmb')) {
    resGmb.innerHTML = gmbItems.map(renderCard).join('');
    boxGmb.style.display = 'block';
  } else {
    boxGmb.style.display = 'none';
  }

  if (gscItems.length && (platform === 'all' || platform === 'gsc')) {
    resGsc.innerHTML = gscItems.map(renderCard).join('');
    boxGsc.style.display = 'block';
  } else {
    boxGsc.style.display = 'none';
  }

  // Universal Auto-Populate Button Listener
  document.querySelectorAll('.btn-auto-all').forEach(btn => {
    btn.addEventListener('click', () => {
      autoPopulateAll(
        btn.dataset.id, 
        btn.dataset.login, 
        btn.dataset.name, 
        btn.dataset.extra
      );
    });
  });

  // GTM Inspection Button Listener
  document.querySelectorAll('.btn-inspect-gtm').forEach(btn => {
    btn.addEventListener('click', async () => {
      const account_id = btn.dataset.account;
      const container_id = btn.dataset.container;
      const google_login = btn.dataset.login;

      currentGtmContext = { account_id, container_id, google_login };

      const modal = document.getElementById('gtm-modal');
      const body = document.getElementById('gtm-modal-body');
      modal.style.display = 'flex';
      body.innerHTML = '<p style="font-size:13px; color:#1a2e58;">Fetching live GTM workspace tags, triggers, and variables...</p>';

      const resp = await fetch('/api/gtm/inspect', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ account_id, container_id, google_login })
      });

      const data = await resp.json();
      if (!resp.ok) {
        body.innerHTML = `<div style="color:#c5221f; font-size:13px;">Error: ${esc(data.error || 'Failed to fetch GTM workspace.')}</div>`;
        return;
      }

      body.innerHTML = `
        <div style="font-size:13px;">
          <h4 style="margin:0 0 8px; color:#1a2e58;">🏷️ Tags (${data.tags.length}):</h4>
          <ul style="margin:0 0 14px; padding-left:18px;">
            ${data.tags.map(t => `<li><b>${esc(t.name)}</b> <span style="color:#69758a;">(${esc(t.type)})${t.paused ? ' [PAUSED]' : ''}</span></li>`).join('') || '<li>No tags defined.</li>'}
          </ul>

          <h4 style="margin:0 0 8px; color:#1a2e58;">⚡ Triggers (${data.triggers.length}):</h4>
          <ul style="margin:0 0 14px; padding-left:18px;">
            ${data.triggers.map(tr => `<li><b>${esc(tr.name)}</b> <span style="color:#69758a;">(${esc(tr.type)})</span></li>`).join('') || '<li>No triggers defined.</li>'}
          </ul>

          <h4 style="margin:0 0 8px; color:#1a2e58;">🔧 Variables (${data.variables.length}):</h4>
          <ul style="margin:0; padding-left:18px;">
            ${data.variables.map(v => `<li><b>${esc(v.name)}</b> <span style="color:#69758a;">(${esc(v.type)})</span></li>`).join('') || '<li>No user variables defined.</li>'}
          </ul>
        </div>
      `;
    });
  });
}

// Master Universal Auto-Populate Function
async function autoPopulateAll(propertyId, loginEmail, propertyName='', extraData='') {
  // 1. Populate GA4 AI Performance Comparator
  document.getElementById('comp-property-id').value = propertyId;
  document.getElementById('comp-login').value = loginEmail;
  document.getElementById('comp-date-preset').value = 'last_month';
  applyPresetDates('last_month');

  // 2. Populate GTM Auto-Event Generator URL
  const gtmUrlInput = document.getElementById('gtm-gen-url');
  if (gtmUrlInput) {
    let cleanUrl = propertyName;
    if (cleanUrl.includes('http') || cleanUrl.includes('.com') || cleanUrl.includes('.org') || cleanUrl.includes('.net')) {
      gtmUrlInput.value = cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`;
    } else if (extraData.includes('http') || extraData.includes('.com')) {
      gtmUrlInput.value = extraData.startsWith('http') ? extraData : `https://${extraData}`;
    }
  }

  // 3. Populate Manual GMB Audit Field
  const manualGmbInput = document.getElementById('manual-q');
  if (manualGmbInput) {
    manualGmbInput.value = propertyName;
  }

  // 4. Smooth Scroll to AI Comparator Widget
  const compCard = document.querySelector('.ai-comparator-card');
  if (compCard) {
    compCard.scrollIntoView({ behavior: 'smooth' });
  }

  // 5. Auto-Load Source/Medium Channels
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

document.getElementById('gtm-modal-close').addEventListener('click', () => {
  document.getElementById('gtm-modal').style.display = 'none';
});

// AI GTM Event Generator Logic
const gtmGenBtn = document.getElementById('gtm-gen-btn');
const gtmGenUrlInput = document.getElementById('gtm-gen-url');
const gtmGenResults = document.getElementById('gtm-gen-results');

if (gtmGenBtn && gtmGenUrlInput) {
  gtmGenBtn.addEventListener('click', async () => {
    const url = gtmGenUrlInput.value.trim();
    if (!url) {
      gtmGenResults.innerHTML = '<span style="font-size:13px; color:#c5221f;">Please enter a valid website URL.</span>';
      return;
    }

    gtmGenResults.innerHTML = '<span style="font-size:13px; color:#1a2e58;">Analyzing page DOM elements and recommending GTM tags...</span>';

    const resp = await fetch('/api/gtm/generate-events', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ url })
    });

    const data = await resp.json();
    if (!resp.ok) {
      gtmGenResults.innerHTML = `<span style="font-size:13px; color:#c5221f;">Error: ${esc(data.error || 'Failed to analyze page.')}</span>`;
      return;
    }

    const events = data.suggested_events || [];
    if (!events.length) {
      gtmGenResults.innerHTML = '<span style="font-size:13px; color:#69758a;">No lead forms or phone/email links detected on this page.</span>';
      return;
    }

    gtmGenResults.innerHTML = `
      <div style="background:#fff; border:1px solid #d8e0eb; border-radius:8px; padding:12px; font-size:13px;">
        <h4 style="margin:0 0 8px; color:#1a2e58;">Found ${events.length} Recommended Events for "${esc(data.url)}":</h4>
        ${events.map((ev, idx) => `
          <div style="padding:8px 0; border-bottom:1px solid #f0f4f9; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <strong>${esc(ev.tag_name)}</strong> <code>[${esc(ev.event_name)}]</code>
              <div style="color:#69758a; font-size:12px;">${esc(ev.description)}</div>
            </div>
            ${currentGtmContext.container_id ? `<button class="btn btn-deploy-gtm-tag" data-idx="${idx}" style="font-size:11px; padding:4px 8px;">Deploy to GTM</button>` : '<span style="font-size:11px; color:#8a95a7;">(Inspect GTM container above first to auto-deploy)</span>'}
          </div>
        `).join('')}
      </div>
    `;

    document.querySelectorAll('.btn-deploy-gtm-tag').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ev = events[parseInt(btn.dataset.idx)];
        btn.disabled = true;
        btn.textContent = 'Deploying…';

        const deployResp = await fetch('/api/gtm/deploy-event', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            account_id: currentGtmContext.account_id,
            container_id: currentGtmContext.container_id,
            google_login: currentGtmContext.google_login,
            event: ev
          })
        });

        if (deployResp.ok) {
          btn.textContent = '✓ Deployed!';
          btn.style.background = '#137333';
          fetchGtmLogs();
        } else {
          btn.textContent = 'Failed';
          btn.style.background = '#c5221f';
        }
      });
    });
  });
}

// Search & Display GTM Change Audit Logs
async function fetchGtmLogs(query='') {
  const listEl = document.getElementById('gtm-logs-list');
  if (!listEl) return;

  const resp = await fetch(`/api/gtm/logs/search?q=${encodeURIComponent(query)}`);
  const data = await resp.json();
  
  if (!data.logs || !data.logs.length) {
    listEl.innerHTML = '<span style="font-size:12px; color:#69758a;">No recorded GTM change logs found.</span>';
    return;
  }

  listEl.innerHTML = data.logs.map(log => {
    const dateStr = new Date(log.created_at * 1000).toLocaleString();
    return `
      <div style="padding:8px 10px; background:#fff; border:1px solid #d8e0eb; border-radius:6px; margin-bottom:6px; font-size:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <span style="background:#eaf2ff; color:#24519c; font-weight:bold; padding:2px 6px; border-radius:4px; font-size:11px;">${esc(log.action_type)}</span>
            <strong style="margin-left:6px; color:#1a2e58;">${esc(log.tag_name)}</strong>
          </div>
          <span style="color:#8a95a7; font-size:11px;">${esc(dateStr)}</span>
        </div>
        <div style="margin-top:4px; color:#58677e;">
          <b>Container:</b> <code>${esc(log.container_id)}</code> | 
          <b>User:</b> ${esc(log.google_login)}
        </div>
      </div>
    `;
  }).join('');
}

const btnSearchGtmLogs = document.getElementById('btn-search-gtm-logs');
if (btnSearchGtmLogs) {
  btnSearchGtmLogs.addEventListener('click', () => {
    fetchGtmLogs(document.getElementById('search-gtm-logs-q').value);
  });
  fetchGtmLogs();
}

// "Ask Analytics" Natural Language Query Handler
const askBtn = document.getElementById('ask-btn');
const askInput = document.getElementById('ask-q');
const askResults = document.getElementById('ask-results');

if (askBtn && askInput) {
  askBtn.addEventListener('click', async () => {
    const question = askInput.value.trim();
    const property_id = document.getElementById('comp-property-id').value.trim();
    const google_login = document.getElementById('comp-login').value.trim();

    if (!property_id || !google_login) {
      askResults.innerHTML = '<span style="font-size:13px; color:#c5221f;">Please enter a GA4 Property ID and Login email above first.</span>';
      return;
    }
    if (!question) {
      askResults.innerHTML = '<span style="font-size:13px; color:#c5221f;">Please enter a question.</span>';
      return;
    }

    askResults.innerHTML = '<span style="font-size:13px; color:#1a2e58;">Querying GA4 Data API...</span>';

    const resp = await fetch('/api/ga4/ask', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ property_id, google_login, question })
    });

    const data = await resp.json();
    if (!resp.ok) {
      askResults.innerHTML = `<span style="font-size:13px; color:#c5221f;">Error: ${esc(data.error || 'Failed to query GA4.')}</span>`;
      return;
    }

    askResults.innerHTML = `
      <div style="padding:12px; background:#fff; border:1px solid #d8e0eb; border-radius:8px; font-size:13px; color:#1a2e58; line-height:1.5;">
        ${data.answer.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')}
      </div>
    `;
  });
}

// Preset Date Calculator Handler
function applyPresetDates(presetKey) {
  const now = new Date();
  const formatDate = d => d.toISOString().split('T')[0];

  let p1Start, p1End;

  if (presetKey === 'last_month') {
    const firstThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    p1End = new Date(firstThisMonth.getTime() - 86400000);
    p1Start = new Date(p1End.getFullYear(), p1End.getMonth(), 1);
  } else if (presetKey === 'mtd') {
    p1Start = new Date(now.getFullYear(), now.getMonth(), 1);
    p1End = new Date(now.getTime() - 86400000);
  } else if (presetKey === 'last_week') {
    const dayOfWeek = now.getDay();
    p1End = new Date(now.getTime() - (dayOfWeek + 1) * 86400000);
    p1Start = new Date(p1End.getTime() - 6 * 86400000);
  } else if (presetKey === 'last_quarter') {
    const currentQuarter = Math.floor(now.getMonth() / 3);
    const lastQuarterMonth = (currentQuarter === 0 ? 3 : currentQuarter - 1) * 3;
    const year = currentQuarter === 0 ? now.getFullYear() - 1 : now.getFullYear();
    p1Start = new Date(year, lastQuarterMonth, 1);
    p1End = new Date(year, lastQuarterMonth + 3, 0);
  } else if (presetKey === 'ytd') {
    p1Start = new Date(now.getFullYear(), 0, 1);
    p1End = new Date(now.getTime() - 86400000);
  }

  if (p1Start && p1End) {
    document.getElementById('p1-start').value = formatDate(p1Start);
    document.getElementById('p1-end').value = formatDate(p1End);
  }
}

const presetSelect = document.getElementById('comp-date-preset');
if (presetSelect) {
  presetSelect.addEventListener('change', (e) => {
    applyPresetDates(e.target.value);
  });
  applyPresetDates('last_month');
}

async function search() {
  if (!q) return;
  const value = q.value.trim();
  if (!value) {
    document.getElementById('box-analytics').style.display = 'none';
    document.getElementById('box-gmb').style.display = 'none';
    document.getElementById('box-gsc').style.display = 'none';
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

// GA4 Scope Selection Handler
const scopeSelect = document.getElementById('comp-scope-type');
const pageWrapper = document.getElementById('page-path-wrapper');

if (scopeSelect) {
  scopeSelect.addEventListener('change', () => {
    if (scopeSelect.value === 'page') {
      pageWrapper.style.display = 'block';
    } else {
      pageWrapper.style.display = 'none';
    }
  });
}

// GA4 Comparison Engine Run Trigger
const runCompBtn = document.getElementById('run-ga4-comp');
if (runCompBtn) {
  runCompBtn.addEventListener('click', async () => {
    const property_id = document.getElementById('comp-property-id').value.trim();
    const google_login = document.getElementById('comp-login').value.trim();
    const period_type = document.getElementById('comp-period-type').value;
    let scope_type = document.getElementById('comp-scope-type').value;
    let page_path = document.getElementById('comp-page-path').value.trim();
    const source_medium = document.getElementById('comp-source-medium').value;
    const tone = document.getElementById('comp-tone').value;
    const p1_start = document.getElementById('p1-start').value;
    const p1_end = document.getElementById('p1-end').value;

    let limit = 15;
    if (scope_type === 'top_10') { scope_type = 'multiple'; limit = 10; }
    else if (scope_type === 'top_25') { scope_type = 'multiple'; limit = 25; }
    else if (scope_type === 'top_50') { scope_type = 'multiple'; limit = 50; }

    const resBox = document.getElementById('ai-comp-results');
    resBox.innerHTML = '<p style="font-size:13px; color:#1a2e58;">Running GA4 Data API report and compiling AI analysis…</p>';

    const resp = await fetch('/api/ga4/compare', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        property_id, google_login, period_type, scope_type,
        page_path, source_medium, tone, p1_start, p1_end, limit
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

    const formatSecs = (s) => {
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
    };

    const avgTimeP1 = m1.sessions > 0 ? formatSecs(m1.userEngagementDuration / m1.sessions) : '0s';
    const avgTimeP2 = m2.sessions > 0 ? formatSecs(m2.userEngagementDuration / m2.sessions) : '0s';

    const plainTextAnalysis = `
AI Traffic Summary: ${ai.status}
- ${ai.insights.join('\n- ').replace(/[*`]/g, '')}

${data.p1_label}
Sessions: ${m1.sessions.toLocaleString()}
Engaged Sessions: ${m1.engagedSessions.toLocaleString()}
Avg Engagement Time: ${avgTimeP1}
Total Events: ${m1.eventCount.toLocaleString()}
Key Events: ${m1.keyEvents.toLocaleString()}

${data.p2_label}
Sessions: ${m2.sessions.toLocaleString()}
Engaged Sessions: ${m2.engagedSessions.toLocaleString()}
Avg Engagement Time: ${avgTimeP2}
Total Events: ${m2.eventCount.toLocaleString()}
Key Events: ${m2.keyEvents.toLocaleString()}
    `.trim();

    resBox.innerHTML = `
      <div class="ai-box">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <h4 style="margin:0; color:#1a2e58; font-size:15px;">🤖 AI Summary (${tone === 'positive' ? '🟢 Client Wins' : '🔴 Optimization Focus'}): ${esc(ai.status)}</h4>
          <button id="btn-copy-analysis" class="btn" style="font-size:12px; padding:5px 10px; background:#137333!important;">📋 Copy Analysis</button>
        </div>
        <ul style="margin:0 0 12px; padding-left:18px; font-size:13px; color:#202124;">
          ${ai.insights.map(i => `<li>${i.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/`(.*?)`/g, '<code>$1</code>')}</li>`).join('')}
        </ul>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; background:#fff; padding:12px; border-radius:8px; border:1px solid #d8e0eb; font-size:13px;">
          <div>
            <strong style="color:#1a2e58;">${esc(data.p1_label)}</strong>
            <div>Sessions: <b>${m1.sessions.toLocaleString()}</b></div>
            <div>Engaged Sessions: <b>${m1.engagedSessions.toLocaleString()}</b></div>
            <div>Avg Engagement Time: <b>${avgTimeP1}</b></div>
            <div>Total Events: <b>${m1.eventCount.toLocaleString()}</b></div>
            <div>Key Events: <b>${m1.keyEvents.toLocaleString()}</b></div>
          </div>
          <div>
            <strong style="color:#1a2e58;">${esc(data.p2_label)}</strong>
            <div>Sessions: <b>${m2.sessions.toLocaleString()}</b></div>
            <div>Engaged Sessions: <b>${m2.engagedSessions.toLocaleString()}</b></div>
            <div>Avg Engagement Time: <b>${avgTimeP2}</b></div>
            <div>Total Events: <b>${m2.eventCount.toLocaleString()}</b></div>
            <div>Key Events: <b>${m2.keyEvents.toLocaleString()}</b></div>
          </div>
        </div>

        ${breakdown.length ? `
          <div style="margin-top:14px; background:#fff; padding:12px; border-radius:8px; border:1px solid #d8e0eb; overflow-x:auto;">
            <h5 style="margin:0 0 8px; font-size:13px; color:#1a2e58;">Detailed Performance Breakdown (${breakdown.length} items)</h5>
            <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left; min-width:600px;">
              <thead>
                <tr style="border-bottom:2px solid #e1e7ef; color:#58677e;">
                  <th style="padding:6px;">Item / Channel</th>
                  <th style="padding:6px; text-align:right;">Sessions (P1 / P2)</th>
                  <th style="padding:6px; text-align:right;">Engaged Sessions</th>
                  <th style="padding:6px; text-align:right;">Avg Time on Site</th>
                  <th style="padding:6px; text-align:right;">Total Events</th>
                  <th style="padding:6px; text-align:right;">Key Events</th>
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
                      <td style="padding:6px; text-align:right;"><b>${b.p1_sessions.toLocaleString()}</b> <span style="color:#8a95a7;">/ ${b.p2_sessions.toLocaleString()}</span> <span style="font-weight:bold; color:${diffColor};">(${diffSign}${diff.toLocaleString()})</span></td>
                      <td style="padding:6px; text-align:right;"><b>${b.p1_engaged.toLocaleString()}</b> <span style="color:#8a95a7;">/ ${b.p2_engaged.toLocaleString()}</span></td>
                      <td style="padding:6px; text-align:right;"><b>${b.p1_avg_time_str}</b> <span style="color:#8a95a7;">/ ${b.p2_avg_time_str}</span></td>
                      <td style="padding:6px; text-align:right;"><b>${b.p1_events.toLocaleString()}</b> <span style="color:#8a95a7;">/ ${b.p2_events.toLocaleString()}</span></td>
                      <td style="padding:6px; text-align:right;"><b>${b.p1_convs.toLocaleString()}</b> <span style="color:#8a95a7;">/ ${b.p2_convs.toLocaleString()}</span></td>
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

    document.getElementById('btn-copy-analysis').addEventListener('click', () => {
      navigator.clipboard.writeText(plainTextAnalysis);
      const copyBtn = document.getElementById('btn-copy-analysis');
      copyBtn.textContent = '✓ Copied!';
      setTimeout(() => { copyBtn.textContent = '📋 Copy Analysis'; }, 2000);
    });

    document.getElementById('btn-open-save-modal').addEventListener('click', () => {
      document.getElementById('save-modal').style.display = 'flex';
    });
  });
}

// Save Report Modal Controls
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

// Saved Reports Search
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

// Manual GMB Checker
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
// Automatically trigger background refresh on page load
window.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status');
  if (statusEl) {
    statusEl.textContent = 'Auto-refreshing Google accounts in background...';
  }
  
  try {
    const r = await fetch('/api/refresh', { method: 'POST' });
    const data = await r.json();
    if (statusEl) {
      statusEl.textContent = `Google accounts refreshed (${data.count || 0} assets indexed). Start typing to search...`;
    }
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = 'Start typing to search all connected accounts.';
    }
  }
});
