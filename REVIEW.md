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

## Change 17 — adversarial review (1 lens)

Lens: WebKit 26 at 390x844 and 375x667 (the closest available stand-in for
real iOS Safari on this machine — change-12 precedent; real-device behaviors
remain speculative). Anything overlapping, clipped, hidden, or visibly
not-iOS? Confirmed findings fixed and re-measured before the change-17
commit.

| # | Finding | Verdict |
|---|---------|---------|
| 1 | **WebKit legacy zoom inflated the mobile save-stack** — zoomed subtree rendered ~15% taller than design x factor at SE-class factors (2x at 0.33), clipping the ledger's last line below the fold at 375x667 and 320x568. | **Fixed.** The stack fit uses `transform: scale()` (geometrically exact in every engine) instead of `zoom`; measured within 1px of Chromium at 320/375/390/414 widths, last line 41-64px above the fold. |
| 2 | The Replay pill sat ON the device's bottom-left bezel corner at 375x667 (37px overlap) — the 140px section-1 reserve did not account for the control band on short viewports. | **Fixed.** Below 720px of height the device cap reserve grows to 220px; measured 0 intersection at 375x667 and 320x568. |
| 3 | The closing confirmation banner slides over the contact header. | **Traced clean** — that is exactly how an iOS banner behaves; no change. |

Traced clean in WebKit at both sizes: the six-button grid, nubs, notch,
status glyphs, two-line banner clamp, thread mask, "Today" marker, and
surface-3 bubbles; the design-scale screen zoom applies (0.73 / 0.56) with
the screen contained in the bezel.

## Change 18 — adversarial review (2 lenses)

### Lens 1 — "Does anything still read as a generic dashboard?"

| # | Finding | Verdict |
|---|---------|---------|
| 1 | **The accent slab painted OVER section-3's text** — flex `order` puts the phone wrapper last in paint order, so the full-height band covered the name field and tile labels. | **Fixed.** Slab and sonar carry `z-index: -1`; the device wrapper creates no stacking context, so both escape behind the section content. Re-measured: labels legible over the band. |
| 2 | The desktop headline ran three lines at 30px — B6 caps it at two at 1440. | **Fixed.** 26px at 1440 renders exactly 2 line boxes (measured). |
| 3 | Named as still-generic, accepted for now: the s2 sub-headline still floats like SaaS hero copy above the notify entry (change 19's comprehension copy reworks that block), and the share-fallback input keeps its 8px input radius (a control, inside gate 109's allowance). | **Documented.** |

### Lens 2 — "Do the sonar and split-flap derive from the single rAF phase?"

Mechanically held by gate 119 (zero timer/rAF tokens outside the engine
module; zero CSS animations on either component — probe AH proves the
detector) and gate 114's closed-form radius check. Walked by the reviewer:
the sonar paints in `paintScene(t)`; the flaps paint in the playback tick
(thread clock), the swap branch (the rAF-stamped transition clock), and
`park()` — every glyph and rotateX is a pure function of (clock, valueAt),
replayable from a single frame. The flap grid quantizes all flaps onto ONE
80ms grid (stagger offsets the sample point, not the grid), so a descending
roll can never compose a mid-flight reading above the value it rolls from —
the change-10 no-climb rule (gate 24) holds through the board. Honest
deviation: the brief's gate 114 sampled "two rings at t=1.9", but D1's own
coordinates (births 0.2/1.4/2.6, life 1.4s) leave one ring alive there; the
gate samples the two-alive claim inside a real overlap window (t≈1.5).

## Change 19 — adversarial review (1 lens)

Lens: state coherence across 4 presets × name × URL. Scripted walk in
Chromium (1440x900): deep link `?biz=other&name=Acme%20Repair` renders the
name on the phone header, the track resting on panel 3, the scroll-up
pointer, and the personal math line, with the URL untouched; snapping the
track 0→1→2→3→0 keeps URL, phone header, scroll-up pointer, math line, and
cleared name field in agreement at every rest (including the new fourth
panel); typing "Bay Windows LLC" rethreads the name through URL, header,
pointer, and personal math within the debounce; Share copies the exact
resting deep link. No findings — the change-12 queue/pending machinery
extends to four presets untouched, because every path is index- or
id-driven (`PRESETS.map`, IO-driven snap, `pending ?? transition ?? current`
resolution). Two notes for Andy: gate 36 retired (initialed names
legitimately compose ". ·"), and the "other" preset's three phone numbers
were invented to fill B3's third line — same fictional (804) 555-01XX
scheme as the approved rows; veto welcome.

## Change 20 — adversarial review (1 lens)

Lens: any teal inside the client's world? any accent leaking into DJL
chrome? The first half is mechanized by gate 134 (six computed color
properties scanned under every [data-client-world] subtree, all four
presets — the probe proves the detector by planting a teal share square
inside one). The second half was walked on the 4x5 contact sheet and the
desktop-s2 set: rail squares, caret, top-right cluster, focus rings, replay
border, the Salvage S mark, folio marks, gold money, and ember flaps all
hold their DJL colors under every preset. The accent vars are CONSUMED only
by client-world selectors, so a leak would need a markup change, and gate
120's census would flag accent-colored text outside a client-world subtree.

Teal moved out of the client's world (D): customer bubbles bg-teal →
iOS #34C759 (text white); the typing indicator's outgoing variant bg-teal →
#34C759 (dots white/60); sonar ring stroke teal → --accent; SALVAGED stamp
border/text teal/teal-bright → --accent; ledger row[0] left rule teal →
--accent. The name input's focus border, rail, cluster, and S mark were
already outside [data-client-world] and stay teal.

Contrast finals (gate 135, measured on rendered bubbles): salon
#E8A0B4/#1A0C12 9.16:1 · home #F0A044/#1A1206 8.66:1 · dental
#7CC4E8/#08161F 9.54:1 · other #9BB0C4/#0B131B 8.37:1 — all clear 4.5:1,
no accentInk darkening needed.

## Change 15 — adversarial review (1 lens)

Lens: is there ANY code path where audio is scheduled from a clock other
than the rAF phase, or where sound plays without a prior user gesture?
Confirmed findings fixed and re-measured before the change-15 commit.

| # | Finding | Verdict |
|---|---------|---------|
| 1 | **Beat pile-up after rAF starvation.** `crossed()` had no staleness bound while the phase is wall-clock based: backgrounding the tab mid-run and returning fired every gap-spanning beat at once — measured 3 rings + chime + haptic + land within 2ms of each other, ~10s late. | **Fixed.** Beats more than 250ms stale are dropped (`t - beat < 0.25`); the normal one-frame-late contract (~16ms, gate 89) is untouched. Re-measured: a 6s stall starting at t≈0.7 now yields exactly the pre-stall burst and the still-fresh land beat — stale beats and the haptic stay silent. |
| 2 | **Toggle OFF was not a silencer.** It only stopped FUTURE scheduling: an in-flight ring tail (~0.85s) kept sounding, and the AudioContext stayed running for the page's lifetime, holding audio hardware. | **Fixed.** All voices route through one master GainNode; OFF ramps it to zero in ~30ms (killing the tail) and then suspends the context; ON ramps back and resumes. The suspend rides an 80ms courtesy timeout — a UI cleanup, not an audio scheduler: no sound is ever *timed* by it. |
| 3 | Residual no-gesture hole on legacy UAs: a browser without `navigator.userActivation` (Firefox ≤111, Safari ≤16.3) whose user force-allowed autoplay could start a session-restored context running — both guards pass, sound with zero gestures on that page. | **Dismissed.** The spec's own gate 90 mandates this design (the restored context must exist suspended after reload); the hole needs a legacy browser AND a per-site autoplay override — a user who opted into sound twice. Documented, accepted. |
| 4 | Reduced-motion tap on the sound toggle created and resumed a context that can never sound (playback never runs there) — a resource hold, not a gesture violation. | **Fixed.** Under reduced motion the preference still toggles (the spec's "stays off until tapped") but no AudioContext is created or resumed. |

Traced clean by the reviewer: one clock ever (`when − currentTime` measured
0.0000 on all five voices — nothing is scheduled into the context's future,
so LOOP_UNTIL parking cannot strand a beat); no second scheduler repo-wide;
zero starts during "swap" frames; toggling ON mid-run is never retroactive;
replay spam structurally impossible (controls hidden until every voice has
ended); session restore consumes silently-crossed beats rather than
replaying them; the haptic rides only the chime crossing inside all guards;
the StrictMode context singleton held at one constructor call. Honest
limit: Playwright pre-grants user activation and allows autoplay, so
UA-level gesture suspension is asserted mechanically (gate 90 drives the
restored context into the suspended state a real browser hands over) and
reasoned for the legacy matrix, not measured on-device.

## Change 42 — adversarial review (1 lens)

Lens: can /go show a customer a wrong time, a wrong number, or someone
else's markup — and does the owner's money line ever come from math?

| # | Finding | Verdict |
|---|---------|---------|
| 1 | A 40-char name with no spaces set at the 26px floor with `overflow-wrap: anywhere` broke into THREE lines at 390 — gate 210 caught it on the first run. | **Fixed.** The fit reruns its binary search with breaks allowed (floor 14px) only when no size fits with normal wrapping. Gate 210 now holds 2 lines for both a spaced and a solid 200-char input. |
| 2 | Slot instants computed with the offset of "now" put every post-fall-back slot an hour early (7:00 AM shown for an 8:00 AM start). | **Prevented by construction, held by gate 209.** `etToUtc` settles the offset at the target instant in two passes; the mutation that uses `Date.now()`'s offset turns 209 red at 2026-11-01 01:30 EDT. |
| 3 | A reload with the sheet open restores `history.state.goSheet`; the next open then needs two Backs to close. | **Fixed.** Mount clears the stale flag with `replaceState`. |
| 4 | Every quote reopen leaked the previous preview's object URL. | **Fixed.** Revoked on reopen. |
| 5 | The fit script rendered inside a client component (React warns; it never runs on client renders). | **Fixed.** `FitName` is a server component passed into `GoCard` as a slot; GoCard re-calls `window.__goFit` after hydration. |
| 6 | CRLF injection via `?biz=%0D%0A...` into the .ics/.vcf. | **Traced clean.** Both builders escape `\n` per RFC 5545 / vCard 3.0 and fold at 75 octets; tel is a config constant; the sms body is `encodeURIComponent`. ref/lead are cut to `[\w.-]{0,64}` and only reach analytics. |
| 7 | The OG card could not live at `app/go/opengraph-image`: that convention receives params only, never the query, and a file-based og:image overrides `generateMetadata`. | **Deviation, documented.** Route handler at `/go/og`, wired from `generateMetadata` with the RESOLVED (sanitized, capped) values. |
| 8 | Live mode (biz set, no demo=1) still rings Andy's lines — the URL carries no business number. | **Open — owner's call.** Needs a per-client number source before any live client. |
| 9 | iOS handling of a blob `.ics` / `.vcf` download (download prompt vs. direct Calendar/Contacts sheet) is unverified on a device. | **Open.** Gate 208 proves the bytes; the iOS hand-off needs one real-phone tap. |

Data note held: the owner line renders `preset.ticket` (stored). Gate 212's
mutation renders `recovered` instead and goes red ("+$4,250" vs "+$850").
The accent paints only the primary slot, the status dot and the trade
label; emergency uses an ember rule, confirm is gold, focus is teal.

## Change 45 — adversarial review (3 lenses)

Run after gates 207–224 passed in Chromium and WebKit at 390x700, 390x844,
844x390 and 1440x900. An independent reviewer read the full diff, DESIGN.md
and the 19 contact sheets in review/change-45 (read-only, no browser). Every
confirmed finding below was fixed, rebuilt, re-gated and — where a gate
changed — proven red again before the change-45 commit.

### Lens 1 — "The customer, on an iPhone, in the Facebook browser: do they act in 3 seconds, and does it work there?"

| # | Finding | Verdict |
|---|---------|---------|
| 1 | The emergency glyph and its pulse ring drew in light ink ON the accent band (~1.8:1). The page's most urgent control had a near-invisible icon and an invisible pulse. Gate 222 checks text nodes only and missed it. | **Fixed.** Glyph and ring take the band's inverse ink (`--accent-ink`). Gate 217 now asserts every slot's SVG is drawn at full ink for its surface — ink on abyss, accent-ink on the band. Proven red (mutation M4: "emergency INK rgb(233, 238, 244)"). |
| 2 | Slots and the band carried two writers of `transform`: the `go-in` entrance animation and the `:active` scale. The animation won the cascade, so a press in the first ~0.6s showed no 97% scale. | **Fixed.** The rise animates the independent `translate` property; the press owns `transform`. One writer each (DESIGN.md §2). |
| 3 | `statusBarStyle: "black-translucent"` without `viewport-fit=cover`: launched from the home screen, the safe-area insets read 0 and the name sits under the status bar. | **Fixed.** `viewportFit: "cover"` on the /go viewport; the column already pads with `env(safe-area-inset-*)`. |
| 4 | The clock refreshed only on minute boundaries, so a phone woken from sleep showed its old open/closed state for up to a minute. A sheet left open could confirm a start inside the 60-minute lead. | **Fixed.** `visibilitychange`/`pageshow` re-read the clock at once; Confirm re-checks the lead and returns to the picker if the slot slid inside it. |
| 5 | (Mine.) The day rail is an ARIA tablist without arrow-key roving. | **Fixed.** Left/Right/Home/End move selection and focus; one tab stop. |
| 6 | "Visible in the first viewport at 390x844" is the full screen. Safari's visible viewport on that phone is ~664px and Facebook's ~700–720px; the owner card (713–797px) is below the fold on the real device. | **Open — owner's call.** Gate 220 holds the spec as written. Fitting it at 664 needs slots under the 72px the same spec requires. |
| 7 | In the Facebook browser, Add to calendar opens Google Calendar's template in the webview, where Google sign-in can be refused. | **Open — owner's call.** Change 42's specified fallback, unchanged here. |
| 8 | A WebKit click timed out once at 844x390 (gate 222, one run). | **Not reproduced** in 14 consecutive isolated runs of the same flow, including the gate's exact navigation; it never recurred in a full run. Logged as load flake. |

### Lens 2 — "Does the page obey DESIGN.md?"

| # | Finding | Verdict |
|---|---------|---------|
| 1 | The sheet's step-rail dot was teal; it is a readout, not a control. | **Fixed.** Ink. |
| 2 | The done-step tiles reuse `.go-slot`, so their press rule lit in the trade accent inside the sheet. | **Fixed.** Teal: they are controls. |
| 3 | A closed day's arc was a 4px muted stroke and read as "open Sunday". | **Fixed.** 1.5px hairline — the usual hours, not today's. |
| 4 | The Salvage S mark is teal on a non-control and a small second filled surface (folio, owner cards). | **Open — owner's call.** It is the Salvage app mark, drawn exactly as the demo's notify card draws it. |
| 5 | Separators (" · ", "+", "–") are composed in code. | **Dismissed.** No words; the demo composes the same way (`name · detail · $amount`, change 11). |
| 6 | The emergency band fill and the pressed-slot rule are trade accent outside "the active instrument only". | **Spec wins.** Change 45 mandates both; DESIGN.md §4 is the general rule. Counted below. |

### Lens 3 — "Can a figure on /go be invented, stale or wrong — and can a gate pass while it is?"

| # | Finding | Verdict |
|---|---------|---------|
| 1 | The demo's standing owner card was stamped with the live next-open slot, so the page offered as free the slot it showed as booked. A second booking of the same slot reused a React key. | **Fixed.** The sample card names its stored caller and job only. Starts booked in a visit leave the offer; cards key by a counter. |
| 2 | Gate 212 read the ticket's colour and never asserted it. Gate 219 checked only the arc's endpoints — the same endpoints drawn the night way round still passed — and swallowed its own wait. Nothing gated analytics, the manifest, the icon or the install hint. | **Fixed.** 212 asserts the gold token; 219 asserts the sweep and large-arc flags and the arc's midpoint hour, and a missed wait is red; new gate 224 asserts the event sequence and its ref/lead/preset attribution, the manifest JSON, a 192x192 PNG icon, and the hint on iOS Safari but not in Facebook. Proven red: M4 (212 "NOT gold", 219 "via 0.50h flags 0/0", 224 events missing `go_book_done`), M5 (224 manifest theme, hint). |
| 3 | The manifest's `start_url` dropped ref and lead, so a home-screen launch sent an unattributed `go_view`. | **Fixed.** Passed through. |
| 4 | The icon route cached a rejected font read for the life of the server. | **Fixed.** A failed read is retried. |
| 5 | `radius: 25` on every preset. | **Dismissed.** Andy's approved default (v2 GO), now marked so in config. |
| 6 | "Typical reply" is the median of one stored gap per preset, and every script yields 1 min. | **Spec as written.** Computed from the stored thread, never typed; gate 221 recomputes it from config. Every preset reads "1 min" because every script says so. |
| 7 | Live mode (biz, no demo=1) shows the preset's radius, the global hours and the reply time as facts about the named business, and confirms bookings and photos nothing receives. The dental thread says "opens at 8"; the hours say 7. | **Open — owner's call.** No per-business data source exists yet (change 42, finding 8). |
| 8 | Job glyphs key by list index: reordering `COPY.jobs` would mismatch glyph and label silently, and gate 223 checks presence only. | **Documented risk.** |

### Accent, gold and teal on /go, per section (after the fixes)

| Section | Trade accent | Gold | Teal |
|---|---|---|---|
| Identity | dial open arc ×1 (open days) | — | — |
| Emergency band | fill ×1 (home only) + press tint | — | focus ring |
| Slots (5) | left rule while pressed (transient) | — | hover border, focus ring |
| Owner phone (demo) | — | +ticket ×1 per card | S mark ×1 per card (lens 2 #4) |
| Proof row | — | — | — |
| Folio | — | — | S mark ×1 (lens 2 #4) |
| Sheet | — | — | fast-path border, chosen day, CTA border, input focus, chip/job/done-tile press, focus rings |

At rest on a home page: 2 accent uses (arc, band); salon, dental and other: 1 (arc).

Gate notes. Gate 209 now waits for the page to re-render on the frozen
client clock (the dial's minute) before reading the next-open line; a read
at networkidle once saw the server's request-time line in WebKit. Gate
222's colour parser learned the `color(srgb … / a)` form that `color-mix()`
computes to; it threw on the first 45f mutation instead of measuring it.

## Change 45.1 — the fix pass on Andy's veto

Andy's five calls on change 45's open findings, each gated and proven red on
a mutated build (Chromium + WebKit). Frames in review/change-45.1.

| # | Call | What changed | Proof |
|---|------|--------------|-------|
| 1 | The fold (45 lens 1 #6) | In demo mode the standing owner card arrives as an iOS banner pinned to the top safe area — 480ms in from first paint, a 4s hold, then it flies to its docked spot under the slots (FLIP: JS measures, the stylesheet owns the banner's one transform). Opening the sheet docks it at once. Reduced motion and no-JS: no banner, docked from the start. | Gate 220 amended: at 390x664 the banner is wholly in view at full opacity at t=1s; at t=6s the banner is gone and the card stands docked; reduced motion shows no banner. Red on a banner delayed 1.2s that never docks ("banner -94--8px, opacity 0"; "banner STILL UP, docked hidden"). |
| 2 | Live mode (45 lens 3 #7) | A live door (no demo=1) renders no proof row, and the booking and quote endings are the booked line plus the page's own Text us and Call — never "You're booked." or "Photo sent." Demo is unchanged. | New gate 225, both directions. Red on a live door with the proof row and the demo confirmation ("proof SHOWN, booking ends CONFIRMED"). |
| 3 | Per-preset hours (45 lens 3 #7, the dental 8 o'clock) | `GO_SCHEDULE` keeps what every door shares (zone, starts, lead); each preset carries its own `hours`. Dental opens 08:00. | Gate 219 holds the approved hours per preset (and config must equal them) and checks home and dental under frozen clocks: dental is closed at Mon 07:00 and 07:59, open at 08:00. Red on dental opening at 7 ("config DIFFERS dental", dental Mon 07:00 "Open now"). |
| 4 | The S mark (45 lens 2 #4) | Ink, not teal, everywhere on /go. | — |
| 5 | Glyph keys (45 lens 3 #8) | Config's `JOB_GLYPH` maps each approved job STRING to a semantic glyph id; the list's order no longer matters. | Gate 223 asserts each chip carries the glyph its own string maps to. With jobs.plumbing reversed it stays green — still matched; with the same reversal and glyphs assigned by position it goes red ("Something else=pipe-burst want else"). |

Unchanged by call: Text us still goes to 757, Call and Save to 804.
