/**
 * Cloudinary upload for generated audit PDFs.
 *
 * Uses the signed REST upload endpoint directly — no SDK, no dependencies.
 * PDFs go up as `raw` resources, which sidesteps Cloudinary's account-level
 * restriction on delivering PDFs through the `image` resource type.
 *
 * Env:
 *   CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 *   CLOUDINARY_FOLDER   optional, default "smart1-audits"
 */

const crypto = require('crypto');

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME;
const KEY = process.env.CLOUDINARY_API_KEY;
const SECRET = process.env.CLOUDINARY_API_SECRET;
const FOLDER = process.env.CLOUDINARY_FOLDER || 'smart1-audits';

const isConfigured = () => Boolean(CLOUD && KEY && SECRET);

/** Cloudinary signs the SHA-1 of alphabetically sorted params plus the API secret. */
function sign(params) {
  const base = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHash('sha1').update(base + SECRET).digest('hex');
}

/**
 * @param {Buffer} buffer  the PDF
 * @param {string} filename e.g. marketing-efficiency-audit-acme-ab12.pdf
 * @returns {Promise<{url:string, publicId:string, bytes:number}>}
 */
async function uploadPdf(buffer, filename) {
  if (!isConfigured()) throw new Error('Cloudinary is not configured');

  const publicId = filename.replace(/\.pdf$/i, '');
  const timestamp = Math.floor(Date.now() / 1000);
  const signed = { folder: FOLDER, public_id: publicId, timestamp };

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'application/pdf' }), filename);
  form.append('api_key', KEY);
  form.append('timestamp', String(timestamp));
  form.append('folder', FOLDER);
  form.append('public_id', publicId);
  form.append('signature', sign(signed));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/raw/upload`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.secure_url) {
      throw new Error(`Cloudinary ${r.status}: ${data?.error?.message || 'upload failed'}`);
    }
    return { url: data.secure_url, publicId: data.public_id, bytes: data.bytes || buffer.length };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { uploadPdf, isConfigured, FOLDER, _sign: sign };
