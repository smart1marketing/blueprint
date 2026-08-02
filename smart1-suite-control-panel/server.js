/**
 * Smart 1 Suite — Control Panel
 * ------------------------------------------------------------------
 * A small Express backend that lets your team create, look up, and
 * delete GoHighLevel (LeadConnector) sub-accounts through a simple UI.
 *
 * SECURITY MODEL
 * The GHL Private Integration token is an agency-wide master key. It is
 * read from an environment variable and used ONLY on the server. It is
 * never sent to the browser. The browser talks to this server; this
 * server talks to GHL. A shared password gates access to the panel.
 * ------------------------------------------------------------------
 */

const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
// Render sits behind a reverse proxy — trust its X-Forwarded-* headers so
// req.ip / req.secure reflect the real client rather than the proxy hop.
app.set('trust proxy', 1);

// ---------- Configuration (from environment) ----------
const {
  GHL_PRIVATE_TOKEN,          // Private Integration token (Bearer)
  GHL_COMPANY_ID,             // Your agency company/location group id
  PANEL_PASSWORD,             // Shared password to unlock the panel
  SESSION_SECRET,             // Random string used to sign the auth cookie
  BRANDFETCH_API_KEY,         // Optional: Brandfetch Brand API key
  GHL_API_VERSION = '2021-07-28',
  PORT = 3000,
} = process.env;

const GHL_BASE = 'https://services.leadconnectorhq.com';
const BRANDFETCH_BASE = 'https://api.brandfetch.io/v2';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const COOKIE_NAME = 's1_auth';

// Fail loudly at boot if the essentials are missing.
const missing = [];
if (!GHL_PRIVATE_TOKEN) missing.push('GHL_PRIVATE_TOKEN');
if (!GHL_COMPANY_ID) missing.push('GHL_COMPANY_ID');
if (!PANEL_PASSWORD) missing.push('PANEL_PASSWORD');
if (missing.length) {
  console.warn(
    `[startup] WARNING — missing env vars: ${missing.join(', ')}. ` +
    `The panel will start but API calls will fail until these are set.`
  );
}
// If no session secret is provided, derive an ephemeral one. (Sessions
// reset on redeploy, which is acceptable — users just log in again.)
const SECRET = SESSION_SECRET || crypto.randomBytes(32).toString('hex');

app.use(express.json());
app.use(cookieParser());

// ---------- Auth helpers ----------
// The session cookie carries who's logged in (a free-text name entered at
// login) so create/delete actions can be attributed in the audit log —
// without standing up real per-user accounts.
function b64url(str) { return Buffer.from(str, 'utf8').toString('base64url'); }

function signSession(name) {
  const payload = JSON.stringify({ t: Date.now(), n: String(name || 'Unknown').slice(0, 60) });
  const encoded = b64url(payload);
  const sig = crypto.createHmac('sha256', SECRET).update(encoded).digest('hex');
  return `${encoded}.${sig}`;
}

// Returns { name } if valid, or null.
function verifySession(token) {
  if (!token || typeof token !== 'string') return null;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(encoded).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let data;
  try { data = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch { return null; }
  if (!data || !Number.isFinite(data.t)) return null;
  if (Date.now() - data.t >= SESSION_TTL_MS) return null;
  return { name: data.n || 'Unknown' };
}

function requireAuth(req, res, next) {
  const session = verifySession(req.cookies[COOKIE_NAME]);
  if (session) { req.actor = session.name; return next(); }
  return res.status(401).json({ error: 'Not authenticated. Please log in.' });
}

// ---------- Login throttling ----------
// A shared password with unlimited guesses is brute-forceable if the URL
// ever leaks. Track failures per IP, in memory — fine for a single-instance
// internal tool; resets on restart, which only ever loosens the limit.
const LOGIN_MAX_ATTEMPTS = 6;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;   // count failures within this window
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;  // then lock out for this long
const loginAttempts = new Map(); // ip -> { count, firstAttempt, lockedUntil }

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function loginThrottleCheck(ip) {
  const rec = loginAttempts.get(ip);
  if (rec?.lockedUntil && Date.now() < rec.lockedUntil) {
    return { blocked: true, retryAfterSec: Math.ceil((rec.lockedUntil - Date.now()) / 1000) };
  }
  return { blocked: false };
}

function loginThrottleFail(ip) {
  const now = Date.now();
  let rec = loginAttempts.get(ip);
  if (!rec || now - rec.firstAttempt > LOGIN_WINDOW_MS) rec = { count: 0, firstAttempt: now };
  rec.count += 1;
  if (rec.count >= LOGIN_MAX_ATTEMPTS) rec.lockedUntil = now + LOGIN_LOCKOUT_MS;
  loginAttempts.set(ip, rec);
  if (loginAttempts.size > 5000) loginAttempts.clear(); // defensive cap, should never hit
}

function loginThrottleReset(ip) {
  loginAttempts.delete(ip);
}

// ---------- Audit log ----------
// Append-only JSONL file recording who created/deleted accounts and login
// activity. NOTE: on Render's default (non-disk) plan, local files are
// ephemeral and are lost on redeploy/restart. Set AUDIT_LOG_PATH to a
// mounted persistent disk if you add one; otherwise treat this as
// best-effort recent history, not a permanent record.
const AUDIT_LOG_PATH = process.env.AUDIT_LOG_PATH || path.join(__dirname, 'data', 'audit.log.jsonl');
try { fs.mkdirSync(path.dirname(AUDIT_LOG_PATH), { recursive: true }); } catch { /* best effort */ }

function logAudit(entry) {
  try {
    fs.appendFileSync(AUDIT_LOG_PATH, JSON.stringify({ time: new Date().toISOString(), ...entry }) + '\n');
  } catch (err) {
    console.warn('[audit] failed to write log entry:', err.message);
  }
}

function readAudit(limit = 300) {
  try {
    if (!fs.existsSync(AUDIT_LOG_PATH)) return [];
    const lines = fs.readFileSync(AUDIT_LOG_PATH, 'utf8').split('\n').filter(Boolean);
    return lines.slice(-limit).map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean).reverse();
  } catch {
    return [];
  }
}

// ---------- Idempotency (prevents double-submit from double-creating) ----------
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;
const idempotencyCache = new Map(); // key -> { status, body, expiresAt }

function idempotencyGet(key) {
  if (!key) return null;
  const rec = idempotencyCache.get(key);
  if (!rec) return null;
  if (Date.now() > rec.expiresAt) { idempotencyCache.delete(key); return null; }
  return rec;
}
function idempotencySet(key, status, body) {
  if (!key) return;
  idempotencyCache.set(key, { status, body, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });
  if (idempotencyCache.size > 2000) idempotencyCache.delete(idempotencyCache.keys().next().value);
}

// ---------- GHL request helper ----------
async function ghl(pathname, { method = 'GET', body, query } = {}) {
  const url = new URL(GHL_BASE + pathname);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${GHL_PRIVATE_TOKEN}`,
      Version: GHL_API_VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  if (!res.ok) {
    const message =
      data?.message ||
      (Array.isArray(data?.message) ? data.message.join(', ') : null) ||
      data?.error ||
      `GHL API error (HTTP ${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

function sendError(res, err) {
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 502;
  res.status(status).json({ error: err.message || 'Upstream error', details: err.details });
}

// Download an image by URL and upload it into a sub-account's media library,
// returning a GHL-hosted URL. Throws on failure so the caller can fall back.
async function uploadLogoToMedia(locationId, imageUrl, name) {
  // 1. Download the source image (with a timeout and size cap).
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  let bytes, contentType;
  try {
    const imgRes = await fetch(imageUrl, { signal: ctrl.signal });
    if (!imgRes.ok) throw new Error(`download failed (HTTP ${imgRes.status})`);
    contentType = (imgRes.headers.get('content-type') || 'image/png').split(';')[0].trim();
    const buf = Buffer.from(await imgRes.arrayBuffer());
    if (!buf.length) throw new Error('empty image');
    if (buf.length > 5 * 1024 * 1024) throw new Error('image larger than 5MB');
    bytes = buf;
  } finally {
    clearTimeout(timer);
  }

  const extMap = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
    'image/svg+xml': 'svg', 'image/webp': 'webp', 'image/gif': 'gif',
  };
  const ext = extMap[contentType] || 'png';

  // 2. Upload into the new sub-account's media library.
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: contentType }), `logo.${ext}`);
  form.append('hosted', 'false');
  form.append('name', `${name || 'Account'} logo`);

  const url = new URL(`${GHL_BASE}/medias/upload-file`);
  url.searchParams.set('altId', locationId);
  url.searchParams.set('altType', 'location');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GHL_PRIVATE_TOKEN}`,
      Version: GHL_API_VERSION,
      Accept: 'application/json',
      // NOTE: do not set Content-Type — fetch adds the multipart boundary.
    },
    body: form,
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!res.ok) {
    const err = new Error(data?.message || `media upload failed (HTTP ${res.status})`);
    err.status = res.status; err.details = data; throw err;
  }
  return data.url || data.fileUrl || data.link || data.location || null;
}

// ================= Auth routes =================
app.post('/api/login', (req, res) => {
  const ip = clientIp(req);
  const throttle = loginThrottleCheck(ip);
  if (throttle.blocked) {
    return res.status(429).json({
      error: `Too many attempts. Try again in ${Math.ceil(throttle.retryAfterSec / 60)} minute(s).`,
    });
  }

  const { password, name } = req.body || {};
  if (!PANEL_PASSWORD) {
    return res.status(500).json({ error: 'PANEL_PASSWORD is not configured on the server.' });
  }
  const ok =
    typeof password === 'string' &&
    password.length === PANEL_PASSWORD.length &&
    crypto.timingSafeEqual(Buffer.from(password), Buffer.from(PANEL_PASSWORD));

  if (!ok) {
    loginThrottleFail(ip);
    logAudit({ type: 'login_failed', ip });
    return res.status(401).json({ error: 'Incorrect password.' });
  }
  loginThrottleReset(ip);

  const actorName = String(name || '').trim().slice(0, 60) || 'Unknown';
  res.cookie(COOKIE_NAME, signSession(actorName), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS,
  });
  logAudit({ type: 'login_success', actor: actorName, ip });
  res.json({ ok: true, name: actorName });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
  const session = verifySession(req.cookies[COOKIE_NAME]);
  res.json({ authenticated: !!session, name: session?.name || null });
});

// ================= GHL proxy routes (all require auth) =================

// List snapshots for the snapshot picker
app.get('/api/snapshots', requireAuth, async (req, res) => {
  try {
    const data = await ghl('/snapshots/', { query: { companyId: GHL_COMPANY_ID } });
    const snapshots = (data.snapshots || data.data || []).map((s) => ({
      id: s.id || s._id,
      name: s.name,
    }));
    res.json({ snapshots });
  } catch (err) {
    sendError(res, err);
  }
});

// Brandfetch — look up brand info by domain to pre-fill the create form.
app.get('/api/brand', requireAuth, async (req, res) => {
  if (!BRANDFETCH_API_KEY) {
    return res.status(400).json({ error: 'Brandfetch is not configured. Set BRANDFETCH_API_KEY to enable brand lookup.' });
  }
  // Accept a full URL or a bare domain; normalize to just the hostname.
  let domain = String(req.query.domain || '').trim().toLowerCase();
  if (!domain) return res.status(400).json({ error: 'A domain is required.' });
  domain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('?')[0];
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    return res.status(400).json({ error: 'That does not look like a valid domain (e.g. acme.com).' });
  }

  try {
    const r = await fetch(`${BRANDFETCH_BASE}/brands/${encodeURIComponent(domain)}`, {
      headers: { Authorization: `Bearer ${BRANDFETCH_API_KEY}`, Accept: 'application/json' },
    });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }

    if (r.status === 404) return res.status(404).json({ error: `No brand data found for ${domain}.` });
    if (r.status === 429) return res.status(429).json({ error: 'Brandfetch quota exceeded. Try again later.' });
    if (!r.ok) return res.status(502).json({ error: data?.message || `Brandfetch error (HTTP ${r.status})` });

    // Pick the best logo/icon: prefer a light-theme raster, fall back to anything.
    const pickImage = (type) => {
      const items = (data.logos || []).filter((l) => l.type === type);
      const ordered = items.sort((a) => (a.theme === 'light' ? -1 : 1));
      for (const it of ordered) {
        const fmts = (it.formats || []).slice().sort((a, b) => {
          const rank = (f) => (f.format === 'png' ? 0 : f.format === 'svg' ? 1 : 2);
          return rank(a) - rank(b);
        });
        if (fmts[0]?.src) return fmts[0].src;
      }
      return null;
    };

    // Map Brandfetch social names to GHL's social object keys.
    const linkMap = { facebook: 'facebookUrl', twitter: 'twitter', linkedin: 'linkedIn', instagram: 'instagram', youtube: 'youtube', pinterest: 'pinterest' };
    const social = {};
    for (const link of data.links || []) {
      const key = linkMap[(link.name || '').toLowerCase()];
      if (key && link.url) social[key] = link.url;
    }

    const loc = data.company?.location || {};
    res.json({
      name: data.name || null,
      domain: data.domain || domain,
      description: data.description || null,
      logo: pickImage('logo') || pickImage('icon'),
      icon: pickImage('icon'),
      colors: (data.colors || []).map((c) => ({ hex: c.hex, type: c.type })).filter((c) => c.hex),
      social,
      location: {
        city: loc.city || '',
        state: loc.state || '',
        country: loc.countryCode || '',   // GHL wants ISO-2
        countryName: loc.country || '',
      },
      website: `https://${data.domain || domain}`,
    });
  } catch (err) {
    res.status(502).json({ error: 'Could not reach Brandfetch: ' + err.message });
  }
});

// Search / list sub-accounts
app.get('/api/locations', requireAuth, async (req, res) => {
  try {
    const { search = '', email = '', limit = '100', skip = '0' } = req.query;
    const data = await ghl('/locations/search', {
      query: {
        companyId: GHL_COMPANY_ID,
        limit,
        skip,
        order: 'asc',
        query: search || undefined,
        email: email || undefined,
      },
    });
    res.json({
      locations: data.locations || [],
      count: data.count ?? (data.locations ? data.locations.length : 0),
    });
  } catch (err) {
    sendError(res, err);
  }
});

// Get a single sub-account
app.get('/api/locations/:id', requireAuth, async (req, res) => {
  try {
    const data = await ghl(`/locations/${encodeURIComponent(req.params.id)}`);
    res.json(data.location || data);
  } catch (err) {
    sendError(res, err);
  }
});

// Create a sub-account (optionally + a login user)
app.post('/api/locations', requireAuth, async (req, res) => {
  const b = req.body || {};
  const idKey = typeof b.idempotencyKey === 'string' ? b.idempotencyKey.slice(0, 100) : null;

  // Replay a prior result for this exact submission instead of creating a
  // second account — covers double-clicks and client retries after a
  // request that actually succeeded but the response never arrived.
  const cached = idempotencyGet(idKey);
  if (cached) return res.status(cached.status).json(cached.body);

  try {
    if (!b.name || !b.name.trim()) {
      return res.status(400).json({ error: 'Account name is required.' });
    }
    const trimmedName = b.name.trim();

    // Duplicate check — skipped if the user already confirmed "create anyway".
    if (!b.confirmDuplicate) {
      try {
        const dupData = await ghl('/locations/search', {
          query: { companyId: GHL_COMPANY_ID, limit: '5', query: trimmedName },
        });
        const matches = (dupData.locations || []).filter(
          (loc) => String(loc.name || '').trim().toLowerCase() === trimmedName.toLowerCase()
        );
        if (matches.length) {
          // Not cached under idKey — nothing was created, so a genuine
          // retry (or a "create anyway" resubmit) should run for real.
          return res.status(409).json({
            error: 'duplicate',
            message: `An account named "${trimmedName}" already exists.`,
            duplicates: matches.map((m) => ({ id: m.id || m._id, name: m.name })),
          });
        }
      } catch (dupErr) {
        // Don't let a flaky duplicate check block real account creation.
        console.warn('[create] duplicate check failed, proceeding without it:', dupErr.message);
      }
    }

    // Build the create-location payload, omitting empty optional fields.
    const payload = { name: trimmedName, companyId: GHL_COMPANY_ID };
    const optional = ['phone', 'address', 'city', 'state', 'country', 'postalCode', 'website', 'timezone', 'snapshotId'];
    for (const k of optional) if (b[k]) payload[k] = b[k];

    const prospect = {};
    if (b.prospectFirstName) prospect.firstName = b.prospectFirstName;
    if (b.prospectLastName) prospect.lastName = b.prospectLastName;
    if (b.prospectEmail) prospect.email = b.prospectEmail;
    if (Object.keys(prospect).length) payload.prospectInfo = prospect;

    // Social links (e.g. pre-filled from Brandfetch). Only keep known keys.
    if (b.social && typeof b.social === 'object') {
      const allowed = ['facebookUrl', 'twitter', 'linkedIn', 'instagram', 'youtube', 'pinterest', 'blogRss'];
      const social = {};
      for (const k of allowed) if (b.social[k]) social[k] = b.social[k];
      if (Object.keys(social).length) payload.social = social;
    }

    const location = await ghl('/locations/', { method: 'POST', body: payload });
    const newId = location.id || location._id || location.location?.id;

    const result = { location, locationId: newId };

    // Optional: set the business logo (e.g. from Brandfetch) via a follow-up
    // update, since the create endpoint doesn't accept a logo. We first try to
    // host the image inside GHL's media library so it always renders; if that
    // fails, we fall back to pointing the account at the source URL directly.
    if (b.logoUrl && newId) {
      let logoToSet = null;
      let hosted = false;
      try {
        const hostedUrl = await uploadLogoToMedia(newId, b.logoUrl, payload.name);
        if (hostedUrl) { logoToSet = hostedUrl; hosted = true; }
      } catch (upErr) {
        result.logoUploadWarning = `Couldn't host the logo in GHL media (${upErr.message}); used the source URL instead.`;
      }
      if (!logoToSet) logoToSet = b.logoUrl; // fallback: external URL

      try {
        await ghl(`/locations/${encodeURIComponent(newId)}`, {
          method: 'PUT',
          body: { companyId: GHL_COMPANY_ID, name: payload.name, logoUrl: logoToSet },
        });
        result.logoSet = true;
        result.logoHosted = hosted;
      } catch (logoErr) {
        result.logoWarning = `Account created, but setting the logo failed: ${logoErr.message}`;
      }
    }

    // Optional: create a login user for the new sub-account.
    if (b.createUser && newId) {
      if (!b.userEmail || !b.userFirstName) {
        result.userWarning = 'Account created, but user was skipped: user first name and email are required.';
      } else {
        try {
          const userPayload = {
            companyId: GHL_COMPANY_ID,
            firstName: b.userFirstName,
            lastName: b.userLastName || '',
            email: b.userEmail,
            type: 'account',
            role: b.userRole === 'user' ? 'user' : 'admin',
            locationIds: [newId],
            permissions: {
              campaignsEnabled: true, contactsEnabled: true, workflowsEnabled: true,
              opportunitiesEnabled: true, dashboardStatsEnabled: true, appointmentsEnabled: true,
              conversationsEnabled: true, settingsEnabled: true,
            },
          };
          if (b.userPassword) userPayload.password = b.userPassword;
          if (b.userPhone) userPayload.phone = b.userPhone;
          const user = await ghl('/users/', { method: 'POST', body: userPayload });
          result.user = user;
        } catch (userErr) {
          // Don't fail the whole request — the account was created.
          result.userWarning = `Account created, but creating the login user failed: ${userErr.message}`;
        }
      }
    }

    idempotencySet(idKey, 201, result);
    logAudit({ type: 'account_created', actor: req.actor, name: trimmedName, locationId: newId });
    res.status(201).json(result);
  } catch (err) {
    sendError(res, err);
  }
});

// Delete a sub-account
app.delete('/api/locations/:id', requireAuth, async (req, res) => {
  try {
    const deleteTwilio = String(req.query.deleteTwilioAccount) === 'true';
    const targetName = typeof req.query.name === 'string' ? req.query.name.slice(0, 200) : '';
    const data = await ghl(`/locations/${encodeURIComponent(req.params.id)}`, {
      method: 'DELETE',
      query: { deleteTwilioAccount: deleteTwilio },
    });
    logAudit({ type: 'account_deleted', actor: req.actor, name: targetName, locationId: req.params.id });
    res.json({ ok: true, result: data });
  } catch (err) {
    sendError(res, err);
  }
});

// Recent activity (create/delete/login events)
app.get('/api/audit', requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 300, 1000);
  res.json({ entries: readAudit(limit) });
});

// Diagnostics — live-checks that GHL and Brandfetch are reachable and
// correctly scoped, without requiring anyone to dig through Render logs.
app.get('/api/diagnostics', requireAuth, async (req, res) => {
  const checks = [];

  if (!PANEL_PASSWORD) {
    checks.push({ name: 'Panel password', status: 'error', message: 'PANEL_PASSWORD is not set.' });
  } else if (PANEL_PASSWORD === 'change-me-to-something-strong') {
    checks.push({ name: 'Panel password', status: 'warn', message: 'Still set to the example placeholder from .env.example — change it to something unique.' });
  } else {
    checks.push({ name: 'Panel password', status: 'ok', message: 'Configured.' });
  }

  checks.push(SESSION_SECRET
    ? { name: 'Session secret', status: 'ok', message: 'Configured — logins survive restarts.' }
    : { name: 'Session secret', status: 'warn', message: 'Not set — a random one was generated at boot, so everyone is logged out on every restart or redeploy.' });

  if (!GHL_PRIVATE_TOKEN || !GHL_COMPANY_ID) {
    checks.push({ name: 'GoHighLevel API', status: 'error', message: 'GHL_PRIVATE_TOKEN and/or GHL_COMPANY_ID is not set.' });
    checks.push({ name: 'Snapshots scope', status: 'skipped', message: 'Skipped — GHL is not configured.' });
  } else {
    try {
      await ghl('/locations/search', { query: { companyId: GHL_COMPANY_ID, limit: '1' } });
      checks.push({ name: 'GoHighLevel API', status: 'ok', message: 'Token is valid and can read sub-accounts.' });
    } catch (err) {
      checks.push({ name: 'GoHighLevel API', status: 'error', message: `Token check failed: ${err.message}` });
    }
    try {
      await ghl('/snapshots/', { query: { companyId: GHL_COMPANY_ID } });
      checks.push({ name: 'Snapshots scope', status: 'ok', message: 'Snapshot picker will work.' });
    } catch (err) {
      checks.push({ name: 'Snapshots scope', status: 'warn', message: `Snapshot lookup failed (${err.message}). The picker will stay empty — check the "View Snapshots" scope on your token.` });
    }
  }

  if (!BRANDFETCH_API_KEY) {
    checks.push({ name: 'Brandfetch API', status: 'skipped', message: 'Not configured — "Fetch brand info" is disabled. This is optional.' });
  } else {
    try {
      const r = await fetch(`${BRANDFETCH_BASE}/brands/brandfetch.com`, {
        headers: { Authorization: `Bearer ${BRANDFETCH_API_KEY}`, Accept: 'application/json' },
      });
      if (r.ok) checks.push({ name: 'Brandfetch API', status: 'ok', message: 'Key is valid.' });
      else if (r.status === 429) checks.push({ name: 'Brandfetch API', status: 'warn', message: 'Key is valid, but the quota is exhausted right now.' });
      else checks.push({ name: 'Brandfetch API', status: 'error', message: `Key check failed (HTTP ${r.status}).` });
    } catch (err) {
      checks.push({ name: 'Brandfetch API', status: 'error', message: `Could not reach Brandfetch: ${err.message}` });
    }
  }

  checks.push({
    name: 'Media upload scope',
    status: 'info',
    message: 'Not live-tested (would require uploading a test file). Needs the "Edit Medias" scope for logos to host inside GHL — otherwise falls back to linking the source image.',
  });

  res.json({ checks, checkedAt: new Date().toISOString() });
});

// ---------- Static frontend + health ----------
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Smart 1 Suite Control Panel listening on port ${PORT}`);
});
