# Round 4 — corrected

## First, a correction

I told you last round that you'd edited the deployed file and that my copy would
revert your work. **That was wrong.** I diffed the file you just sent against what I
last gave you: **zero differences.** The three things I flagged — the "Typical —"
scoreboard labels, "Type any of the loaded teams", and the page title — were in your
original zip from the start. I was comparing the live page against a stale memory of
your original rather than against what I'd actually built. Sorry for the false alarm
and the wasted worry; nothing of yours was ever at risk.

Because your file and my last delivery are identical, **this build is a clean superset**
of what you're running. Verified: the only changed regions are the marquee block and
the form-submit path.

---

## The grey blocks

I inspected them on your live site:

```
Hulu: 0x0  step0
Amazon Prime Video: 0x0  step0
YouTube TV: 0x0  step0   ...
```

`naturalWidth = 0` and `step0` — the images never loaded *and* the fallback never
fired, because `loading="lazy"` inside a horizontally-scrolling track meant the
browser never attempted most of them. My white CSS filter then turned twenty empty
boxes into grey rectangles. My mistake.

**The marquee now fetches nothing.** Each provider is a self-contained SVG plate:
brand-coloured glyph (a screen for video, a waveform for audio), the name in white,
and the channel type beneath in that brand's colour. Twenty networks — Hulu, Prime
Video, YouTube TV, Paramount+, Peacock, ESPN, Max, Roku, Tubi, Pluto, Sling, Fubo,
NFL Network, Spotify, Pandora, iHeartRadio, SiriusXM, Audacy, Amazon Music, TuneIn.

Verified: 40 plates, 40 inline SVGs, **0 images, 0 external requests**.

Edit the list, colours and types in `PROVIDERS` at the bottom of `index.html`.

---

## The PDF

I ran your full flow on the deployed Render page in your browser. **It completed** —
Playbook built, PDF downloaded, no error. `/api/playbook` returns `200
application/pdf`, CORS is `*`, health reports `ai:true, cloudinary:true, ghl:true`.
Your deployment is correct.

**The cause is Render's free plan.** It sleeps after ~15 minutes idle. The next request
hangs 30–60s or returns 502 while the container boots — your `/api/recommendations`
took ~15 seconds when I tested it, which is a box waking up. The old code treated that
one failure as final and showed "Something went wrong building the PDF" when the
server was simply still starting.

**Three layers of fix:**

1. **Retries.** Both `/api/lead` and `/api/playbook` now retry 4 times with backoff
   (1.2s, 2.3s, 4.3s) on network errors and 408/429/500/502/503/504/522/524. A 400 or
   404 still fails fast — those won't fix themselves.
2. **Warm-up.** Clicking *Build my Playbook* pings `/api/health` immediately, so the
   instance is awake while the visitor reads their quote.
3. **`KEEP_WARM` (new, opt-in).** Set `KEEP_WARM=true` on Render and the app pings its
   own health endpoint every 10 minutes so it never sleeps. **This is the one that
   actually removes the problem.**

   Trade-off: an always-on free service uses ~730 of your 750 monthly free
   instance-hours, so only run one this way. A paid instance, or a free external
   pinger like UptimeRobot, does the same job without that ceiling.

**Verified:** with `/api/lead` forced to 502 twice, the PDF is still delivered on the
third attempt. With the backend genuinely unreachable, the visitor gets an honest
message telling them to try again shortly — no phone number, `sales@smart1marketing.com`
as the fallback.

---

## To deploy

- `index.html` — the marquee and the retry logic
- `server.js` — the `KEEP_WARM` option
- Set **`KEEP_WARM=true`** in the Render dashboard

---

## Tests

| | |
|---|---|
| Your file vs my last delivery | Identical — nothing of yours overwritten |
| v4 changes scoped to | Marquee block + submit path only |
| Marquee | 40 plates, 0 images, 0 external requests |
| Cold start (2 forced 502s) | PDF delivered on attempt 3 |
| Backend fully dead | Honest error, no phone number |
| Pricing / funnel / podcasts / football / goal post | All still correct |
| Mobile 320 / 375 / 390 | No overflow, no small tap targets, PDF downloads |
| JS errors | None |
