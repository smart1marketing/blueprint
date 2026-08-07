import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config.js';
import { log } from './store.js';

let configured = false;
function ready() {
  if (!config.cloudinary.cloudName || !config.cloudinary.apiKey || !config.cloudinary.apiSecret) {
    throw new Error('Cloudinary is not set up. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.');
  }
  if (!configured) {
    cloudinary.config({
      cloud_name: config.cloudinary.cloudName,
      api_key: config.cloudinary.apiKey,
      api_secret: config.cloudinary.apiSecret,
      secure: true
    });
    configured = true;
  }
  return cloudinary;
}

export const slug = (s = '') =>
  String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'untitled';

/** clients/<client-name>/<project-name>-<YYYY-MM-DD> */
export function folderFor(customer, createdAt = new Date()) {
  const date = new Date(createdAt).toISOString().slice(0, 10);
  const client = slug(customer.company || customer.customerName);
  const project = slug(customer.projectName);
  return `${config.cloudinary.rootFolder}/${client}/${project}-${date}`;
}

export async function uploadBuffer(buffer, { folder, publicId, resourceType = 'auto', context = {}, tags = [] }) {
  const cl = ready();
  return new Promise((resolve, reject) => {
    const stream = cl.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: resourceType,
        overwrite: true,
        context,
        tags: ['smart1-radio-studio', ...tags]
      },
      (err, result) => (err ? reject(new Error(`Cloudinary upload failed: ${err.message}`)) : resolve(result))
    );
    stream.end(buffer);
  });
}

export async function uploadRemote(url, opts) {
  const cl = ready();
  try {
    return await cl.uploader.upload(url, {
      folder: opts.folder,
      public_id: opts.publicId,
      resource_type: opts.resourceType || 'image',
      overwrite: true,
      tags: ['smart1-radio-studio', ...(opts.tags || [])]
    });
  } catch (err) {
    log.warn('cloudinary.uploadRemote', `${url}: ${err.message}`);
    return null;
  }
}

/* ---------- companion banner composition ---------- */

const b64url = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
// The SDK escapes overlay text itself — pre-encoding here double-encodes it.
const textSafe = (s = '') => String(s).replace(/[\r\n]+/g, ' ').trim().slice(0, 90);

/** Relative luminance, so text is never placed light-on-light. */
function readableOn(hex) {
  const h = String(hex || '').replace('#', '').slice(0, 6);
  if (h.length !== 6) return 'white';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.5 ? 'rgb:0B1220' : 'white';
}

/** Strip a URL down to what a listener should read on a small banner. */
export function displayUrl(raw = '') {
  const clean = String(raw).trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '');
  return clean.length > 36 ? `${clean.slice(0, 34)}…` : clean;
}

/**
 * Fixed layout, top to bottom: logo, call to action, landing URL.
 *
 *  - the artwork is darkened hard so white type is always legible on it
 *  - the logo sits on a white plate, so a dark or transparent logo still
 *    reads, and it is sized as large as the composition allows
 *  - the URL sits in a full-width bar in the brand accent, with its text
 *    colour chosen from that accent's luminance rather than assumed
 */
export function bannerUrl(artPublicId, {
  width, height, logoUrl, logoPublicId, cta, offer, headline, landingUrl, accent = 'FFB020'
}) {
  const cl = ready();
  const scale = width / 300;
  const px = (n) => Math.max(8, Math.round(n * scale));
  const accentHex = String(accent).replace('#', '').slice(0, 6) || 'FFB020';
  const onAccent = readableOn(accentHex);
  const middle = cta || headline || '';
  const url = displayUrl(landingUrl);

  const transformation = [
    { width, height, crop: 'fill', gravity: 'auto' },
    // Heavy scrim: guarantees contrast for white type over any artwork.
    { effect: 'brightness:-34' },
    { effect: 'colorize:42', color: '#0B1220' }
  ];

  // 1. LOGO — top, on a white plate, as large as good taste allows.
  const logoLayer = logoPublicId
    ? String(logoPublicId).replace(/\//g, ':')
    : logoUrl ? `fetch:${b64url(logoUrl)}` : null;

  if (logoLayer) {
    transformation.push({
      overlay: logoLayer,
      width: px(168), height: px(62),
      crop: 'pad', background: 'white',
      radius: px(8),
      gravity: 'north', y: px(16)
    });
  }

  // 2. CALL TO ACTION — centred, the largest type on the banner.
  if (middle) {
    transformation.push({
      overlay: { font_family: 'Montserrat', font_size: px(27), font_weight: 'bold', text: textSafe(middle) },
      color: 'white',
      gravity: 'center', y: px(4),
      width: px(258), crop: 'fit'
    });
  }

  // 3. Supporting line under the CTA, in the brand accent.
  if (offer) {
    transformation.push({
      overlay: { font_family: 'Montserrat', font_size: px(14), font_weight: 'bold', text: textSafe(offer) },
      color: `rgb:${accentHex}`,
      gravity: 'center', y: px(38),
      width: px(258), crop: 'fit'
    });
  }

  // 4. LANDING URL — bottom bar, accent background, contrast-checked text.
  if (url) {
    transformation.push({
      overlay: { font_family: 'Montserrat', font_size: px(15), font_weight: 'bold', text: textSafe(url) },
      color: onAccent,
      background: `rgb:${accentHex}`,
      gravity: 'south', y: px(14),
      crop: 'fit'
    });
  }

  transformation.push({ quality: 'auto', fetch_format: 'auto' });
  return cl.url(artPublicId, { transformation, secure: true });
}

/** Licensed music beds the agency has uploaded to their bed folder. */
/**
 * Cloudinary only builds a derived image when it is first requested, so a
 * bad transformation shows up as a broken <img>, not an upload error. Ask
 * for it once here and read the reason out of the response header.
 */
export async function verifyDerived(url) {
  try {
    const res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } });
    if (res.ok || res.status === 206) return { ok: true };
    const reason = res.headers.get('x-cld-error') || `HTTP ${res.status}`;
    return { ok: false, reason };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

export async function listBeds() {
  const cl = ready();
  const res = await cl.api.resources({
    resource_type: 'video',
    type: 'upload',
    prefix: config.cloudinary.bedFolder,
    max_results: 100,
    tags: true,
    context: true
  });
  return (res.resources || [])
    .map((r) => ({
      publicId: r.public_id,
      url: r.secure_url,
      name: r.context?.custom?.name || r.public_id.split('/').pop().replace(/[-_]/g, ' '),
      seconds: r.duration || null,
      source: (r.tags || []).includes('generated-bed') ? 'generated'
        : (r.tags || []).includes('uploaded-bed') ? 'uploaded' : 'library',
      prompt: r.context?.custom?.prompt || null,
      createdAt: r.created_at || null
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function usage() {
  const cl = ready();
  const r = await cl.api.usage();
  return { plan: r.plan, credits: r.credits?.usage, storage: r.storage?.usage, bandwidth: r.bandwidth?.usage };
}

export { cloudinary };
