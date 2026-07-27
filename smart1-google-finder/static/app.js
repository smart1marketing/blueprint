const q = document.getElementById('q');
const results = document.getElementById('results');
const statusEl = document.getElementById('status');
let platform = 'all';
let timer;

function esc(v='') {
  return v.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function draw(items) {
  if (!items.length) {
    results.innerHTML = '<div class="empty">No matches found.</div>';
    return;
  }
  results.innerHTML = items.map(x => `
    <article class="result">
      <div class="badge ${x.platform.includes('Tag') ? 'gtm' : 'ga'}">${esc(x.platform)}</div>
      <div class="main">
        <h3>${esc(x.name || '(unnamed)')}</h3>
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
    statusEl.textContent = 'Start typing to search.';
    return;
  }
  statusEl.textContent = 'Searching…';
  const r = await fetch(`/api/search?q=${encodeURIComponent(value)}&platform=${encodeURIComponent(platform)}`);
  if (r.redirected) { window.location = r.url; return; }
  const data = await r.json();
  statusEl.textContent = `${data.length} match${data.length === 1 ? '' : 'es'}`;
  draw(data);
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
