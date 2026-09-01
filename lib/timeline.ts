/**
 * The one timeline. Every animated element derives from a single phase signal
 * (seconds since playback start) produced by the single rAF loop in Demo.tsx.
 * Nothing here schedules anything; these are pure coordinates.
 */

/** Bubble index -> reveal time (seconds). Four bubbles; the missed call itself
 *  is the call card, which is already on screen at t=0. */
export const BEATS = [0.9, 2.2, 3.3, 4.0];

/** Typing indicators, keyed by the bubble index they precede. */
export const TYPING = [
  { before: 0, at: 0.2 },
  { before: 1, at: 1.8 },
  { before: 2, at: 2.9 },
];

export const BUBBLE_ENTER = 0.24;
export const BUBBLE_RISE = 12;

export const DELIVERED_AT = 4.0;

/** The owner-side caught row: it slides in the beat the thread closes. */
export const CAUGHT_ROW_AT = 4.4;
export const CAUGHT_ROW_ENTER = 0.3;
export const CAUGHT_ROW_RISE = 12;

export const LEDGER_AT = 4.6;
export const LEDGER_DUR = 0.8;

/** The leak runs the entire timeline: money leaves while one call is saved. */
export const LEAK_DUR = 5.4;

export const CONTROLS_AT = 5.4;
export const CONTROLS_FADE = 0.3;

/** Ledger finishes last, at 5.4. Loop past it so gates can sample a settled t=6. */
export const SETTLED_AT = LEDGER_AT + LEDGER_DUR;
export const LOOP_UNTIL = 6.0;

/** Preset crossfade: text dissolves through zero, numbers roll old -> beat 0. */
export const SWAP_FADE = 0.22;
export const SWAP_ROLL = 0.5;

/**
 * Fixed phone screen height. Reserves the call card plus the full settled
 * thread for every preset at every width, so the stack can be bottom-anchored
 * and clientHeight never changes between beats. Unaffected by change 4: bubble
 * text is unchanged, only the timing of their reveal moved. The floor is
 * width-dependent because the phone shrinks with the viewport and the text
 * rewraps: 676 at a 390px viewport (the reference width), 696 at 360-375px,
 * 715 at 344px. 716 clears all of those. A 320px viewport needs 752 and will
 * clip the top of the box.
 */
export const PHONE_SCREEN_HEIGHT = 716;

/**
 * Above 1100px the phone always renders at its full 390px box width (no page
 * padding ever squeezes it there), so the narrow-viewport safety margin baked
 * into PHONE_SCREEN_HEIGHT is dead weight. Change 3's own floor table showed
 * 676px was specifically the floor at a 390px VIEWPORT (where the phone's own
 * box can still be marginally compressed); the floor at 430px+ viewports —
 * which >=1100px always satisfies, since the phone box stops shrinking well
 * before then — is 638px. Re-verified directly (change 6): at 1440px the
 * worst-case preset (salon/home) needs exactly 638px with zero slack, so this
 * is the true floor, not a rounder/safer approximation of it. Stable across
 * every viewport >=1100px, since the phone's box size and text wrapping never
 * change again past that width. Applied via a CSS custom-property override
 * scoped to the breakpoint (see Phone.tsx) rather than a JS/matchMedia
 * switch, so there is no reactive state and no hydration risk — the browser
 * just picks the right rule at paint time from server-rendered markup.
 */
export const PHONE_SCREEN_HEIGHT_WIDE = 638;

export const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
export const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

/* The counter curves. Exported so the preset switch can ask for the incoming
   preset's value *at beat 0* rather than hardcoding a zero, which keeps the
   transition target honest if the timeline ever moves. */
export const ledgerAt = (t: number, recovered: number) =>
  Math.round(easeOut(clamp01((t - LEDGER_AT) / LEDGER_DUR)) * recovered);

export const leakAt = (t: number, lost: number) => Math.round(clamp01(t / LEAK_DUR) * lost);

/**
 * The owner panel's Recovered tile. It does NOT climb from zero: the three
 * standing rows already account for (recovered - row0Amount), so the panel
 * opens showing that partial total and rolls the remaining row0Amount in when
 * the row slides in at CAUGHT_ROW_AT / rolls at LEDGER_AT. This is the causal
 * link the whole change is built around — the thread closing IS the roll.
 */
export const panelRecoveredAt = (t: number, recovered: number, row0Amount: number) => {
  const base = recovered - row0Amount;
  return Math.round(base + easeOut(clamp01((t - LEDGER_AT) / LEDGER_DUR)) * row0Amount);
};

/** Reveal progress (0-1) for the caught-list row that slides in. */
export const caughtRowProgress = (t: number) => easeOut(clamp01((t - CAUGHT_ROW_AT) / CAUGHT_ROW_ENTER));
