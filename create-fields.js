#!/usr/bin/env node
/**
 * GoHighLevel — Opportunity Custom Field creator
 * -------------------------------------------------
 * Reads config/fields.json and creates OPPORTUNITY custom fields in your
 * GHL sub-account using a Private Integration Token (PIT).
 *
 * Endpoint used:  POST https://services.leadconnectorhq.com/locations/{locationId}/customFields
 *   body: { name, dataType, model: "opportunity", options?, ... }
 * (This legacy "locations" endpoint is the ONLY one that supports model=opportunity.
 *  The newer Custom Fields V2 API does not support opportunities yet.)
 *
 * MODES
 *   node create-fields.js --verify    List every opportunity custom field that already exists. No writes.
 *   node create-fields.js --dry-run   Show exactly what WOULD be created. No writes.
 *   node create-fields.js             Create all missing fields (idempotent: skips ones that already exist).
 *
 * REQUIRED ENV VARS  (set in Render dashboard, or a local .env file)
 *   GHL_TOKEN        Your private integration token, e.g. pit-xxxxxxxx...
 *   GHL_LOCATION_ID  Your sub-account Location ID, e.g. colmyQCuPN9SxcuJfGhc
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------- tiny .env loader (no dependencies) ----------
function loadDotEnv() {
  const p = join(__dirname, ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadDotEnv();

// ---------- config ----------
const API_BASE = "https://services.leadconnectorhq.com";
const API_VERSION = "2021-07-28";
const TOKEN = process.env.GHL_TOKEN;
const LOCATION_ID = process.env.GHL_LOCATION_ID;

const MODE = process.argv.includes("--verify")
  ? "verify"
  : process.argv.includes("--dry-run")
  ? "dry-run"
  : "create";

// Friendly type names -> GHL dataType values.
const TYPE_MAP = {
  text: "TEXT",
  single_line: "TEXT",
  textarea: "LARGE_TEXT",
  large_text: "LARGE_TEXT",
  multiline: "LARGE_TEXT",
  number: "NUMERICAL",
  numerical: "NUMERICAL",
  phone: "PHONE",
  money: "MONETORY",
  monetary: "MONETORY",
  currency: "MONETORY",
  email: "EMAIL",
  date: "DATE",
  checkbox: "CHECKBOX",
  dropdown: "SINGLE_OPTIONS",
  single_options: "SINGLE_OPTIONS",
  single_select: "SINGLE_OPTIONS",
  multi_select: "MULTIPLE_OPTIONS",
  multiple_options: "MULTIPLE_OPTIONS",
  radio: "RADIO",
  textbox_list: "TEXTBOX_LIST",
  file: "FILE_UPLOAD",
  file_upload: "FILE_UPLOAD",
};
const OPTION_TYPES = new Set([
  "CHECKBOX",
  "SINGLE_OPTIONS",
  "MULTIPLE_OPTIONS",
  "RADIO",
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function die(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

function headers() {
  return {
    Authorization: `Bearer ${TOKEN}`,
    Version: API_VERSION,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

// ---------- API helpers ----------
async function apiFetch(path, opts = {}, attempt = 1) {
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers: headers() });
  // Basic retry/backoff on rate-limit or transient 5xx.
  if ((res.status === 429 || res.status >= 500) && attempt <= 4) {
    const wait = 1000 * attempt;
    console.log(`   …${res.status} received, retrying in ${wait}ms (attempt ${attempt})`);
    await sleep(wait);
    return apiFetch(path, opts, attempt + 1);
  }
  return res;
}

async function getExistingFields(model = "all", soft = false) {
  let res, text;
  try {
    res = await apiFetch(
      `/locations/${LOCATION_ID}/customFields?model=${model}`,
      { method: "GET" }
    );
    text = await res.text();
  } catch (e) {
    if (soft) {
      console.log(`⚠️  Could not reach the GHL API (${e.message}). Continuing offline; assuming no fields exist yet.`);
      return [];
    }
    throw e;
  }
  if (!res.ok) {
    if (soft) {
      console.log(`⚠️  Could not list existing fields (HTTP ${res.status}). Continuing offline for preview.`);
      return [];
    }
    die(
      `Could not list existing custom fields (HTTP ${res.status}).\n` +
        `Response: ${text}\n\n` +
        `Check that GHL_TOKEN is valid, not expired, and has the ` +
        `"View Custom Fields" scope, and that GHL_LOCATION_ID is correct.`
    );
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    die(`Unexpected non-JSON response while listing fields: ${text}`);
  }
  // The API returns { customFields: [...] }
  return data.customFields || data.customField || [];
}

async function createField(field) {
  const dataType = TYPE_MAP[String(field.type || "text").toLowerCase()];
  if (!dataType) {
    return { ok: false, name: field.name, error: `Unknown type "${field.type}"` };
  }
  const body = {
    name: field.name,
    dataType,
    model: field.model === "opportunity" ? "opportunity" : "contact",
  };
  if (field.placeholder) body.placeholder = field.placeholder;
  if (OPTION_TYPES.has(dataType)) {
    if (!Array.isArray(field.options) || field.options.length === 0) {
      return {
        ok: false,
        name: field.name,
        error: `Type ${dataType} requires a non-empty "options" array`,
      };
    }
    // GHL accepts a simple array of option strings for these field types.
    body.options = field.options.map((o) => String(o));
  }
  if (dataType === "TEXTBOX_LIST" && Array.isArray(field.options)) {
    body.textBoxListOptions = field.options.map((o) => ({ label: String(o), prefillValue: "" }));
    delete body.options;
  }

  const res = await apiFetch(`/locations/${LOCATION_ID}/customFields`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, name: field.name, error: `HTTP ${res.status}: ${text}` };
  }
  return { ok: true, name: field.name, dataType };
}

// ---------- config loading ----------
function loadConfig() {
  const p = join(__dirname, "config", "fields.json");
  if (!existsSync(p)) die(`Missing config file: ${p}`);
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    die(`config/fields.json is not valid JSON: ${e.message}`);
  }
  // Flatten groups -> list of fields, applying an optional per-group name prefix
  // and resolving the object model (contact | opportunity) for each field.
  const defaultModel = cfg.defaultModel === "opportunity" ? "opportunity" : "contact";
  const fields = [];
  for (const group of cfg.groups || []) {
    const prefix = group.prefix ? `${group.prefix} ` : "";
    const groupModel = group.model || defaultModel;
    for (const f of group.fields || []) {
      fields.push({
        ...f,
        name: `${prefix}${f.name}`,
        model: f.model || groupModel,
        _group: group.name,
      });
    }
  }
  return fields;
}

// ---------- main ----------
async function main() {
  console.log(`\nGoHighLevel opportunity custom-field tool  —  mode: ${MODE.toUpperCase()}`);
  if (!TOKEN) die("GHL_TOKEN env var is not set.");
  if (!LOCATION_ID) die("GHL_LOCATION_ID env var is not set.");
  console.log(`Location: ${LOCATION_ID}`);

  const existing = await getExistingFields("all", MODE === "dry-run");
  // Key existing fields by "model::name" so a contact field and an opportunity
  // field with the same name are treated as distinct.
  const existingByKey = new Map(
    existing.map((f) => [
      `${(f.model || "contact").toLowerCase()}::${String(f.name).trim().toLowerCase()}`,
      f,
    ])
  );
  console.log(`Found ${existing.length} existing custom field(s) (contact + opportunity).`);

  if (MODE === "verify") {
    console.log(`\nExisting custom fields:`);
    if (existing.length === 0) console.log("   (none)");
    for (const f of existing) {
      console.log(`   • [${f.model || "contact"}] ${f.name}  (${f.dataType})  id=${f.id}`);
    }
    console.log("");
    return;
  }

  const wanted = loadConfig();
  console.log(`Config defines ${wanted.length} field(s) to ensure.\n`);

  const toCreate = [];
  const skipped = [];
  for (const f of wanted) {
    const key = `${f.model.toLowerCase()}::${f.name.trim().toLowerCase()}`;
    if (existingByKey.has(key)) skipped.push(f);
    else toCreate.push(f);
  }

  if (skipped.length) {
    console.log(`⏭  Already exist (${skipped.length}), skipping:`);
    for (const f of skipped) console.log(`     • ${f.name}`);
    console.log("");
  }

  if (MODE === "dry-run") {
    console.log(`Would CREATE ${toCreate.length} field(s):`);
    for (const f of toCreate) {
      const dt = TYPE_MAP[String(f.type || "text").toLowerCase()] || `?? (${f.type})`;
      const opts = f.options ? `  options=[${f.options.join(", ")}]` : "";
      console.log(`     + [${f.model}] ${f.name}  (${dt})${opts}`);
    }
    console.log(`\n(dry run — nothing was written)\n`);
    return;
  }

  // create
  const results = { created: [], failed: [] };
  for (const f of toCreate) {
    process.stdout.write(`Creating [${f.model}] "${f.name}" … `);
    const r = await createField(f);
    if (r.ok) {
      console.log(`✓ (${r.dataType})`);
      results.created.push(r.name);
    } else {
      console.log(`✗ ${r.error}`);
      results.failed.push({ name: r.name, error: r.error });
    }
    await sleep(250); // be gentle with the API
  }

  console.log(`\n──────── SUMMARY ────────`);
  console.log(`Created:  ${results.created.length}`);
  console.log(`Skipped:  ${skipped.length} (already existed)`);
  console.log(`Failed:   ${results.failed.length}`);
  if (results.failed.length) {
    console.log(`\nFailures:`);
    for (const f of results.failed) console.log(`   • ${f.name} → ${f.error}`);
    process.exitCode = 1;
  }
  console.log("");
}

main().catch((e) => die(e.stack || String(e)));
