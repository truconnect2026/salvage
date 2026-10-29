# change 54: the shop owner's side reads as their shop, and looks finished (adversarial review)

Brief (David, Oct 29: "make their side look as good as you can"): polish /go (the
shop's own demo door, shown on David's tablet) and /start (agree and pay), at
390x844, 601x962 (Fire) and 800x1280, for home (hvac, plumbing), salon, dental
and other. Fix the trade-sounding strings change 53 left shared (§8 there), per
preset. Leave the Stripe link and the payment flow alone. Repro: `REPRO.md`.

## 1. Requirements, measured

Clean arm: final build `s7njthca6R0F0FF8oQunf`, `next start -p 3311`, Chromium.
HEAD arm: commit 10768c1 in a worktree, build `XNk21jIaUQuNZ45oCyunO`, port 3312.

| requirement | HEAD | change 54 |
|---|---|---|
| salon photo slot | `Send a photo for a quote` | `Send a photo of the look you want` (gate 262) |
| dental photo slot | `Send a photo for a quote` | `Send your insurance card` |
| other photo slot | `Send a photo for a quote` | `Send a photo` |
| pre-filled text off the home door | `I need help with a job.` | per door (table §2) |
| no-name salon door | `Harbor Row Aesthetics` | `Harbor Row Salon` |
| no-name hvac door | `Ridgeline Plumbing` under HEATING AND AIR | `Ridgeline Heating and Air` |
| dental and other service radius | `Serves 25 miles` | not shown |
| trade words (quote, job, truck, yard, miles) on salon / dental / other doors | 2 / 3 / 3 hits | 0 / 0 / 0 |
| tap targets >= 44x44, /go + /start, 390/601/800 | Privacy 42x20, Terms 36x20 on both pages | 8/8 and 12/12 targets clear (gate 263) |
| sideways scroll at 390/601/800 | 0 | 0 |
| every text node >= 4.5:1 (gate 222) | pass | pass |
| Stripe link, payHref, AgreePay.tsx, /api/start | — | byte-identical (not in the diff) |

Note on the brief: it names "Cormorant + Inter". The repo loads Newsreader + IBM
Plex (DESIGN.md §1, change 18's `KEEP_BRAND_FONTS = false`); I kept the loaded
faces. No font was added or changed.

## 2. Strings changed (lib/client.config.ts)

New `GO_COPY.doors` (per preset) and `GO_COPY.defaultNames`. `go.quote`,
`go.smsBody`, `go.quoteDoneSub`, `go.qrCaption`, `go.kitPieces` moved into
`doors`. Home keeps every word it had.

| string | before (every door) | home | salon | dental | other |
|---|---|---|---|---|---|
| photo slot + sheet heading | Send a photo for a quote | unchanged | Send a photo of the look you want | Send your insurance card | Send a photo |
| photo done line | {biz} will text you a quote. | unchanged | {biz} will text you back. | {biz} will text you back. | {biz} will text you back. |
| pre-filled text | Hi {biz}, I need help with a job. | unchanged | Hi {biz}, I'd like to book an appointment. | Hi {biz}, I'd like to make an appointment. | Hi {biz}, I'd like to book a time. |
| QR caption | Put it on the truck, the door, and every invoice. | unchanged | Put it on the door, the mirror, and every receipt. | Put it on the door, the front desk, and every appointment card. | Put it on the door, the counter, and every receipt. |
| print kit | Truck decal, Yard sign, Invoice footer, Sticker | unchanged | Window sticker, Counter card, Mirror cling, Receipt footer | Window sticker, Front desk card, Appointment card, Receipt footer | Window sticker, Counter card, Receipt footer, Sticker |

Default name (no `biz=`), /go only:

| door | before | after |
|---|---|---|
| salon | Harbor Row Aesthetics | Harbor Row Salon |
| home, plumbing | Ridgeline Plumbing | unchanged |
| home, hvac | Ridgeline Plumbing | Ridgeline Heating and Air |
| home, electrical | Ridgeline Plumbing | Ridgeline Electric |
| home, roofing | Ridgeline Plumbing | Ridgeline Roofing |
| home, garage | Ridgeline Plumbing | Ridgeline Garage Doors |
| dental / other | Fairfield Dental / Your business | unchanged |

Data: `dental.radius` 25 → null, `other.radius` 25 → null. The demo's stored
`bizName` values are untouched, so `/` is unchanged.

No stats, testimonials or figures were added.

## 3. Design, before → after

Screenshots: `before-*.png` / `after-*.png`, the same URLs and viewports
(`go-{plumbing,hvac,salon,dental,other,salon-noname,hvac-noname}` and
`start-{plumbing,salon}` at 390/601/800, plus `-jobs`), and the after-only
interaction states `after-start-agreed-601.png`, `after-go-salon-601-{time,you,done}.png`,
`after-go-dental-601-photo.png`.

/go
- Identity: three stacked rows (name / dial + trade / status pill) → two. The
  trade and status sit beside the dial, so Book moves up 48px at 390.
- Actions: four identical half-width cards → Book, then a Text | Call pair, then
  the photo slot and Save as two 76px rows in one lifted surface with a
  hairline. The salon label wrapped to 3 lines in a 156px tile (measured);
  as a row it takes 2 lines at 390 and 1 at 601/800.
- Sheet: square hairline chips, days, slots, fields and an outlined Confirm →
  the §7 card language: 24px sheet radius, 14–18px rounded, faintly filled
  parts; the selected day fills teal-12%; the odd last job ("Something else")
  spans the row; Confirm, Send photo and Copy number are filled teal (teal =
  controls); the photo picker is a dashed drop frame.
- Column: 460 → 520 below 700px, so the Fire (601) gets 40px gutters, not 70.
- Owner phone fade starts at 82% (was 72%), so the gold ticket is not dimmed.
- Legal links are 44x44 targets.

/start
- New brand line over the name: the Salvage mark and "Missed-call recovery by
  Salvage", the same string /go's folio uses (GO_COPY.go.poweredBy). Nothing
  on the page said Salvage before. The trade pill moved under the name.
- The agreement sits in a hairline frame instead of floating as grey text.
- Native white checkbox and radios → drawn ones (teal fill and tick, teal ring
  and dot). Same inputs, names and values.
- Pay before "I agree": a 40%-opacity gold that read as mud → a gold outline
  with gold words, which reads as waiting. After: the same full gold button.
  The `pointer-events` contract is the same rule, unchanged.
- A 480ms staggered fade-in (opacity only, see §4); reduced motion: none.
- 72px top padding from 560px up; legal links are 44x44.

Accent counts (DESIGN §4): no new accent fills (gate 218 green on home and
salon, and with dental at #00FF00 in probe p4). Gold is still only on money and
Pay. Teal: the new uses are all controls (sheet CTA, selected day, checkbox,
radio).

## 4. Deviations from the brief, with the reasoning

- **other.radius → null**, which the brief did not list. Gate 262's trade-word
  list caught `Serves 25 miles` on the "any business" door, shown here as a pet
  groomer. A door for any business cannot claim a service area. It is one
  stored value, and the same fix the brief asked for on dental.
- **Dental photo slot is the insurance card, not a photo of the problem.** A
  dental office has no use for a quote photo. The insurance card is the photo a
  front desk actually asks for. It is 2 lines at 390, so it fits.
- **Fictional default names:** "Harbor Row Salon" and the Ridgeline trade names
  are new fictional names (DESIGN §5 forbids names beyond the stored presets).
  Each is the stored preset name with its trade word changed. They appear only
  when a link has no `biz=`. David's veto applies.
- **The QR kit strings are made per door, but no page renders a print kit.**
  The kit has been in config since change 50 and is used nowhere in `app/`.
  Gates cannot measure it, so it is data only until a page renders it.

## 5. Defects found in this change's own work

- **Gate 256 broke in Chromium, no-JS.** The first full suite showed
  `page.check: Timeout` on /start in Chromium (at HEAD, 256 only failed at
  `webkit.launch`). I reproduced it at HEAD and on this change behind the
  BUILD_ID discriminator: HEAD ok, this change "element is not stable". I
  bisected by injecting CSS through the stylesheet response (no-JS pages take
  no `addStyleTag`): removing the entrance animation fixed it every time; the
  pay press transform only did once, which I put down to chance. Fix: the
  /start entrance is opacity-only, and the press scale applies only once Pay is
  live. 256/258/260 then pass in Chromium (`gate-live-chromium.log`; WebKit is
  missing here, so Chromium stood in for its arm, as the log says).
- My first HEAD repro run read `ERR_CONNECTION_REFUSED` as "RED" on both gates:
  the worktree build had failed (Turbopack rejects a symlinked node_modules).
  I threw that reading away. The real HEAD run is `repro-head.log`, behind a
  discriminator.
- `lsof` cannot see listening sockets in this container, so my port guard first
  thought 3311 was free and the new server died on EADDRINUSE. The BUILD_ID
  guard refused to measure. It now uses `fuser`, and kills by PID only.
- Gate 263 went red on my own first pass: the legal links were 44px tall but
  36–42px wide. Fixed with min-width.

## 6. Derived constants

| site | what | verdict |
|---|---|---|
| 262 `DOORS[*].quote/sms`, `NO_NAME` | approved strings held in the gate | deliberate: independent of config, so reverting config is red (p1, p2) |
| 262 `FORBIDDEN_TRADE` | quote, job, truck, yard, miles | deliberate, pre-registered |
| 262 `DOOR_COUNT = 4` | count guard | deliberate |
| 263 `MIN_TAP = 44` | Apple HIG minimum, absolute | deliberate; the in-page literal is checked equal to it |
| 263 `GO_TARGETS = 8`, `START_TARGETS = 12` | count guards | deliberate: hvac demo door = emergency, book, text, call, photo, save, privacy, terms; /start = agree row, pay, 4 fields, select, 2 choice rows, submit, privacy, terms |

No integer offsets added to any measured rect.

## 7. Probe table (clean arm 18/18 green first, `gate-go-clean.log`)

Each probe mutates the build, the source is restored, and each probe log heads
with the BUILD_ID it measured.

| probe | reintroduces | required | result |
|---|---|---|---|
| p1-salonquote | salon photo slot back to "for a quote" | 262 FAIL | FAIL |
| p2-hvacname | hvac default name back to Ridgeline Plumbing | 262 FAIL | FAIL (`"Ridgeline Plumbing" want "Ridgeline Heating and Air"`) |
| p3-legaltap | legal links back to 20px tall | 263 FAIL | FAIL (`Privacy 44x20, Terms 44x20` on /go; /start untouched, stays clean) |
| p4-accent (**inverted**) | dental accent #7CC4E8 → #00FF00 (not a requirement) | 218/222/262/263 PASS | all PASS; served page carries #00FF00 |

## 8. Blast radius

- `gate-go.mjs`, final build: **18/18 PASS** (`gate-go-final.log`).
- Full `scripts/gate.mjs`, `GATE_ALLOW_NO_WEBKIT=1` (`gate-full.log`, run
  before the §5 fix): **207 PASS, 17 RED**. Attribution: 46, 91, 93, 95, 194,
  196, 197, 201, 205, 206, 260 are WebKit not installed; 213–216 are "not
  reached", red before change 53; 233 is Lighthouse not installed; 256 was
  this change, fixed in §5 and green in Chromium afterwards. 89 (audio jitter,
  red at change 53) is green.
- eslint: the same 2 `set-state-in-effect` errors in GoCard.tsx as HEAD. tsc
  is clean.

## 9. Standing risks / unmeasured

- No WebKit, no Lighthouse, no real iPhone or Fire here. All readings are
  Chromium. The Fire's Silk browser is Chromium-based, which is the closest
  match available.
- Only 390/601/800 portrait were swept for 263. 844x390 and 1440x900 still go
  through 207/217/222.
- The fictional default names need David's veto (§4).

## 10. Money path

Not touched: Stripe, `START_LINK`, `payHref`, `app/start/AgreePay.tsx`,
`/api/*`, `COPY.price`, `LIVE_COPY`. /start changed only in layout and CSS: the
brand line, wrappers, classes, and the pay button's look in its two states. The
`[data-start-agree]` pointer-events rule is the same.
Files touched: `lib/client.config.ts`, `lib/go-params.ts`, `app/go/page.tsx`,
`app/go/GoCard.tsx`, `app/start/page.tsx`, `app/globals.css`,
`scripts/gate-go.mjs`, `DESIGN.md`, `review/change-54/*`.

## 11. Outstanding

- A page that renders the print kit (QR + pieces), now that the strings are per door.
- /start takes `trade` but no `preset`, so a salon /start shows no line under the name.
