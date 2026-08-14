# Quoting tool — round 2

Your page structure, design and copy are otherwise untouched. Everything below is the tool,
plus the four page-level items you asked for.

---

## Pricing — now a single table

| | Local | Regional | National |
|---|---|---|---|
| **Audio** | $2,500 | $4,500 | $6,500 |
| **CTV** | $2,900 | $4,800 | $7,500 |
| **Both** | $4,000 | $7,500 | $10,000 |

Price is driven by **channel focus × targeting scope** and updates the moment either changes —
which fixes "when I click the $2,500/month it does not translate to below." The quote shows
your selected price *and* the other two reaches side by side, so there's no hidden ladder.
Both is a first-class option, priced properly.

Nine numbers, one place: `PRICING` near the top of the builder script, mirrored in `lib/pdf.js`.

**The $6,000 plan no longer carves out $2,000 for Venue Replay** — that line is gone from the
page and the PDF.

---

## Removed

- The whole **"Two products. Four ways to play."** packages section, plus its nav link
- The **Ohio State / Georgia / Texas / Alabama** quick-pick chips
- Every **"AI-matched" / "AI-generated"** label
- **"a strategist follows up once"**
- The **phone number in the error message** — it now points to `sales@smart1marketing.com`

"Build your proposal" is **Build your Playbook** everywhere — nav, hero, button, section head.

---

## Audience

**Fan-home penetration was far too low.** 20% of a home market being football-fan homes badly
understates an NFL or major-college market. Raised to:

| | Old | New |
|---|---|---|
| Local | 20% | **55%** |
| Regional | 8% | **32%** |
| National | 3% | **8%** |

Cincinnati local now reads 940,000 homes → **517,000** fan homes → 444,620 reachable →
1,809,604 screens. Still narrows at every step.

Every audience block carries an **ESTIMATED AUDIENCES** flag and a one-line note that these are
planning estimates, not guaranteed delivery. Same in the PDF header.

Edit the three numbers in `FAN_PENETRATION` — one place, and the PDF follows.

---

## Media

**Where your ads will run** now shows **exactly 6 logos**, then *"plus 32 other premium audio
networks."* (6 + 32 = your 38.) This is now **our fixed inventory**, not an AI guess, so it's
always correct:

- Audio: Spotify, Pandora, iHeartRadio, **SiriusXM**, Audacy, Amazon Music
- CTV: Hulu, **Amazon Prime Video**, YouTube TV, Paramount+, Peacock, ESPN
- Both: Hulu, Amazon Prime Video, YouTube TV, Spotify, iHeartRadio, SiriusXM

**Podcasts** show **4 samples**, local/team first, then *"plus 29 other premium sports podcast
networks."* (4 + 29 = your 33.)

Lists live in `INVENTORY`; the counts in `INVENTORY_TOTALS`. I left the CTV total as `null`
because you didn't give me a number — set it and it'll print "plus N" the same way.

---

## Why this is different

New block above the form, and a matching section in the PDF:

> Most football advertising is one of two mistakes: **buying game day only** — one spot, one
> moment, gone — or **running all day every day**, paying to reach people who will never buy.
> We do neither.
>
> **Before the game** — they're planning. Pre-game shows and sports talk while they decide where
> to eat, watch and spend. This is where intent gets formed.
> **During the game** — they're locked in. Unskippable video and audio in live coverage and
> halftime, your brand beside the thing they care about most.
> **After the game** — they're deciding. Recaps, Monday talk and the commute home, retargeting
> the same households while the weekend is still fresh.
>
> Same fans, three moments, three messages.

---

## Logo and football

The nav uses your hosted lockup. If that URL ever fails to load it falls back to the old drawn
wordmark rather than showing a broken image. The PDF fetches the PNG once at boot and uses it
in the header, falling back to the drawn mark on any network hiccup — set `LOGO_URL` on Render
to point somewhere else.

The hero football was a flat lens shape. It's now a proper prolate silhouette with pointed tips,
a full belly, white end stripes and four laces.

---

## The PDF error you hit

> *"Something went wrong building the PDF."*

Two things caused it, and both are fixed:

1. **`/api/lead` was rate-limited to 8 requests per 10 minutes per IP.** You've been testing it
   repeatedly, so you tripped it. A 429 threw, and the fallback endpoint didn't exist on the
   deployed server yet, so you got the error. Raised to **30**, and `/api/playbook` to **60**.
2. **`/api/playbook` only exists in the new `server.js`.** Until you deploy it, the fallback has
   nothing to fall back to.

**You need to deploy `server.js` and `lib/pdf.js`, not just `index.html`.** With only the HTML
updated, the primary path still works (the live server already returns the PDF inline) — but you
lose the safety net, and the pricing in the PDF will be the old fan-base tiers rather than your
new table.

---

## Test results

| | |
|---|---|
| Pricing matrix | All 9 combinations correct |
| Price ladder | $4,000 / $7,500 / $10,000 for Both, Local highlighted |
| Funnel | 940,000 → 517,000 → 444,620 → 1,809,604 |
| Fan homes | 55% of market |
| Inventory | Exactly 6 logos + "plus 32 other premium audio networks" |
| SiriusXM / Prime Video | Both present |
| Podcasts | 4 shown + "plus 29 other premium sports podcast networks" |
| Estimated Audiences flag | Present, page and PDF |
| Why-different block | Present, page and PDF |
| AI wording | None anywhere |
| Packages section / team chips | Gone |
| PDF | Downloads, 3 pages, Both/Local prices at $4,000 |
| JS errors | None |
