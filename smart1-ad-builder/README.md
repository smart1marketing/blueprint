# smart1-ad-builder — rendering core

This is the piece the rest of the system hangs off: the deterministic renderer
that turns an approved creative concept into a compliant ad package.

The architectural bet from the plan holds here. **OpenAI creates the creative
intelligence; this renderer creates the finished ads.** No image model is ever
asked to draw a headline, a logo or a CTA button.

```
Template JSON  (where things sit)
Brand JSON     (who the advertiser is)     ─┐
Creative JSON  (what the ad says)           ├─→ SVG → Sharp → PNG/JPG → QA
Cloudinary assets                          ─┘
```

## Onboarding a client

Icon Solar is a worked example, not the product. Nothing in the renderer,
templates, platform configs or Cloudinary layer is specific to it — every
client is just another campaign JSON. `campaigns/bella-vista-catering.json` is
a second, deliberately unrelated brand (different palette, different typeface,
different vertical) that renders clean through the same templates.

```bash
npx tsx scripts/scaffold.ts \
  --client "Bella Vista Catering" --domain bellavista.com \
  --campaign "Fall Catering" \
  --primary '#7A2E1F' --secondary '#C4713C' --accent '#F2C14E' --dark '#2A1410' \
  --headline-font Poppins --body-font "Open Sans"
```

That writes `campaigns/<client>.json` plus brand-coloured placeholder assets in
`assets/<client>/`, then validates the result. Edit the copy and render:

```bash
npx tsx src/cli.ts --campaign campaigns/bella-vista-catering.json --platform google
```

### Fonts are the one hard constraint

The renderer converts glyphs to paths from real font files, so it can only use
families in the registry in `src/fonts.ts` — currently Montserrat, Open Sans,
Poppins and DejaVu Sans. **A brand font that is not registered is a validation
error, not a silent fallback.** That is deliberate: a proof rendered in the
wrong typeface looks finished, so nobody checks it.

To add a client's font, vendor the licensed files into the repo and add an
entry to `REGISTRY`. Do not accept customer-uploaded font files.

### Validation runs before every render

`src/validate.ts` checks the brand palette is complete and valid hex, both
fonts resolve, logo and hero files exist on disk, every concept names a real
template, and each size that needs a headline has one. Errors stop the run;
`--skip-validation` overrides. `--verbose` also prints per-platform size
coverage.

## Running it

```bash
npm install
npm run assets            # placeholder logo + three hero orientations
npm run render:google     # all concepts, Google package
npm run render:amazon     # all concepts, Amazon package (2x delivery)
npm run gallery -- --help # see the Cloudinary section below

npx tsx src/cli.ts --platform amazon --concept A --size 970x250 --svg
```

Output lands in `out/<platform>/<conceptId>/` alongside `qa-<platform>.json`.
The process exits non-zero if any creative fails QA, so it drops straight into
a Render background worker without extra wiring.

Current state, Icon Solar sample campaign:

| Platform | Sizes | Result |
|---|---|---|
| Google | 300x250, 336x280, 728x90, 160x600, 300x600, 320x50, 970x250 | 7/7 clean |
| Amazon | the above plus 414x125, with 2x delivery on 320x50, 970x250, 414x125 | 8/8 clean |

Bella Vista Catering (T01 + T04, Poppins, warm palette) renders 11/11 clean on
Google and 12/12 on Amazon from the same templates.

## Why text is converted to paths

`src/fonts.ts` loads real font files with opentype.js and emits every glyph as
an SVG `<path>`. Nothing depends on fontconfig having Montserrat installed on
the host, so a laptop and a Render dyno produce identical bytes, and librsvg's
text-layout quirks are removed from the equation. It also means autofit can
measure a line exactly rather than guessing.

## The three files you will actually edit

**`src/config/platforms/*.json`** — file weights, formats, delivery scale, copy
budgets, minimum font sizes. When Google or Amazon changes a requirement this
is a one-file change, not a deploy of application code.

Amazon entries carry a `source` field. `"doc"` means the value came from the
background research; **`"verify"` means it was inferred and must be confirmed
against Amazon's current spec sheet before first live delivery.** Right now
`300x250` and `336x280` on Amazon are marked `verify`.

**`src/templates/*.json`** — layout families. `T01` (split image) covers all
eight sizes; `T04` (offer led) covers four and deliberately skips the rest, to
demonstrate that the renderer reports gaps rather than inventing a layout.
`T02, T03, T05–T10` from the plan are still to be authored.

To add a size to a family, add a key under `sizes` with a `canvas`, a `safe`
margin, and boxes for the roles you want. Text boxes declare a `[min, max]`
size range and `maxLines`; the fitter walks the range down until the copy fits
and flags overflow when it never does. Coordinates are authored in 1x space and
carried in a viewBox, which is what lets the same document deliver at 2x for
Amazon.

**`schemas/creative-plan.schema.json`** — the Structured Outputs contract for
the OpenAI creative director. The model picks a `layout_family` and writes copy
per size. It never emits coordinates.

## Cloudinary, the image report, and the gallery

Copy `.env.example` to `.env` and fill in the three Cloudinary variables.

```bash
npm run render:google:upload      # render, upload, write reports
npx tsx src/cli.ts --platform amazon --dry-run   # preview without uploading

npx tsx src/gallery.ts --find icon                 # list matching projects
npx tsx src/gallery.ts --folder smart1-ads/icon-solar/summer-solar
npx tsx src/gallery.ts --client "Icon Solar" --campaign "Summer Solar"
```

### One folder per project

The folder is derived from the client and campaign name and created on
submission, so the project is visible in the Media Library before any render
runs:

```
smart1-ads/icon-solar/summer-solar/
    source/                          customer uploads, Brandfetch assets
    generated/                       AI-generated hero images
    proofs/concept-a/                proof-screen previews
    final/google/concept-a/          approved deliverables
    final/amazon/concept-a/
```

Every upload is tagged (`client:`, `campaign:`, `request:`, `concept:`,
`platform:`, `size:`, `qa:`) and carries context metadata, so assets can be
found by tag even if someone later moves the folder. The manifest stores the
`public_id`, never the delivery URL — the URL is a function of the
transformation and will change.

**Creatives that fail QA are not uploaded.** They still appear in the report,
flagged, so nothing disappears silently. `--upload-all` overrides this.

**Folder mode matters.** Cloudinary accounts are either fixed-folder (folder is
a prefix of the public_id, searched with `folder:`) or dynamic-folder
(`asset_folder` is independent, searched with `asset_folder:`). Set
`CLOUDINARY_FOLDER_MODE` to match, or folder search returns nothing.

### The image report

Three files land in `out/reports/` after every run:

| File | Purpose |
|---|---|
| `image-report_<requestId>.html` | The list of every image — size, delivered dimensions, format, weight, word count, QA result, Cloudinary public ID. Grouped by platform and concept. |
| `image-report_<requestId>.csv` | Same data flat, for spreadsheets and account-manager handoff. |
| `manifest_<requestId>.json` | Machine-readable record. This is what the HighLevel custom object should reference. |

### The gallery

`src/gallery.ts` searches the Cloudinary folder and builds a gallery page from
what it finds, rather than from local state — so it shows what is actually in
the library, including anything added by hand. Creatives are displayed at
actual pixel size, capped at 500px wide so a 970x250 does not blow out the
layout.

Passing `--manifest out/reports/manifest_<id>.json` makes the command work
before Cloudinary is configured: it falls back to the last render and points at
the local files. That is how the sample gallery in `out/reports/` was produced.



`src/qa.ts` runs before any proof reaches a customer, and every finding is
machine-readable so the copy-shortening step can act without a human:

```json
{ "check": "overflow:headline", "status": "fail",
  "fix": { "action": "shorten", "role": "headline", "maxWords": 4 } }
```

Checks: delivered dimensions, file weight, per-role text overflow, safe area
(including Amazon's asymmetric 640x250 safe zone inside 828x250), logo presence
and canvas share, baked-CTA presence or required absence, word count against
the per-size budget, minimum font size at delivery scale, and contrast.

The contrast check is worth calling out. The renderer composes a second,
text-free pass of the same layout and samples the actual pixels under each text
block. That catches white copy drifting over a bright patch of a photograph —
something a check against the template's nominal background colour would miss.

One trap if you extend it: sharp's `.stats()` reports on the *input* image and
ignores earlier pipeline operations, so `sharp(png).extract(region).stats()`
silently returns whole-canvas statistics. The crop has to be materialised to a
buffer first. This produced phantom contrast warnings until it was caught by
onboarding a second brand whose page average differed from its copy area.

## What this does not do yet

Everything upstream and downstream of the renderer:

- the multi-step form and Brandfetch discovery
- OpenAI creative-plan generation and image generation
- Cloudinary smart cropping (upload, folders and search are done)
- the proof screen, natural-language revisions, approval flow
- HighLevel custom object sync and status workflows
- the auto-shorten loop (QA emits the instructions; nothing consumes them yet)

The Cloudinary upload path has been written and typechecked but **not executed
against a live account** — this environment has no network route to
`api.cloudinary.com`. Run `--dry-run` first, then a single `--size 300x250`
upload, before turning it loose on a full package.

The renderer is the dependency for all of it, which is why it is first.

## Note on the sample assets

`npm run assets` writes obvious placeholder art, watermarked "NOT FOR CLIENT
USE". It exists so the pipeline runs offline. Replace with Cloudinary-hosted
customer uploads or OpenAI-generated backgrounds.
