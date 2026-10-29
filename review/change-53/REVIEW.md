# change 53 — the salon door reads as a salon (adversarial review)

Brief (David, approved strings): `/go?…&preset=salon&demo=1` is what the
Client-mode tablet opens for salons and med spas — a threading/brow salon
saw `Filler` as the first job, `Booked · Danielle R. / Filler +$340` on the
owner card, and `Serves 25 miles`. Make the salon preset read for hair,
brow and lash, nail salons, still fine for a med spa. Minimal; no other
preset touched. Repro: `REPRO.md`.

## 1. Requirements, measured

Clean arm: build `g2GotzpvbsVmWSN1oSXeT`, `next start -p 3311`, Chromium.
HEAD arm: build `rS5H1B18LkpYLoJNxi_NU`.

| requirement | HEAD | change 53 |
|---|---|---|
| salon jobs | `Filler, Color, Facial, Lash fill, Something else` | `Color, Cut and style, Brows and lashes, Facial or skin, Something else` |
| owner sample card | `Danielle R. / Filler / +$340` | `Danielle R. / Color / +$140` |
| service-area line | `Serves 25 miles` (2 in SSR) | absent (0 in SSR, `[data-go-radius]` not rendered) |
| `Filler` anywhere in served salon /go | 4 | 0 |
| every chip has its drawn glyph (gate 223) | — | 5/5, `Cut and style` = new `scissors` glyph |
| other presets unchanged | — | home/dental/other data untouched; 221/223 green for all |

Before/after: `before-go-390.png`, `before-go-800.png`, `before-go-*-jobs.png`;
`after-go-390.png`, `after-go-800.png`, `after-go-*-jobs.png`.

## 2. Strings and data changed (lib/client.config.ts, salon preset only)

| field | before | after |
|---|---|---|
| `GO_COPY.jobs.salon` | Filler, Color, Facial, Lash fill, Something else | Color, Cut and style, Brows and lashes, Facial or skin, Something else |
| `ticket / recovered / lost` | 340 / 1360 / 4080 | 140 / 410 / 1680 |
| `sinceRecovered` | 9240 | 3720 |
| `radius` | 25 | `null` (type now `number \| null`) |
| caught[0] | Thu 2:00 with Marisa · filler — 340 | Thu 2:00 with Marisa · color — 140 |
| caught[1] | Tue 11:00 with Marisa · color — 260 | Tue 11:00 with Marisa · haircut — 85 |
| caught[2] | Sat 9:30 with Priya · facial — 380 | Sat 9:30 with Priya · brows — 65 |
| caught[3] | Wed 4:15 with Marisa · lash fill — 380 | Wed 4:15 with Marisa · facial — 120 |
| thread[1] | Yes please. Looking for filler, sometime next week. | Yes please. Looking for color, sometime next week. |
| `JOB_GLYPH` | Filler→syringe, Facial→face, Lash fill→lash | Cut and style→scissors, Brows and lashes→lash, Facial or skin→face (Color→dye kept) |

All stored, none derived (CLAUDE.md data note). Arithmetic held by hand:
140+85+65+120 = 410 = recovered; 12×140 = 1680 = lost.

Code outside config, each forced by a requirement:
- `lib/go-params.ts` `proofFor`: `radius` is `null` when the preset stores none.
- `app/go/GoCard.tsx`: `GoProof.radius: string | null`; the radius `<p>` renders only when present.
- `app/go/glyphs.tsx`: new `scissors` glyph (gate 223 holds every job to a drawn glyph).

## 3. Deviations from the brief, with arithmetic

- **Gate 32 now starts from home, not salon.** Its claim needs a pair whose
  target's opening value (recovered − caught[0]) is below the source's final.
  Salon's final is now 410; every other opening is higher (home 4250−850=3400,
  dental 1800−600=1200, other 750−250=500), so *any* correct switch out of salon
  climbs — the gate went red (`series [410, 686, …, 1200]`) on real data, exactly
  the case its own comment describes for home. It now loads `/?biz=home`
  (final 4250) and switches to dental (1200 < 4250). Claim unchanged.
- **Brief example "Brows and lashes" kept for the chip; caught[2] detail says
  "brows"**, and caught[1] says "haircut" not "cut and style": the change-27
  rule is that caught details stay short for 390 fit (old max was 32 chars,
  `Wed 4:15 with Marisa · lash fill`; `Sat 9:30 with Priya · brows and lashes`
  would be 38).

## 4. Defects found in this change's own work

- My first full-suite "baseline" was contaminated: `gate-go.mjs` and
  `gate-owner.mjs` are imported late in `gate.mjs`, and I edited config while it
  ran, so 221/223/227/230/231 read the NEW config against the HEAD build. Those
  reds are not HEAD defects; they are discarded. `gate.mjs`'s own expectations
  were parsed at start (old config), so its reds stand as HEAD readings.
- A stale `next-server` (PID 16519, reparented to init) survived the first
  stop and answered the after-arm's first curl with the HEAD build (`Filler`=4,
  no new BUILD_ID) while the new server died on `EADDRINUSE`. Caught by the
  BUILD_ID discriminator; killed by PID, rerun.
- `syringe` glyph is now unused (left in `glyphs.tsx`; dead but harmless).

## 5. Derived-constant table (rule 7)

| site | what | verdict |
|---|---|---|
| gate 261 `SALON_JOB_COUNT = 5` | pre-registered count guard | deliberate — not read from config, so a shrinking list or dead selector is red |
| gate 261 `FORBIDDEN` | `/\bfiller\b/i`, `/\bmiles?\b/i` | deliberate — independent of config, so a config revert cannot move it |
| gate 261 ticket | read from the salon block in config | correct |
| gate 32 `?biz=home`, panel 2 | the source/target pair | deliberate, arithmetic in §3 |
No integer offsets added to any rect.

## 6. Probe table (rule 2) — clean arm green first (221/223/261 PASS)

Each probe mutates the BUILD; the source is reverted before the gates read config.

| probe | reintroduces | required | result |
|---|---|---|---|
| m1-filler | old salon job list | 261 FAIL | FAIL (jobs, FORBIDDEN filler, sample "Filler"); 223 also FAIL |
| m2-radius | `proofFor` renders `Serves 25 miles` for a null radius | 221 + 261 FAIL | both FAIL |
| m3-ticket | salon ticket 340 | 261 FAIL | FAIL (`+$340` want `+$140`) |
| m4-accent (**inverted**) | salon accent #E8A0B4 → #00FF00 (not a requirement) | 221/223/261 PASS | all PASS (discriminator confirmed #00FF00 served) |

Each probe arm printed its own BUILD_ID served and a Filler/miles/accent
discriminator that differed from the clean arm as expected.

## 7. Blast radius

Full `scripts/gate.mjs` (with go/live/owner modules), `GATE_ALLOW_NO_WEBKIT=1`.
Final clean arm (build `g2GotzpvbsVmWSN1oSXeT`): **205 PASS, 17 RED**, every red
environmental (log: `gate-full-final.log`). Gate 32 PASS (`series [4250 … 1200]`,
peak 4250 ≤ 4250); 221, 223, 261 PASS. Reds, attributed:
- 46, 91, 93, 95, 194, 196, 197, 201, 205, 206, 256, 260 — WebKit not installed here.
- 213–216 — "not reached — unknown error", red at HEAD too (WebKit block).
- 233 — Lighthouse not installed.
- 89 — audio beat jitter, red at HEAD (54ms vs 50ms) and green after: timing noise.
- `eslint` 2 errors in `GoCard.tsx` (react-hooks/set-state-in-effect) — same 2 at HEAD.

## 8. Standing risks / unmeasured

- No WebKit, no Lighthouse, no real iPhone here; Chromium only.
- Shared /go copy not in the salon preset still reads trade-ish for a salon:
  `Send a photo for a quote`, `smsBody` "I need help with a job.", and the QR
  kit (`Truck decal`, `Yard sign`, "Put it on the truck…") — shared by every
  preset, so changing them per preset is its own change.
- `bizName` "Harbor Row Aesthetics" (shown only when no `biz=` is given, and in
  the main demo) stays; it reads med-spa but is not wrong for brow/lash/skin.
- Dental also stores `radius: 25` though patients come to it — not touched (out of scope).

## 9. Money path

Not touched: Stripe, `app/start`, `/api/*`, `COPY.price`, `LIVE_COPY`. Files
touched: `lib/client.config.ts`, `lib/go-params.ts`, `app/go/GoCard.tsx`,
`app/go/glyphs.tsx`, `scripts/gate-go.mjs`, `scripts/gate.mjs`, `review/change-53/*`.
DEMO_LINE / goTel (804) 495-3492 unchanged.

## 10. Outstanding

- Per-preset overrides for the shared trade strings in §8.
- Dental `radius`.
