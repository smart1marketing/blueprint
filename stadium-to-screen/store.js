/* Lead store: in-memory list mirrored to a Cloudinary raw JSON file so it
   survives Render restarts/redeploys. Single-instance safe (writes are queued).
   If CLOUDINARY_URL isn't set, it falls back to in-memory only (ephemeral). */

const READY = (process.env.CLOUDINARY_URL || "").startsWith("cloudinary://");
const PUBLIC_ID = "stadium-leads/leads-store.json";

let _cloudinary = null;
function cl() { if (!_cloudinary) _cloudinary = require("cloudinary").v2; return _cloudinary; }

let cache = null;                 // in-memory array (newest first)
let saveChain = Promise.resolve();

function rawUrl() {
  const cloud = cl().config().cloud_name;
  return `https://res.cloudinary.com/${cloud}/raw/upload/${PUBLIC_ID}`;
}

async function load() {
  if (cache) return cache;
  cache = [];
  if (READY) {
    try {
      const r = await fetch(rawUrl() + `?cb=${Date.now()}`);
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data)) cache = data;
      }
    } catch (_e) { /* first run / not created yet → start empty */ }
  }
  return cache;
}

function persist() {
  if (!READY) return Promise.resolve();
  saveChain = saveChain.then(() => new Promise((resolve) => {
    const buf = Buffer.from(JSON.stringify(cache));
    const s = cl().uploader.upload_stream(
      { resource_type: "raw", public_id: PUBLIC_ID, overwrite: true, invalidate: true },
      (err) => { if (err) console.error("leads persist failed:", err.message); resolve(); }
    );
    s.end(buf);
  }));
  return saveChain;
}

async function addLead(record) {
  await load();
  cache.unshift(record);          // newest first
  persist();                      // fire-and-forget (queued); don't block the response
  return record;
}

async function getLeads() { return await load(); }

module.exports = { addLead, getLeads, persistent: READY };
