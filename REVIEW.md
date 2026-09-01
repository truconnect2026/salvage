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
