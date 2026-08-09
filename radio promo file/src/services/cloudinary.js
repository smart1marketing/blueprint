import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config.js';
import { log } from './store.js';
import { solveScrim, plateFor, pickTextColor, rootDomain, WHITE } from './contrast.js';

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

export async function uploadBuffer(buffer, { folder, publicId, resourceType = 'auto', context = {}, tags = [], colors = false }) {
  const cl = ready();
  return new Promise((resolve, reject) => {
    const stream = cl.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: resourceType,
        overwrite: true,
        context,
        colors,
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
      colors: opts.colors || false,
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

/**
 * Companion banner, to a fixed template:
 *
 *      logo            top centre, on a contrast-checked plate
 *      headline        centre, 3-4 words summarising the campaign
 *      support line    directly beneath, the offer or deadline
 *      root domain     bottom centre, in a brand-accent bar
 *
 * Nothing here is assumed legible. The scrim strength is solved from the
 * artwork's own predominant colours, the logo plate is chosen from the
 * logo's colours, and the URL bar's text colour is chosen from the accent.
 */
export function bannerUrl(artPublicId, {
  width, height, logoUrl, logoPublicId, headline, support, cta, offer,
  landingUrl, homeUrl, accent = 'FFB020', artColors = [], logoColors = []
}) {
  const cl = ready();
  const scale = width / 300;
  const px = (n) => Math.max(6, Math.round(n * scale));

  const accentHex = String(accent).replace('#', '').slice(0, 6) || 'FFB020';
  const bar = pickTextColor(`#${accentHex}`);
  const barText = bar.color === WHITE ? 'white' : 'rgb:0B1220';

  const title = (headline || cta || '').trim();
  const sub = (support || offer || '').trim();
  const domain = rootDomain(homeUrl, landingUrl);

  // Solve the scrim against this artwork rather than using a fixed one.
  const scrim = solveScrim(artColors, { target: 7 });
  const plate = plateFor(logoColors);

  // Long headlines step down in size so they never overflow the safe area.
  const titleSize = title.length <= 14 ? 30 : title.length <= 20 ? 26 : title.length <= 28 ? 22 : 19;

  const transformation = [
    { width, height, crop: 'fill', gravity: 'auto' },
    { effect: `brightness:${scrim.brightness}` },
    { effect: `colorize:${scrim.colorize}`, color: '#0B1220' }
  ];

  // 1. LOGO — top centre, on a plate chosen for its own colouring.
  const logoLayer = logoPublicId
    ? String(logoPublicId).replace(/\//g, ':')
    : logoUrl ? `fetch:${b64url(logoUrl)}` : null;

  if (logoLayer) {
    transformation.push({
      overlay: logoLayer,
      width: px(164), height: px(58),
      crop: 'pad', background: plate.plate,
      radius: px(8),
      gravity: 'north', y: px(18)
    });
  }

  // 2. HEADLINE — centred below the logo, the dominant element.
  if (title) {
    transformation.push({
      overlay: { font_family: 'Montserrat', font_size: px(titleSize), font_weight: 'bold', text: textSafe(title) },
      color: scrim.textColor === WHITE ? 'white' : 'rgb:0B1220',
      gravity: 'center', y: px(sub ? -4 : 6),
      width: px(252), crop: 'fit'
    });
  }

  // 3. SUPPORT LINE — directly beneath the headline, in the accent.
  if (sub) {
    transformation.push({
      overlay: { font_family: 'Montserrat', font_size: px(14), font_weight: 'bold', text: textSafe(sub) },
      color: `rgb:${accentHex}`,
      gravity: 'center', y: px(30),
      width: px(252), crop: 'fit'
    });
  }

  // 4. ROOT DOMAIN — bottom centre, accent bar, contrast-checked text.
  if (domain) {
    transformation.push({
      overlay: { font_family: 'Montserrat', font_size: px(15), font_weight: 'bold', text: textSafe(domain) },
      color: barText,
      background: `rgb:${accentHex}`,
      gravity: 'south', y: px(16),
      crop: 'fit'
    });
  }

  // A hairline edge so the banner reads as a unit on a white page.
  transformation.push({ border: `1px_solid_rgb:0B122033` });
  transformation.push({ quality: 'auto', fetch_format: 'auto' });

  return cl.url(artPublicId, { transformation, secure: true });
}

/** The reasoning behind a banner's colour decisions, for the studio to show. */
export function bannerContrastReport({ accent = 'FFB020', artColors = [], logoColors = [] }) {
  const scrim = solveScrim(artColors, { target: 7 });
  const bar = pickTextColor(`#${String(accent).replace('#', '')}`);
  const plate = plateFor(logoColors);
  return {
    textOnArtwork: `${scrim.ratio}:1`,
    textOnArtworkPasses: scrim.passes,
    scrim: `brightness ${scrim.brightness}, colorize ${scrim.colorize}`,
    urlBar: `${bar.ratio}:1`,
    urlBarPasses: bar.ratio >= 4.5,
    logoPlate: plate.reason
  };
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
