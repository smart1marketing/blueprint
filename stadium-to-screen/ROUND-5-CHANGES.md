# Round 5

## The PDF report

**Matched media plan formatting** — the lists were being pushed into a fixed 170pt
right-hand column with a hard 19pt row step, so anything longer than one line wrote
straight over the next row. That's the overlapping text in your screenshot. Lists now
wrap as **brand-coloured chips** across the full width and the block grows to fit —
which also gives you the visual treatment you asked for, without depending on any
external logo files.

**"Your plan" was truncating** to *"Streaming Audio · Loc…"*. It now shrinks the type
to fit instead of clipping.

**Rate card** — audio **$24 CPM**, CTV **$32 CPM**, "Both" a blended **$28** because the
budget splits across the two. Was a flat $20 for everything. One place: `CPM` in `lib/pdf.js`.

**"Why this beats a game-day buy"** is now three side-by-side blocks instead of bullets,
with the middle one accented.

Also: every mention of **cost per acquisition** removed; **"unskippable"** → **"premium"**;
**"During the game"** → **"Game Day"**, with *"Game Day placements are subject to inventory
available in your market at the time of booking"*; step 4 of next steps is now **"You get one
clear monthly report on the program."**; footer is **"Smart 1 Marketing · smart1marketing.com ·
Stadium Marketing Plan"** with **no phone number**.

## The landing page and quote

- **Step 5 · Where should we send it** — company name and work email now sit in the
  builder, before the Build button
- **Partial lead fires on Build.** Company, email, team, scope, focus and plan go to
  GoHighLevel the moment they build — so an abandoned session is a lead instead of
  nothing. Both fields carry through and pre-fill the download form so nobody types
  twice
- "Podcasts we'd put you on" → **"Podcasts we are targeting"**
- Cost Per Acquisition tile removed from the scoreboard
- "unskippable" gone from both CTV pillars and the plan description — now "premium"
- "During the game" → **"Game Day"**, with the inventory disclaimer underneath
- Footer phone number removed, "Directional media plan" → **"Stadium Marketing Plan"**
- Same for the on-screen report footer
- **Talk to a strategist** opens the consult page in a new tab
- Loading copy → **"Calling the plays to the server…"**, then *"Still calling — the server
  is warming up…"*, then *"Almost there — hang tight…"*
- Error copy → **"Delay of game. We have to call a new play in.** Your details are saved —
  wait a few seconds and press the button again, or email sales@smart1marketing.com and
  we'll send it straight over."

## Why waiting still didn't get you a PDF

Two reasons, both fixed.

**1. The retry budget was far too short.** I set it to 4 attempts at 1.2s / 2.3s / 4.3s —
about **8 seconds total**. A Render cold boot takes **30–60 seconds**. So the retries were
all spent while the container was still starting, and by the time you waited and looked,
the code had already given up. Now **6 retries over ~77 seconds**: 2s, 5s, 10s, 15s, 20s,
25s. Tested against four consecutive 502s — the PDF is still delivered.

**2. The widget runs in an iframe on your site.** Sandboxed frames routinely block
programmatic downloads and `blob:` URLs, which would stop the file even when the server
returned it perfectly. When the page detects it's framed and Cloudinary gave us a hosted
URL, it now uses that URL and opens it in a new tab instead of forcing a blob download.
Cloudinary is already on for you, so this path is live.

**Still worth doing:** set `KEEP_WARM=true` on Render. The retries make cold starts
survivable; keeping the box awake makes them stop happening. A first visitor currently
waits up to a minute, and most won't.

## Tests

| | |
|---|---|
| Step 5 fields | Present, captured, pre-filled into the download form |
| Partial lead on Build | company + email + team + scope + focus sent |
| 4 consecutive 502s (~32s) | PDF still delivered on attempt 5 |
| Media plan | Chips wrap, no overlap, brand colours |
| "Your plan" | No longer truncated |
| CPA / unskippable / phone | None anywhere, page or PDF |
| Game Day + inventory note | Present in both |
| Consult link | Opens in a new tab |
| Mobile 320 / 375 / 390 | No overflow, no small tap targets, PDF downloads |
| JS errors | None |
