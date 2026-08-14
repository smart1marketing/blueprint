# Round 3 — graphics and mobile

## The football

It was a flat lens shape — two curves meeting in a soft point, which read as an eye
or a leaf. Rebuilt as a real American football:

- **1.71 : 1** long axis (a regulation ball is about 1.64 : 1)
- Each half is **two cubic curves**, so the belly stays full while the tips stay sharp
- `stroke-linejoin: miter` — the round join was blunting the points
- Two **white end bands** set close to the tips, where they actually sit on a ball
- **Eight laces** on a spine, plus a long seam and a leather sheen

## Goal post

Added at the back of the field: gooseneck base plate, upright post, crossbar, and two
uprights, in the same turf green as the field lines so it sits behind the ball rather
than competing with it.

## Provider marquee across the top

New band directly under the hero — *"Your ads run inside the apps they already use
every day"* — with **20 providers** scrolling in a seamless loop:

> Hulu · Amazon Prime Video · YouTube TV · Paramount+ · Peacock · ESPN · Max · Roku ·
> Tubi · Pluto TV · Sling TV · Fubo · Spotify · Pandora · iHeartRadio · SiriusXM ·
> Audacy · Amazon Music · TuneIn · NFL Network

Details:

- Rendered **white** via CSS so twenty different brand palettes read as one clean row
- **Pauses on hover**, and stops entirely for anyone with reduced-motion turned on
- Edges fade out with a mask so logos don't hard-clip
- Same never-empty chain as the quote: `public/logos/<domain>.svg` → CDN → favicon →
  wordmark

**To guarantee real logos**, drop the SVGs into `public/logos/`. The exact 20 filenames
are listed in `public/logos/README.txt`. Without them it depends on a third-party CDN —
it works, but self-hosting is bulletproof and faster.

Edit the list in `PROVIDERS` inside `public/index.html`.

## Mobile

Audited at 320, 375, 390 and 768 px.

**Fixed:**

- **Nav collision** — the logo lockup and the "Build Your Playbook" button were
  overlapping on phones. Lockup and button both shrink, and under 380px the
  "MARKETING" word drops so the CTA always fits.
- **Nav button contrast** — `.nav-links a` was overriding the button's text colour, so
  it rendered pale green on green. Now dark on green.
- **Tap targets** — the League / Scope / Focus segments were 39px. Everything
  interactive is now **44px or more**.
- **iOS zoom-on-focus** — inputs are 16px on mobile, so Safari stops zooming when
  someone taps a field.
- **Funnel rows** stack label above value instead of squeezing side by side.
- **Device tiles** go 4-up → 2-up; **form** and **price ladder** go single column;
  Build and Submit buttons go full width.

**Verified at every width:** no horizontal scroll, zero tap targets under 44px, quote
builds, PDF downloads, no JavaScript errors.

| | 320px | 375px | 390px |
|---|---|---|---|
| Horizontal scroll | none | none | none |
| Tap targets < 44px | 0 | 0 | 0 |
| Quote builds | yes | yes | yes |
| PDF downloads | yes | yes | yes |
| JS errors | none | none | none |
