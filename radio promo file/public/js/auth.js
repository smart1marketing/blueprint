/* Every studio page calls ensureAuth() before it renders anything. The
   reviewer page is the one exception — its link carries its own token. */

export const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({ ok: false, error: 'The server sent back something unreadable.' }));
  if (!data.ok) {
    const err = new Error(data.error || `Request failed (${res.status}).`);
    err.needsLogin = data.needsLogin;
    err.expired = data.expired;
    throw err;
  }
  return data;
}

function loginScreen(mount, message) {
  mount.innerHTML = `
    <div class="panel" style="max-width:420px;margin:60px auto">
      <div class="eyebrow">Studio access</div>
      <h2>Sign in</h2>
      <p class="muted small">${esc(message || 'This studio spends real API credits, so it stays behind a password. Ask your Smart 1 admin if you need it.')}</p>
      <form id="loginForm">
        <label class="field"><span class="lbl">Your name</span><input type="text" name="who" placeholder="Sara" autocomplete="name"></label>
        <label class="field"><span class="lbl">Studio password</span><input type="password" name="password" autocomplete="current-password" required autofocus></label>
        <div id="loginError"></div>
        <div class="actions"><button class="btn" type="submit" style="width:100%">Sign in</button></div>
      </form>
    </div>`;

  return new Promise((resolve) => {
    mount.querySelector('#loginForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const body = Object.fromEntries(new FormData(ev.target).entries());
      const errBox = mount.querySelector('#loginError');
      errBox.innerHTML = '';
      try {
        const { session } = await api('/auth/login', { method: 'POST', body });
        resolve(session);
      } catch (err) {
        errBox.innerHTML = `<div class="notice bad">${esc(err.message)}</div>`;
      }
    });
  });
}

/** Resolves once there's a valid session. Renders a sign-in form if not. */
export async function ensureAuth(mount) {
  try {
    const { session } = await api('/auth/me');
    return session;
  } catch (err) {
    if (!err.needsLogin) throw err;
    return loginScreen(mount);
  }
}

export async function signOut() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  location.reload();
}

/**
 * Small green/red badge in the header that links to the full diagnostics
 * page. Answers "is anything broken?" without leaving whatever you're doing.
 */
export async function mountStatus(selector = '#s1status') {
  const el = document.querySelector(selector);
  if (!el) return;
  el.className = 'statusdot checking';
  el.innerHTML = '<i></i><span>Checking…</span>';
  try {
    const res = await fetch('/api/status', { credentials: 'same-origin' });
    const data = await res.json();
    const st = data.status;
    el.className = `statusdot ${st.ok ? 'up' : 'down'}`;
    el.innerHTML = `<i></i><span>${esc(st.label)}</span>`;
    el.title = `${st.passing} of ${st.total} checks passing · click for detail`;
  } catch {
    el.className = 'statusdot down';
    el.innerHTML = '<i></i><span>Status unavailable</span>';
  }
}
