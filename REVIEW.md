# REVIEW.md

## Change 10 — adversarial review (3 lenses)

Run after all 52 numbered gates (1–39, 45–57) passed locally; confirmed
findings fixed before the change-10 commit. Each lens was an independent
reviewer over the change-10 diff plus the rendered beat frames.

### Lens 1 — "Does the first 4 seconds read as a real phone?"

| # | Finding | Verdict |
|---|---------|---------|
| 1 | Notch, status glyphs, and home indicator painted UNDER the opaque lock layer — the phone's physical chrome popped into existence at the 4.4s crossfade. | **Fixed.** Notch and home indicator raised above the lock layer; signal/wifi/battery glyphs now render on the lock screen itself (top-right, no small time — the big clock is the clock). |
| 2 | Lock clock + Decline/Accept is a hybrid of two iOS states that never coexist (locked iOS shows slide-to-answer; the button pair belongs to the unlocked call UI). | **Dismissed.** The A2 spec mandates exactly this composition (time large centered top, date line, Decline/Accept round buttons). A spec change is the owner's call; flagged here. |
| 3 | Missed Call state was a bare title card on an empty dimmed screen — no clock, no chrome. | **Fixed (within spec).** The clock/date no longer collapse with the call UI; the missed state lands beneath a standing lock clock with chrome intact. The centered missedLabel + callerName composition itself is A2-mandated and kept. |
| 4 | Clock hierarchy was iOS-15-era and half-size (44px, date below); "INCOMING CALL" letterspaced uppercase; raw number where iOS shows "mobile". | **Fixed** (date above a 64px semibold clock; sentence-case untracked "Incoming call"). The callerNumber line is **kept** — A2 names it explicitly. |
| 5 | Decline/Accept colors were near-miss brand-tinted (#E8514D/#33C558) with brand-muted labels. | **Fixed.** Exact system palette #FF3B30 / #34C759, white labels. |

Also noted: the "N" badge in review screenshots is the Next.js dev overlay —
absent from production builds.

### Lens 2 — "Can a shared link render the wrong name or preset?"

| # | Finding | Verdict |
|---|---------|---------|
| 1 | Share clicked inside the 150ms name debounce copied a stale/missing `&name=`. | **Fixed.** `onShare` flushes the pending commit and builds the copied URL from the flushed value. |
| 2 | Replay clicked in a swap's first ~110ms cancelled the un-committed preset switch, leaving the URL naming a preset that never renders — permanently. | **Fixed.** `onReplay` now discards clicks during a swap, same policy as preset clicks. |
| 3 | Share clicked within ~110ms of a preset click copied the outgoing preset's id. | **Fixed.** `onShare` resolves the biz id from the in-flight transition target. |
| 4 | A debounce firing during a stalled swap wrote `?biz=<old>&name=<new>` to the URL. | **Fixed.** The debounce commit prefers the transition target's id. |

Traced clean by the reviewer: whitespace/overlong `&name=` (server and client
share `resolveName`), `+` vs `%20` (client never parses `location.search`),
back/forward (replaceState only), preset-click-clears-pending-debounce.

### Lens 3 — "Any second timer or transform-fighting element?"

| # | Finding | Verdict |
|---|---------|---------|
| 1 | `-translate-x-1/2` on the ledger notification card compiles (Tailwind v4) to the independent `translate` property, which COMPOSES with the engine's inline `transform` — the card landed double-shifted, ~half its width off the panel's centerline. | **Fixed.** Class removed; the engine owns the -50% X every frame, and an inline transform seed keeps the SSR state consistent. |
| 2 | The `[data-reveal]` 400ms reveal on the ledger wrapper multiplies with `paintFade` on the child panel if a preset swap lands within 400ms of the wrapper's first reveal — a transient double-dip of opacity. | **Dismissed.** Different elements, no property fight, both systems settle at 1; reviewer traced no deadlock in any ordering (reduced motion, no-JS, swap-while-pending). Cosmetic and self-resolving; the reveal stays per C5a. |

Traced clean: the 150ms name debounce and 2000ms share reset drive React
state only (no frames scheduled); the swap transition is stamped from the rAF
timestamp (same time base); the IntersectionObserver is event-driven, not a
clock; the shimmer overlay has a single writer and cannot stick mid-sweep.

## Change 11 — adversarial review (1 lens)

Lens: from t=0 to settled, is every element on the phone screen something the
CUSTOMER would see on HER phone?

| # | Finding | Verdict |
|---|---------|---------|
| 1 | The in-phone notification card was the OWNER's alert verbatim — Salvage app identity, ledger row content, owner framing — on the customer's screen. | **Fixed.** The phone instance is now the business's booking confirmation: Messages identity, sender = bizName, body `Booked · {detail} · ${amount}` (existing approved strings recomposed — no new copy). The owner's Salvage card is unchanged and lives only on the ledger side, where it belongs. Gate 51's retained assertions (bizName + amount inside the screen) still hold. |
| 2 | The card slid up from the bottom edge — no iOS push does that; it read as the owner's dashboard toast overlaid on her phone. | **Fixed.** It now slides down from the top inset, like the Messages banner before it. Gate 51 asserts in-screen containment, not edge, so no gate was weakened. |
| 3 | A typing indicator preceded bubble 0 — the same message the banner had already delivered. On her phone a banner means delivered. | **Fixed.** BEATS[0] = 0 (the auto-text is already in the thread when the crossfade lands), typing entry for bubble 0 removed, gate 12's expectation table updated (1 bubble visible at the first sample). |
| 4 | A latent TYPING entry for bubble 1 (her own message) could render a self-typing indicator if ever enabled. | **Fixed.** Deleted; TYPING now carries only the business's second message. |

Verified clean by the reviewer: bubble orientation (hers right/teal outgoing,
business left/gray incoming), typing indicator side, Delivered under her final
outgoing bubble, contact header identity, the call screen (nothing
owner-flavored), the banner's sender and content, and no owner-addressed copy
anywhere inside the phone.

## Change 12 — adversarial review (2 lenses)

Run after all 68 gates (64 asserted + 4 retired) passed locally; every
confirmed finding fixed and re-verified (measured, not assumed) before the
change-12 commit. Lens 1 tested in Playwright WebKit 26 and Chromium (CDP
touch); real-device-iOS-only behaviors are marked speculative.

### Lens 1 — "iOS Safari gesture fidelity: wrong axis, wrong section, or trapped?"

| # | Finding | Verdict |
|---|---------|---------|
| 1 | **Blocker.** The save-section stack (owner card + ledger) was `justify-center`ed inside a clipped panel: on short phones the overflow spilled ABOVE the reachable origin — at 320x568 the owner card was 0px visible at any scroll position, at 375x667 (iPhone SE class) 50 of 81px hidden. The flat `zoom: 0.8` valve was not enough. | **Fixed.** Auto margins replace `justify-center` (center when fitting, clamp to the reachable top edge when not), and the zoom valve became a ladder (0.8/0.72/0.64/0.55 at 820/750/680/600px heights). Measured after: card fully visible with 0 hidden px at 320x568, 360x640, 375x667, 414x736, and 390x844. |
| 2 | The track was accidentally a VERTICAL scroller: bare `overflow-x: auto` forces used `overflow-y: auto`, so any y-overflow latched vertical swipes into invisible scroll instead of paging. | **Fixed.** `overflow-y: clip` declared (computes to `hidden` next to `auto` per spec — still not user-scrollable), and the finding-1 fix removes the y-overflow itself: measured `scrollHeight - clientHeight === 0` at all five sizes. Desktop save keeps `overflow: visible` (the floating card lives above the column top). |
| 3 | The rotate guard fired when an in-app browser's keyboard squashed the layout viewport (375x349 matches `landscape + max-height:500px`) — tap the name field in the Facebook browser, the app vanishes. | **Fixed.** Added `(min-aspect-ratio: 3/2)` to the guard query. Measured: 844x390 still guards (gate 48 green), 375x349 no longer does. |
| 4 | No `100vh` fallback under `100dvh`: on iOS 15.0–15.3 the pager collapsed to auto height inside `overflow:hidden` — a total scroll dead-lock. | **Fixed.** `height: 100vh` fallback line before every `100dvh` (pager, sections, both device caps). |
| 5 | `container-type`/`cqh` (iOS 16+) had no fallback: on iOS 15 the section-2 phone became a ~607px clipped slab in a 335px panel. | **Fixed.** A `vh`-based `max-width` fallback line precedes the `cqh` one. |
| 6 | Cosmetic: 4–6px of the owner card's corners shaved by the track clip even at 390x844. | **Fixed** by finding 1's clamp (card top now rests exactly at the track edge). |

Speculative, accepted as floor (no code change): iOS 15–16 nested-snap
fling-through quirks; touch-down during track momentum latching one gesture;
a hard fling crossing the middle preset panel (the queue chains it to the
resting panel — worst case a transient double counter-roll). Traced clean:
no hijack-capable listeners anywhere (keydown ignores form fields and only
prevents keys it handles); axis routing under touch and wheel; snap
re-settle in WebKit; rotate-guard display:none round-trip preserves pager,
track, and preset state; `touch-action` audit found no dead zones; `100dvh`
is stable because html/body never scroll (no URL-bar churn, so the 0.6 IO
threshold cannot mis-fire).

### Lens 2 — "Can the track, the URL, and the rendered preset disagree?"

| # | Finding | Verdict |
|---|---------|---------|
| 1 | Resize (rotate) during a smooth dot-scroll stranded the track at a NON-snap pixel offset (scrollLeft kept in px while panel widths moved), silently switching the preset to whatever panel the stale target landed in — measured resting at 700px with snap points 0/860/1720, a salon sliver beside home, for 3+ seconds. | **Fixed.** A window `resize` listener re-snaps the track to the authoritative preset (`pending ?? transition target ?? current`). Measured after: mid-scroll resize settles ON a snap point with URL, rendered name, and track agreeing. Also covers the reviewer's speculative real-iOS rotate case defensively. |
| 2 | Every non-salon deep link killed the "Swipe to change trade" cue before the visitor saw it: the mount effect's programmatic track positioning fired the async scroll event that tripped the `{once:true}` dismiss listener — and shared `?biz=` links are exactly the audience the cue teaches. | **Fixed.** The cue-dismiss listeners attach two rAFs after mount, past the initial programmatic scroll's dispatch. Measured: `?biz=dental` shows the cue with the track resting on panel 2. |
| 3 | No-JS floor: on a deep link the SSR dots mark the preset's panel while the track visually rests at panel 0 (scroll position cannot be expressed without JS). | **Dismissed.** The no-JS floor renders the correct PRESET in every section; the dots honestly mark the intended panel, and seeding them to 0 instead would make the (hydrated) common case wrong during the pre-scroll frame. Accepted as the floor. |
| 4 | A second ArrowRight inside the smooth scroll was swallowed: `round(scrollLeft/width)` read the mid-flight position and re-derived the origin panel. | **Fixed.** The keyboard handler advances from its pending target (800ms window) instead of the instantaneous scrollLeft. Measured: two presses 40ms apart land panel 2, URL `?biz=dental`. |
| 5 | The URL leads the render by ~600ms inside the queued-transition window (rapid snap salon→home→dental). | **Dismissed (by design).** Only section 3 is on screen during the window and its panels are per-preset static; Share and the name debounce both resolve through `pendingPresetId`, so no wrong link can escape it. Documented, not hidden. |
| S2 | (Speculative) A React commit stalled past the roll's end would park the counters computed from the stale preset. | **Fixed anyway** — the `[preset]` layout effect re-runs `park()` when the engine is armed with no transition, so a late commit repaints the parked frame. |

Traced clean by the reviewer (Chromium + WebKit + Firefox): deep-link init
order (scroll before observers; guard absorbs the initial IO refire; reduced
motion still positions the track); plain resizes preserving panel, URL, and
a typed name; the rapid-snap queue including A→B→A return; dot jumps across
an intermediate panel chaining correctly; name debounce and Share during
queued transitions; playback re-arm on preset switch and fresh restart on
returning to section 1.
