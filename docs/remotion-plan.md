# Remotion video pipeline — plan

Status: **plan only.** Nothing here is built. No dependency is added by this
document.

## Goal

Render the demo's playback (call → no answer → Messages save → owner
notification → ledger) as a short MP4 for Facebook, one file per preset, from
the same components and the same timeline the live page uses.

## Principles (from CLAUDE.md)

- **One timeline.** `lib/timeline.ts` is pure coordinates (seconds). A
  Remotion composition maps `frame / fps` to the same phase value the rAF
  engine feeds. No second set of beats.
- **No new copy.** Every string comes from `lib/client.config.ts`. Captions,
  titles, and end cards that need new text go to the owner for veto first.
- **Pricing is locked.** If the video shows pricing, it reads
  `COPY.close.priceLine` / `COPY.close.priceLine2` from config. It never restates it.
- **Stored data only.** `recovered` is read from the preset. No
  `ticket × callsCaught` math in the video.
- **Not in the Vercel build.** Remotion pulls a headless Chromium and ffmpeg.
  Same rule as Playwright today: keep it out of `package.json` dependencies.
- **Never deploy.** Rendered MP4s are review artifacts, not a deploy step.

## Layout

```
video/                     separate package, own package.json + lockfile
  remotion.config.ts
  src/Root.tsx             one <Composition> per preset id
  src/DemoVideo.tsx        wraps Phone + Ledger, drives phase from useCurrentFrame()
review/change-N/video/     rendered MP4s + poster frames for review
```

`video/` imports `components/Phone`, `components/Ledger`, `lib/timeline`, and
`lib/client.config` via a path alias. The root `tsconfig.json` and ESLint
config exclude `video/` so the app build does not see it.

## Steps

1. **Seam.** Confirm `Phone` and `Ledger` can render from a passed-in phase
   value with no rAF, timers, or `window` reads (gate 119 already forbids
   timers outside the engine). If they cannot, add a pure `phase` prop —
   behavior on the live page must not change.
2. **Composition.** 30 fps, duration = settled time (11.0 s per the timeline
   header) + hold. 1080×1350 (4:5, Facebook feed) first; 1080×1920 later if
   needed.
3. **Presets.** One composition per `PRESETS[].id`. Optional `name` input
   prop runs through `resolveName` (same 40-char cap as `&name=`).
4. **Fonts.** Load Cormorant + Inter the same way the app does; block render
   until loaded (`delayRender`) so frame 0 is not a fallback font.
5. **Render.** `npx remotion render` locally into `review/change-N/video/`.
   No CI render, no upload.

## Gates to add (rendered state, proven red on a mutated build)

- **Frame parity:** at t = 3.6, 4.4, 5.6, 10.0, 11.0 s, a Remotion still
  and a Playwright screenshot of the live page (same preset, same size)
  match within a pixel-diff budget. Mutation: shift one beat in the
  composition only → red.
- **Copy parity:** every visible string in sampled stills is present in
  `client.config.ts`. Mutation: hard-code one string → red.
- **Recovered parity:** the ledger amount in the final frame equals the
  preset's stored `recovered`. Mutation: compute it → red.
- **Isolation:** `package.json` has no `remotion` / `@remotion/*` entry;
  `next build` output is byte-identical with and without `video/`.

## Open questions for the owner

1. Aspect ratio(s): 4:5 feed, 9:16 Reels, or both?
2. Audio: silent (captions only), a ring tone, or music? Licensing?
3. End card: CTA text and whether pricing appears. Both need approved copy.
4. Remotion license: company use above the free-tier headcount needs a paid
   license — confirm before step 2.
5. Personalized renders (`name` per referral partner) or four stock files?
