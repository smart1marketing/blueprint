/**
 * Imagery.
 *
 * Two ways to put a real picture behind an ad instead of a grey placeholder:
 *
 *   Pixabay search — free, licence-clean stock, chosen by keywords derived
 *   from the landing page and campaign. Fast and cheap.
 *
 *   AI generation — an original hero built to the campaign, when stock does
 *   not fit or the customer wants something bespoke. Uses OpenAI images.
 *
 * Both return candidates the person picks from; nothing is auto-applied. And
 * both write their output through fitImageToBudget, so every image — stock or
 * generated — is guaranteed a valid raster under 150 KB before it can become
 * part of a creative. The rule holds by construction: there is no path here
 * that skips the enforcer.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fitImageToBudget } from './image-budget';
import type { LandingAnalysis } from './projects';

export interface ImageCandidate {
  /** Local path to the under-budget image. */
  file: string;
  /** Public URL the proof/build screen can show it at. */
  url: string;
  bytes: number;
  width: number;
  height: number;
  source: 'pixabay' | 'openai';
  /** Pixabay page or generation prompt, for attribution/debugging. */
  credit?: string;
}

export interface ImageQuery {
  business: string;
  promoting: string;
  objective?: string;
  landing?: LandingAnalysis;
  /** Extra keywords the caller wants to force in. */
  keywords?: string[];
}

/**
 * Turn a campaign into a short, concrete image search phrase. Landing-page
 * nouns beat form fields — "artisan pizza wood oven" finds better stock than
 * "Italian restaurant lead generation".
 */
export function imageKeywords(q: ImageQuery): string {
  if (q.keywords?.length) return q.keywords.join(' ');
  const stop = /\b(the|and|for|with|your|our|a|an|to|of|in|on|get|best|now|today|free|new)\b/gi;
  const fromLanding = (q.landing?.summary ?? '').replace(stop, ' ');
  const source = `${q.promoting} ${fromLanding}`.replace(stop, ' ');
  const words = source.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  const seen = new Set<string>();
  const picked: string[] = [];
  for (const w of words) {
    if (seen.has(w)) continue;
    seen.add(w);
    picked.push(w);
    if (picked.length >= 4) break;
  }
  if (!picked.length) picked.push(...q.business.toLowerCase().match(/[a-z]{4,}/g) ?? ['business']);
  return picked.join(' ');
}

interface PixabayHit { largeImageURL: string; webformatURL: string; pageURL: string; imageWidth: number; imageHeight: number; }

/**
 * Search Pixabay for landscape photos matching the campaign. Returns up to
 * `count` candidates, each downloaded and squeezed under 150 KB.
 */
export async function searchPixabay(
  q: ImageQuery,
  opts: { cacheDir: string; count?: number; apiKey?: string; fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<ImageCandidate[]> {
  const apiKey = opts.apiKey ?? process.env.PIXABAY_API;
  if (!apiKey) throw new Error('PIXABAY_API is not set.');
  const doFetch = opts.fetchImpl ?? fetch;
  const query = imageKeywords(q);
  const url = `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}` +
    `&image_type=photo&orientation=horizontal&safesearch=true&per_page=${Math.max(3, (opts.count ?? 2) * 3)}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 12_000);
  let hits: PixabayHit[] = [];
  try {
    const res = await doFetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Pixabay returned ${res.status}`);
    const data: any = await res.json();
    hits = (data.hits ?? []) as PixabayHit[];
  } finally {
    clearTimeout(timer);
  }
  if (!hits.length) return [];

  fs.mkdirSync(opts.cacheDir, { recursive: true });
  const out: ImageCandidate[] = [];
  for (const hit of hits.slice(0, (opts.count ?? 2) * 2)) {
    if (out.length >= (opts.count ?? 2)) break;
    try {
      const imgRes = await doFetch(hit.largeImageURL ?? hit.webformatURL);
      if (!imgRes.ok) continue;
      const raw = Buffer.from(await imgRes.arrayBuffer());
      const base = `pixabay-${slugKey(query)}-${out.length}`;
      const fitted = await fitImageToBudget(raw, path.join(opts.cacheDir, `${base}.jpg`));
      out.push({
        file: fitted.file, url: '', bytes: fitted.bytes, width: fitted.width, height: fitted.height,
        source: 'pixabay', credit: hit.pageURL,
      });
    } catch {
      /* skip a bad hit */
    }
  }
  return out;
}

/**
 * Generate an original hero with OpenAI images, prompted from the campaign and
 * landing page. Returns one candidate, under 150 KB.
 */
export async function generateHero(
  q: ImageQuery,
  opts: { cacheDir: string; apiKey?: string; fetchImpl?: typeof fetch; timeoutMs?: number; size?: string },
): Promise<ImageCandidate> {
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set.');
  const doFetch = opts.fetchImpl ?? fetch;

  const subject = q.landing?.summary || q.promoting || q.business;
  const prompt =
    `A clean, professional advertising background photo for ${q.business}. ` +
    `Subject: ${subject}. ` +
    `Bright, uncluttered, with generous empty space on one side for text overlay. ` +
    `Realistic commercial photography, no text, no logos, no watermarks.`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60_000);
  try {
    const res = await doFetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1',
        prompt,
        n: 1,
        size: opts.size ?? '1536x1024',
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`OpenAI images returned ${res.status}: ${(await res.text()).slice(0, 150)}`);
    const data: any = await res.json();
    const b64 = data.data?.[0]?.b64_json;
    const raw = b64
      ? Buffer.from(b64, 'base64')
      : Buffer.from(await (await doFetch(data.data[0].url)).arrayBuffer());

    fs.mkdirSync(opts.cacheDir, { recursive: true });
    const fitted = await fitImageToBudget(raw, path.join(opts.cacheDir, `ai-hero-${Date.now().toString(36)}.jpg`));
    return {
      file: fitted.file, url: '', bytes: fitted.bytes, width: fitted.width, height: fitted.height,
      source: 'openai', credit: prompt,
    };
  } finally {
    clearTimeout(timer);
  }
}

function slugKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
}
