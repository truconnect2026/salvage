/**
 * The one timeline. Every animated element derives from a single phase signal
 * (seconds since playback start) produced by the single rAF loop in Demo.tsx.
 * Nothing here schedules anything; these are pure coordinates.
 *
 * Change 11 rewires the opening to the CUSTOMER's point of view: she places
 * the call, nobody picks up, and the save arrives as a Messages banner. The
 * pre-existing thread timeline is untouched — its beats below stay
 * THREAD-RELATIVE, and the engine offsets them by THREAD_START.
 * Change 12: the clock no longer starts on page load — the pager arms it and
 * the engine begins ticking when the "call" section is >= 60% visible. The
 * beats themselves are unchanged. The headline left the timeline entirely: it
 * is static content at the top of the "save" section now.
 * Global clock:
 *   0.0-1.0    outgoing call screen, "calling…"
 *   1.0-3.6    "ringing…" — the ellipsis cycles at DOT_PERIOD. Nobody answers.
 *   3.6        "Call Ended", screen dims 30%, the End button fades
 *   4.4        a Messages banner slides down over the dead call screen
 *   5.2        400ms crossfade to the Messages thread
 *   5.6        the thread timeline's own t=0
 *   10.0       customer's closing bubble beat: the owner notification
 *   11.0       everything settled — the down-cue and Replay land here
 */

export const CALL_RINGING_AT = 1.0;
export const CALL_ENDED_AT = 3.6;
export const CALL_END_FADE_DUR = 0.4;
export const DOT_PERIOD = 0.4;
export const BANNER_AT = 4.4;
export const BANNER_IN = 0.3;
export const THREAD_FADE_AT = 5.2;
export const THREAD_FADE_DUR = 0.4;
export const THREAD_START = 5.6;

/** Bubble index -> reveal time (seconds, THREAD-RELATIVE). Bubble 0 is the
 *  auto-text the banner already delivered at t=4.4 global — on her phone it
 *  is ALREADY in the thread when the crossfade lands, so its beat is 0
 *  (change 11 review: a banner means delivered; nothing re-types it). */
export const BEATS = [0, 2.2, 3.3, 4.0];

/** Typing indicators, keyed by the bubble index they precede. Only the
 *  business's SECOND message gets one — bubble 0 is pre-delivered, and you
 *  never see your own typing indicator (bubbles 1/3 are hers). */
export const TYPING = [{ before: 2, at: 2.9 }];

export const BUBBLE_ENTER = 0.24;
export const BUBBLE_RISE = 12;

export const DELIVERED_AT = 4.0;

/** change 30 (G1): the slab receipt lands on the customer's closing bubble
 *  beat — BEATS[3] thread-relative, 9.6 global. */
export const RECEIPT_AT = 9.6;

/** The owner-side caught row: it slides in the beat the thread closes. */
export const CAUGHT_ROW_AT = 4.4;
export const CAUGHT_ROW_ENTER = 0.3;
export const CAUGHT_ROW_RISE = 12;

export const LEDGER_AT = 4.6;
export const LEDGER_DUR = 0.8;

/** The leak runs the whole thread: money leaves while one call is saved. */
export const LEAK_DUR = 5.4;

export const CONTROLS_AT = 5.4;
export const CONTROLS_FADE = 0.3;

/** Thread settles at 5.4 thread-relative = 11.0 global. */
export const SETTLED_AT = LEDGER_AT + LEDGER_DUR;

/** The owner notification: same beat as the caught-row insert (the two-sided
 *  moment), global clock. Slides in, holds, slides back out. */
export const NOTIFY_AT = THREAD_START + CAUGHT_ROW_AT; // 10.0
export const NOTIFY_IN = 0.3;
export const NOTIFY_HOLD = 2.4;
export const NOTIFY_OUT = 0.3;

/** One shimmer sweep across the gold recovered figure when its count-up
 *  completes. Driven by the rAF phase like everything else — not a CSS loop. */
export const SHIMMER_AT = THREAD_START + SETTLED_AT; // 11.0
export const SHIMMER_DUR = 0.6;

/** Loop far enough past the notification's exit (13.0) that gates can sample
 *  a fully settled t=13.3. */
export const LOOP_UNTIL = 13.8;

/* ---- Sound (change 15, B1). Beats on the SAME clock as everything else —
   the engine schedules a sound only when the rAF phase crosses its beat.
   change 43a: six ring bursts on the REAL clock, 1.2s apart; the chime rides the banner
   beat; the landing tone rides the in-phone confirmation card. ---- */
export const RING_BEATS = [0.2, 1.4, 2.6, 3.8, 5.0, 6.2];
export const RING_BURST_DUR = 0.8;

/* ---- change 43a: the OWNER's phone rings, and the owner can act. ----
   Two clocks, one rAF. The REAL clock (seconds since playback began) drives
   the ringing — six rings, 1.2s apart, on RING_BEATS above — the slider and
   the stake counter. The STORY clock is the change-11 global clock every
   post-call beat is written in (CALL_ENDED_AT = the miss = 3.6): it runs
   with the real clock up to the miss, holds just under it while the phone
   keeps ringing, and resumes AT the miss from whichever path the owner
   chose. So every beat after the miss keeps its coordinate, whichever way
   the call ended.
     ringing      story = min(real, MISS - ε)
     missed at m  story = MISS + (real - m)      timeout: m = RING_TIMEOUT
     answered at a: the call holds ANSWER_HOLD; SECOND_GAP later a SECOND
                  call rings (preset.caught[1]) that the owner cannot take —
                  they are on a job. It rings out: m = second + RING_TIMEOUT,
                  and the story resumes from that miss (change 43a.1).
   The story only ever moves forward. */
export const RING_TIMEOUT = 7.2; // the sixth ring ends at 7.0; the miss lands 0.2 later
export const ANSWER_HOLD = 1.8; // an answered call is this long, then it ends
/* change 43a.1: the second call rings this long after the in-call screen
   ends. */
export const SECOND_GAP = 1.5;
/* The owner's slide-to-answer: answered on release at >= this share of
   the travel; anything short springs home on the DESIGN.md spring. */
export const SLIDE_ANSWER_AT = 0.8;
export const SLIDE_K = 420;
export const SLIDE_C = 34;

export type CallPath = "ringing" | "missed" | "answered";

/** When the second call starts ringing, for a first call answered at `at`. */
export const secondCallAt = (at: number) => at + ANSWER_HOLD + SECOND_GAP;

/** The real time of the miss the story resumes from: the declined or
    rung-out first call, or — answered — the second call ringing out. */
export const missAt = (path: CallPath, at: number) => (path === "answered" ? secondCallAt(at) + RING_TIMEOUT : at);

/** The story clock (see above). `at` is the real time the first call ended
    (missed or answered); it is unused while ringing. */
export function storyAt(real: number, path: CallPath, at: number): number {
  const hold = CALL_ENDED_AT - 0.001;
  if (path === "ringing") return Math.min(real, hold);
  const m = missAt(path, at);
  return real < m ? hold : CALL_ENDED_AT + (real - m);
}

/** The stake: what ONE call is worth (change 43a.1: the stored ticket, not
    the month), counting up over its six rings in REAL time and frozen at
    exactly `ticket` at its miss — never above it. Answered, the first
    call's count stops where the answer caught it (the line leaves — the
    engine never rests that figure); the second call counts up again from
    zero and freezes at `ticket` when it rings out. */
export function stakeAt(real: number, ticket: number, path: CallPath, at: number): number {
  if (path === "missed") return ticket;
  if (path === "ringing") return Math.round(clamp01(real / RING_TIMEOUT) * ticket);
  const s2 = secondCallAt(at);
  if (real < s2) return Math.round(clamp01(at / RING_TIMEOUT) * ticket);
  return Math.round(clamp01((real - s2) / RING_TIMEOUT) * ticket);
}

/* change 18 (D1): the sonar rings ride the SAME ring beats as the sound —
   each ring lives RING_DUR seconds, growing to 1.6x the phone height as its
   opacity falls 0.7 -> 0, both ease-out. Pure coordinates; the engine
   derives radius and opacity from (phase - birthBeat) every frame. */
export const RING_DUR = 1.4;
export const RING_MAX_FACTOR = 1.6;
export const RING_MAX_OPACITY = 0.7;

/* change 18 (D3): the SALVAGED stamp fades in over 120ms with the row
   insert. */
export const STAMP_IN = 0.12;

/* change 18 (D2): split-flap mechanics — 80ms per flap step, 40ms stagger
   per flap from the left. */
export const FLAP_STEP = 0.08;
export const FLAP_STAGGER = 0.04;
export const CHIME_AT = BANNER_AT; // 4.4
/* change 43a: the landing tone rides the owner's Booked note, which lands
   on the booking beat with the rail's third segment and the money. */
export const LAND_AT = RECEIPT_AT; // 9.6

/* Scene-type beats (change 15, A2): line 2 crossfades on the miss and on the
   thread's first beat. */
export const SCENE_DIALING_AT = CALL_ENDED_AT; // 3.6
export const SCENE_CAUGHT_AT = THREAD_START; // 5.6
export const SCENE_FADE = 0.4;

/** Preset crossfade: text dissolves through zero, numbers roll old -> beat 0. */
export const SWAP_FADE = 0.22;
export const SWAP_ROLL = 0.5;

export const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
export const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

/* The counter curves, THREAD-RELATIVE (the engine passes t - THREAD_START).
   Exported so the preset switch can ask for the incoming preset's value *at
   beat 0* rather than hardcoding a zero, which keeps the transition target
   honest if the timeline ever moves. */
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

/** Reveal progress (0-1) for the caught-list row that slides in. Thread-relative. */
export const caughtRowProgress = (t: number) => easeOut(clamp01((t - CAUGHT_ROW_AT) / CAUGHT_ROW_ENTER));

/** Presence (0-1) of the owner notification at GLOBAL time t: slide-in, hold,
 *  slide-out, gone. */
export function notifyPresence(t: number) {
  if (t < NOTIFY_AT) return 0;
  const e = t - NOTIFY_AT;
  if (e < NOTIFY_IN) return easeOut(e / NOTIFY_IN);
  if (e < NOTIFY_IN + NOTIFY_HOLD) return 1;
  if (e < NOTIFY_IN + NOTIFY_HOLD + NOTIFY_OUT)
    return 1 - easeOut((e - NOTIFY_IN - NOTIFY_HOLD) / NOTIFY_OUT);
  return 0;
}
