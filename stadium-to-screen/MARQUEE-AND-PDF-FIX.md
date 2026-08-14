# Round 4 — the grey blocks and the PDF error

## Both problems diagnosed on your live site

I opened `blueprint-2.onrender.com` in your browser and inspected it directly.

---

## 1. The grey blocks

```
Hulu: 0x0  step0
Amazon Prime Video: 0x0  step0
YouTube TV: 0x0  step0   ...
```

`naturalWidth = 0` on every logo, and `step0` means the error handler **never
fired**. The images weren't loading *and* weren't falling back — they sat there as
empty boxes, and the white CSS filter I'd applied turned twenty empty boxes into
featureless grey rectangles. `loading="lazy"` inside a horizontally-scrolling track
meant the browser never even attempted most of them.

**Fixed by removing the dependency entirely.** The marquee now fetches nothing. Each
provider is a self-contained SVG name-plate:

- a **brand-coloured glyph** — a screen for video, a waveform for audio
- the **provider name** in white
- the **channel type** underneath, in that brand's colour

Twenty plates: Hulu, Amazon Prime Video, YouTube TV, Paramount+, Peacock, ESPN, Max,
Roku, Tubi, Pluto TV, Sling TV, Fubo, NFL Network, Spotify, Pandora, iHeartRadio,
SiriusXM, Audacy, Amazon Music, TuneIn.

Nothing to load, nothing to break, and you can read every network at a glance.
**Zero external requests** — verified.

Edit the list, colours and types in `PROVIDERS` at the bottom of `public/index.html`.

---

## 2. The PDF error

I ran the full flow on the deployed Render page. **It worked** — Playbook built, PDF
downloaded, no error. So the code was fine; the environment wasn't.

`/api/playbook` returns `200 application/pdf`, CORS is `*`, and `/api/health` reports
`ai:true, cloudinary:true, ghl:true`. Everything is deployed correctly.

**The cause is Render's free plan.** It spins the instance down after ~15 minutes
idle. The next request either hangs for 30–60 seconds or returns a 502/503 while the
container boots. Your `/api/recommendations` call took **~15 seconds** when I tested
it — that's a cold box waking up.

The old code treated that single failure as final: `/api/lead` threw, `/api/playbook`
threw for the same reason, and you got "Something went wrong building the PDF" when
in fact the server was simply still starting.

**Three fixes:**

1. **Both calls now retry** — 4 attempts with backoff (1.2s, 2.3s, 4.3s), on network
   errors and on 408/429/500/502/503/504/522/524. A 400 or 404 still fails fast,
   because those won't fix themselves.
2. **The backend is warmed early.** The moment someone clicks *Build my Playbook*, the
   page pings `/api/health`. By the time they've read the quote and filled the form,
   the instance is awake.
3. **The button says what's happening** — "Still working — waking the server…" instead
   of looking frozen.

**Verified:** with the lead endpoint forced to return 502 twice, the PDF is still
delivered on the third attempt. With the backend genuinely dead, the visitor gets an
honest message telling them to try again in a few seconds — no phone number, and
`sales@smart1marketing.com` as the fallback.

### Worth considering

Render's paid tier removes cold starts entirely. Failing that, a scheduled ping every
10 minutes keeps the instance warm. The retries handle it either way, but a first
visitor currently waits ~15 seconds for their audience to build, and some will leave
before it finishes.

---

## ⚠️ You've edited the deployed file

Comparing what's live against my copy, you've made changes I don't have:

- Scoreboard labels — *"Typical — fans who heard the full message"*, *"Illustrative
  cost of a new lead"*, *"Illustrative, on multi-screen 1-2 punch"* (good change, and
  safer to claim)
- Team hint — *"Type any of the loaded teams — city and stadium autofill."*
- Page title — *"Stadium to Screen — College & Pro Football Advertising | Smart 1 Marketing"*

**The file I'm sending does not contain those edits**, so dropping it in will revert
them. Two options: re-apply those three (about two minutes), or send me your current
`index.html` and I'll apply this round's changes on top of yours instead. I'd suggest
the second from here on — otherwise we'll keep overwriting each other.

---

## Tests

| | |
|---|---|
| Marquee | 40 plates, 40 inline SVGs, 0 images, 0 CDN requests |
| Cold start (2 forced 502s) | PDF still delivered on attempt 3 |
| Backend fully dead | Honest error, no phone number |
| Football / goal post | Unchanged from last round |
| Pricing, funnel, podcasts | All correct |
| Mobile 320 / 375 / 390 | No overflow, no small tap targets, PDF downloads |
| JS errors | None |
