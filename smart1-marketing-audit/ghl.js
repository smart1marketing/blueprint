/**
 * GoHighLevel (Smart 1 Suite) API v2 client.
 *
 * Three things happen per completed audit, in order:
 *   1. upsert the contact (partner details, tags, source)
 *   2. attach the PDF to a file-type custom field on that contact
 *   3. write a note holding the score summary and the report link
 *
 * Env:
 *   GHL_API_KEY            Private Integration token
 *   GHL_LOCATION_ID        sub-account id
 *   GHL_PDF_FIELD_ID       id of the file-upload custom field on Contact
 *   GHL_PDF_FIELD_KEY      optional; used only to look the id up by key
 */

const crypto = require('crypto');

const API = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';

const KEY = process.env.GHL_API_KEY;
const LOCATION = process.env.GHL_LOCATION_ID;
const PDF_FIELD_ID = process.env.GHL_PDF_FIELD_ID;
const PDF_FIELD_KEY = process.env.GHL_PDF_FIELD_KEY;

const isConfigured = () => Boolean(KEY && LOCATION);
const canAttach = () => Boolean(isConfigured() && (PDF_FIELD_ID || PDF_FIELD_KEY));

const authHeaders = (extra = {}) => ({
  Authorization: `Bearer ${KEY}`,
  Version: VERSION,
  Accept: 'application/json',
  ...extra,
});

async function call(pathname, { method = 'GET', json, form, timeout = 30000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(`${API}${pathname}`, {
      method,
      signal: controller.signal,
      headers: json ? authHeaders({ 'Content-Type': 'application/json' }) : authHeaders(),
      body: json ? JSON.stringify(json) : form,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`GHL ${r.status} ${pathname}: ${data?.message || JSON.stringify(data).slice(0, 200)}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function splitName(full = '') {
  const parts = String(full).trim().split(/\s+/);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || '' };
}

/* ---------------------------------------------------------------
   Custom field id resolution
---------------------------------------------------------------- */
let cachedFieldId = PDF_FIELD_ID || null;

async function resolvePdfFieldId() {
  if (cachedFieldId) return cachedFieldId;
  if (!PDF_FIELD_KEY) return null;
  const data = await call(`/locations/${LOCATION}/customFields?model=contact`);
  const fields = data.customFields || data.customField || [];
  const match = fields.find(
    (f) => f.fieldKey === PDF_FIELD_KEY || f.key === PDF_FIELD_KEY || f.name === PDF_FIELD_KEY
  );
  if (match) cachedFieldId = match.id;
  return cachedFieldId;
}

/* ---------------------------------------------------------------
   Public operations
---------------------------------------------------------------- */
async function upsertContact(payload) {
  const { firstName, lastName } = splitName(payload.name || payload.partnerName);
  const data = await call('/contacts/upsert', {
    method: 'POST',
    json: {
      locationId: LOCATION,
      firstName,
      lastName,
      email: payload.email || undefined,
      phone: payload.phone || undefined,
      companyName: payload.firm || payload.partnerFirm || undefined,
      source: 'Marketing Efficiency Audit',
      tags: ['marketing-efficiency-audit', 'cpa-partner-referral'],
    },
  });
  return data?.contact?.id || data?.id || null;
}

/**
 * Attach the PDF to a file-type custom field on the contact.
 * Field name format per GHL docs is `<customFieldId>_<fileId>`; some accounts
 * accept the bare `<customFieldId>`, so that is retried on failure.
 */
async function attachPdf(contactId, buffer, filename) {
  const fieldId = await resolvePdfFieldId();
  if (!fieldId) throw new Error('No GHL_PDF_FIELD_ID configured');
  if (buffer.length > 50 * 1024 * 1024) throw new Error('PDF exceeds the 50 MB GHL limit');

  const query = `?contactId=${encodeURIComponent(contactId)}&locationId=${encodeURIComponent(LOCATION)}`;
  const blob = new Blob([buffer], { type: 'application/pdf' });
  const names = [`${fieldId}_${crypto.randomUUID()}`, fieldId];

  let lastErr;
  for (const fieldName of names) {
    try {
      const form = new FormData();
      form.append(fieldName, blob, filename);
      return await call(`/forms/upload-custom-files${query}`, { method: 'POST', form, timeout: 45000 });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function addNote(contactId, body) {
  return call(`/contacts/${contactId}/notes`, { method: 'POST', json: { body } });
}

function noteBody(p) {
  const spend = p.monthlyMarketingSpend != null
    ? '$' + Number(p.monthlyMarketingSpend).toLocaleString('en-US')
    : '—';
  return [
    `Marketing Efficiency Audit — ${p.clientBusiness || 'client'} (${p.clientIndustry || 'industry not given'})`,
    `Prepared by: ${p.partnerName || '—'}${p.partnerFirm ? ` (${p.partnerFirm})` : ''}`,
    `Efficiency Score: ${p.efficiencyScore ?? '—'}/100 — ${p.scoreTier || ''}`,
    `Warning signs: ${p.leakPoints ?? '—'}/30 — ${p.leakTier || ''}`,
    `Monthly marketing spend: ${spend}`,
    p.pdfAttached ? 'PDF report: attached to this contact' : null,
    p.auditPdfUrl ? `PDF report link: ${p.auditPdfUrl}` : null,
  ].filter(Boolean).join('\n');
}

/**
 * Full sequence. Never throws — each step logs and the rest continue,
 * so a failed attachment still leaves a contact and a note behind.
 */
async function sendAudit(payload, pdfBuffer, filename) {
  if (!isConfigured()) return { skipped: true };

  const result = { contactId: null, attached: false, noted: false };

  try {
    result.contactId = await upsertContact(payload);
  } catch (err) {
    console.error('ghl upsert failed:', err.message);
    return result;
  }
  if (!result.contactId) return result;

  if (pdfBuffer && canAttach()) {
    try {
      await attachPdf(result.contactId, pdfBuffer, filename);
      result.attached = true;
    } catch (err) {
      console.error('ghl pdf attach failed:', err.message);
    }
  }

  try {
    await addNote(result.contactId, noteBody({ ...payload, pdfAttached: result.attached }));
    result.noted = true;
  } catch (err) {
    console.error('ghl note failed:', err.message);
  }

  return result;
}

module.exports = { sendAudit, isConfigured, canAttach, upsertContact, attachPdf, addNote };
