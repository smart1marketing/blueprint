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

/**
 * Build a companion banner from the generated artwork: darkened art, the
 * client's own logo top-left, headline, subline and a CTA pill.
 */
export function bannerUrl(artPublicId, { width, height, logoUrl, headline, subline, cta, accent = 'FFB020' }) {
  const cl = ready();
  const scale = width / 300;
  const px = (n) => Math.max(8, Math.round(n * scale));

  const transformation = [
    { width, height, crop: 'fill', gravity: 'auto' },
    // A scrim, not a blur — the art stays readable underneath the type.
    { effect: 'brightness:-18' },
    { effect: 'colorize:30', color: '#0C1017' }
  ];

  if (logoUrl) {
    transformation.push({
      overlay: `fetch:${b64url(logoUrl)}`,
      width: px(96),
      crop: 'fit',
      gravity: 'north_west',
      x: px(16),
      y: px(16)
    });
  }

  if (headline) {
    transformation.push({
      overlay: { font_family: 'Montserrat', font_size: px(28), font_weight: 'bold', text: textSafe(headline) },
      color: 'white',
      gravity: 'west',
      x: px(16),
      y: px(6),
      width: px(250),
      crop: 'fit'
    });
  }
  if (subline) {
    transformation.push({
      overlay: { font_family: 'Montserrat', font_size: px(14), text: textSafe(subline) },
      color: `rgb:${accent}`,
      gravity: 'west',
      x: px(16),
      y: px(38),
      width: px(250),
      crop: 'fit'
    });
  }
  if (cta) {
    transformation.push({
      overlay: { font_family: 'Montserrat', font_size: px(13), font_weight: 'bold', text: textSafe(cta) },
      color: 'rgb:0B1220',
      background: `rgb:${accent}`,
      gravity: 'south_west',
      x: px(16),
      y: px(16),
      crop: 'fit'
    });
  }

  transformation.push({ quality: 'auto', fetch_format: 'auto' });
  return cl.url(artPublicId, { transformation, secure: true });
}

/** Licensed music beds the agency has uploaded to their bed folder. */
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
