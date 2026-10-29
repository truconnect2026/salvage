# DESIGN.md — Salvage design system (changes 43–48, depth revised in 51)

The bar: a Richmond HVAC owner, on an iPhone, in the Facebook browser, **does
something within 3 seconds**. Watching is failure. Touching is success. Every
section of `/` and `/go` must survive that test.

## 1. Type scale (both pages)

Faces are the ones the site loads, and only their loaded weights:
Newsreader 500, IBM Plex Sans 400/500, IBM Plex Mono 400 (Andy, v2 GO —
keeps change 18's `KEEP_BRAND_FONTS = false`).

| Role | Spec |
|---|---|
| display | Newsreader 500 — 44 / 48 / 56, −0.01em |
| headline | Newsreader 500 — 28 |
| label | IBM Plex Sans 500 — 17 |
| body | IBM Plex Sans 400 — 16 |
| caption | IBM Plex Sans 500 — 13, +0.04em, uppercase |
| data | IBM Plex Mono 400, tabular — 20 and 28 (`[data-figure="data"]`) |

- No size outside this table on a surface built from change 43 on.
- Money gained (recovered, a booked ticket) is **gold**. Money lost is
  **ember** (change 18) — never gold, never gray.

## 2. Motion

- Entrance: 480ms, `cubic-bezier(.22, 1, .36, 1)`.
- Press: 120ms.
- Slider spring: stiffness 420, damping 34, mass 1.
- Nothing runs longer than 600ms except phase-driven sequences (the s1 call).
- Reduced motion = the state changes, nothing travels.
- **One transform owner per element. One rAF loop per page.**

## 3. Surface

- Ground: abyss (`--color-abyss` #060B14).
- Regions are separated by **one** hairline rule: ink at 14%
  (`color-mix(in srgb, var(--color-ink) 14%, transparent)`).
- **One** lifted surface — `--color-surface` (#0F1E33) — for the phone and
  the sheet only.
- No stacked cards.

## 4. Accent discipline

- Trade accent: on the **active instrument only**.
- Gold: on **money gained only**.
- Teal: on **controls only**.
- Every change's review in REVIEW.md counts accent uses per section.

## 5. Forbidden

Gradients, glows, particles, blur cards, emoji, icon libraries, Tailwind
default radii and shadows, centered-everything, fake stats, fake reviews, fake
names beyond the stored presets, and any copy not in `lib/client.config.ts`.
Hand-drawn inline SVG only. Existing tokens and fonts only.

## 6. Known gaps in already-shipped code

Not rewritten by this file; each change that touches one of these says so in
its review.

1. **Hairline.** Older surfaces rule with `--color-line` (#22384F), not ink
   at 14% (≈ #26303B on abyss).
2. **Blur cards.** The demo's iOS banners use `backdrop-filter: blur(16px)`
   — the device's own look.
3. **Gradients.** `components/Phone.tsx` draws the titanium rim, the call
   screen ground and the glass streak with gradients.
4. **Default radii.** Shipped code uses Tailwind's `rounded-full`,
   `rounded-2xl` and friends.

## 7. Change 51: depth (Andy, Oct 28: "attractive, presentable, something worth spending money on")

The flat, hairline-only /go and /start read as a wireframe on the Fire and on
a phone. §3 and §5 are revised for **/go and /start only** (/ is unchanged):

- **Lifted cards.** Every /go slot, the proof row, the /start offer and form
  are one surface recipe: `--go-card` (surface-2 → surface, top to bottom),
  an ink-10% edge, a 1px inner top highlight, a soft drop shadow. Radius 20
  (slots), 22 (the band), 24 (/start cards).
- **Ground light.** The page ground carries two faint radial washes: the
  preset's accent at the top, teal at the bottom right. Nothing else glows.
- **The band stays the one accent fill** (gate 218): `background-color` is
  the accent; a white-to-clear sheen sits on top as `background-image`.
- **Glyphs** sit in a teal-tinted rounded tile; the stroke stays full ink
  (gate 217).
- **Status** is a pill with a live dot (teal-bright when open).
- **/start:** the first price line is the headline (Newsreader 28), the rest
  carry a drawn tick; dollar figures are gold; the agreement is muted 14px;
  "I agree" is a full-width row; Pay is a full-width gold button; fields are
  filled, rounded, with a teal focus ring; the EIN answer is two choice tiles.
- Still forbidden: particles, blur cards outside the device, emoji, icon
  libraries, new copy.

## 8. Change 54: the shop owner's side (David, Oct 29: "make their side look as good as you can")

- **/go identity** is two rows: the name, then the dial with the trade and the
  status pill stacked beside it.
- **/go actions:** Book (primary), Text and Call as a tile pair, then the photo
  slot and Save our number as two 76px rows in one lifted surface — a
  shop-specific photo label gets a full line.
- **The sheet** speaks §7: 24px top radius; job, day and time chips, fields
  and the fast path are rounded and faintly filled; an odd last job spans the
  row; the one action is a filled teal control.
- **/start:** the Salvage mark and the /go folio line over the name; the
  agreement in a hairline frame; drawn checkbox and radios; Pay waits as a
  gold outline until "I agree", then fills; a 480ms staggered rise.
- **Tap targets:** every link, button, field and choice row on /go and /start
  is at least 44x44 (gate 263), the legal links included.
- Column: /go is 520 wide below 700px (was 460), 580 above.
