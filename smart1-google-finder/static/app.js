const q = document.getElementById('q');
const results = document.getElementById('results');
const statusEl = document.getElementById('status');
let platform = 'all';
let timer;

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
      ${x.open_url ? `<a class="open" target="_blank" rel="noopener" href="${esc(x.open_url)}">Open</a>` : ''}
    </article>
  `).join('');
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
      <p class="manual-tip">
        <em>Tip: Click "Search Maps" to view the listing and check if an "Own this business?" or "Claim this business" link is visible.</em>
      </p>
    `;
  });

  manualInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      manualBtn.click();
    }
  });
}
