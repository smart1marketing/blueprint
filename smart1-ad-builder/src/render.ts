/**
 * The orchestrator.
 *
 *   Template JSON + Brand JSON + Creative JSON + assets
 *      -> SVG -> Sharp -> PNG/JPG -> QA -> RenderResult
 *
 * One approved concept fans out to every size in the package. Copy is looked
 * up per size first and only falls back to `default`, which is what lets the
 * 320x50 carry five words while the 300x600 carries twenty-four.
 */

import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import type {
  Brand,
  CopySet,
  CreativeConcept,
  RenderResult,
  SizeKey,
} from './types';
import { compose } from './svg';
import { rasterise } from './raster';
import { rollUp, runQa } from './qa';
import { getPlatform, getTemplate } from './registry';

export interface RenderOneOptions {
  brand: Brand;
  concept: CreativeConcept;
  platform: string;
  size: SizeKey;
  outDir: string;
  assetRoot?: string;
  /** Also write the intermediate SVG next to the raster. Useful for debugging. */
  emitSvg?: boolean;
}

export function copyForSize(concept: CreativeConcept, size: SizeKey): CopySet {
  const specific = concept.copy[size];
  const fallback = concept.copy.default;
  if (!specific && !fallback) {
    throw new Error(`Concept ${concept.conceptId} has no copy for ${size} and no default`);
  }
  return { ...(fallback ?? {}), ...(specific ?? {}) } as CopySet;
}

export async function renderOne(opts: RenderOneOptions): Promise<RenderResult> {
  const { brand, concept, platform, size, outDir, assetRoot, emitSvg } = opts;

  const template = getTemplate(concept.layoutFamily);
  const layout = template.sizes[size];
  if (!layout) {
    throw new Error(`Template ${template.id} has no layout for ${size}`);
  }
  const rule = getPlatform(platform).sizes[size];
  if (!rule) {
    throw new Error(`Platform ${platform} does not define ${size}`);
  }

  const scale = rule.deliverScale;
  const copy = copyForSize(concept, size);
  // Passed through so the composer can pick the reverse logo on dark panels.
  (copy as any).__useReverseLogo = concept.useReverseLogo ?? layout.background === 'dark';

  const composed = await compose({
    layout,
    brand,
    copy,
    hero: concept.hero,
    scale,
    noBakedCta: rule.noBakedCta,
    assetRoot,
  });

  // Background-only pass: same geometry, no glyphs. Sampling this tells us the
  // real contrast under each text block, including over photography.
  const bgPass = await compose({
    layout,
    brand,
    copy,
    hero: concept.hero,
    scale,
    includeText: false,
    noBakedCta: rule.noBakedCta,
    assetRoot,
  });
  const backgroundPng = await sharp(Buffer.from(bgPass.svg)).png().toBuffer();

  const raster = await rasterise({
    svg: composed.svg,
    formats: rule.formats.filter((f): f is 'png' | 'jpg' => f !== 'gif'),
    maxFileBytes: rule.maxFileBytes,
  });

  const qa = await runQa({
    layout,
    brand,
    copy,
    rule,
    composed,
    raster,
    backgroundPng,
    scale,
  });

  const dir = path.join(outDir, platform, concept.conceptId);
  fs.mkdirSync(dir, { recursive: true });
  const base = `${brand.domain.replace(/\W+/g, '-')}_${concept.conceptId}_${size}`;
  const file = path.join(dir, `${base}.${raster.format}`);
  fs.writeFileSync(file, raster.buffer);
  if (emitSvg) fs.writeFileSync(path.join(dir, `${base}.svg`), composed.svg);

  return {
    platform,
    size,
    conceptId: concept.conceptId,
    file,
    format: raster.format,
    width: layout.canvas.w * scale,
    height: layout.canvas.h * scale,
    bytes: raster.bytes,
    wordCount: composed.wordCount,
    qa,
    status: rollUp(qa),
  };
}

export interface RenderPackageOptions {
  brand: Brand;
  concept: CreativeConcept;
  platform: string;
  outDir: string;
  assetRoot?: string;
  sizes?: SizeKey[];
  emitSvg?: boolean;
}

/** Render every size a template and platform have in common. */
export async function renderPackage(opts: RenderPackageOptions): Promise<RenderResult[]> {
  const template = getTemplate(opts.concept.layoutFamily);
  const platform = getPlatform(opts.platform);
  const sizes =
    opts.sizes ??
    (Object.keys(template.sizes) as SizeKey[]).filter((s) => platform.sizes[s]);

  const results: RenderResult[] = [];
  for (const size of sizes) {
    results.push(await renderOne({ ...opts, size }));
  }
  return results;
}
