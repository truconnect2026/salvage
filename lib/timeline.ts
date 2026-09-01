/**
 * The one timeline. Every animated element derives from a single phase signal
 * (seconds since playback start) produced by the single rAF loop in Demo.tsx.
 * Nothing here schedules anything; these are pure coordinates.
 */

/** Bubble index -> reveal time (seconds). Four bubbles; the missed call itself
 *  is the call card, which is already on screen at t=0. */
export const BEATS = [1.3, 2.6, 3.7, 4.4];

/** Typing indicators, keyed by the bubble index they precede. */
export const TYPING = [
  { before: 0, at: 0.5 },
  { before: 1, at: 2.2 },
  { before: 2, at: 3.3 },
];

export const BUBBLE_ENTER = 0.24;
export const BUBBLE_RISE = 12;

export const DELIVERED_AT = 4.4;

export const LEDGER_AT = 4.6;
export const LEDGER_DUR = 0.8;

/** The leak runs the entire timeline: money leaves while one call is saved. */
export const LEAK_DUR = 5.2;

export const CONTROLS_AT = 5.2;
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
 * and clientHeight never changes between beats. Verified against all three
 * presets. The floor is width-dependent because the phone shrinks with the
 * viewport and the text rewraps: 676 at a 390px viewport (the reference width),
 * 696 at 360-375px, 715 at 344px. 716 clears all of those. A 320px viewport
 * needs 752 and will clip the top of the box.
 */
export const PHONE_SCREEN_HEIGHT = 716;

export const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
export const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

/* The counter curves. Exported so the preset switch can ask for the incoming
   preset's value *at beat 0* rather than hardcoding a zero, which keeps the
   transition target honest if the timeline ever moves. */
export const ledgerAt = (t: number, recovered: number) =>
  Math.round(easeOut(clamp01((t - LEDGER_AT) / LEDGER_DUR)) * recovered);

export const leakAt = (t: number, lost: number) => Math.round(clamp01(t / LEAK_DUR) * lost);
