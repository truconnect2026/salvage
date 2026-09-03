export type Bubble = { from: "business" | "customer"; text: string; time: string };
export type CaughtEntry = { name: string; number: string; detail: string; amount: number; date: string };
export type Preset = {
  id: string; label: string; bizName: string;
  /* change 19: the caller who owns this preset's thread — row[0]'s name. */
  customerName: string;
  /* change 19 (B9): the "other" preset's one-line tagline; empty elsewhere. */
  tagline?: string;
  /* change 20 (A): the vertical's accent triplet — recolors the CLIENT's
     world (bubbles, slab, sonar, stamp, labels); DJL chrome stays teal.
     accent/accentInk measure >= 4.5:1 for all four (gate 135). */
  accent: string;
  accentSoft: string;
  accentInk: string;
  ticket: number; missedPerMonth: number; callsCaught: number; recovered: number; lost: number;
  sinceCalls: number; sinceRecovered: number;
  caught: CaughtEntry[];
  thread: Bubble[];
};

export const META = {
  title: "Salvage — every missed call, caught | Davy Jones' Locker",
  description: "See what a missed call is costing you, and watch one get saved.",
};

export const COPY = {
  productName: "Salvage",
  headline: "The phone rang. Nobody answered. They called someone else.",
  sub: "Salvage catches the call you missed and books it before they move on.",
  replayLabel: "Watch it again",
  shareLabel: "Send this to someone",
  shareCopied: "Link copied",
  mathLead: "Miss",
  mathMid: "calls a month at",
  mathTail: "a job. That's what's walking out the door.",
  // change 19 (A/B8, APPROVED): the personal math line when a name is set —
  // rendered by splitting on the placeholders, never by rewording.
  mathPersonal:
    "{bizName} misses {missed} calls a month at ${ticket} a job. That's what's walking out the door.",
  // change 19 (A/B6, APPROVED).
  fictionalNote: "Fictional businesses. Real product.",
  ctaLabel: "See it on your own number",
  ctaHref: "https://calendly.com/andy-davyjoneslocker/30min",
  footNote: "Demo. Numbers are illustrative.",

  ledger: {
    // change 19 (A, APPROVED): the owner's side, addressed to the owner.
    screenLabel: "Your side",
    // change 19 (A/B4, APPROVED): the owner entry's third line.
    calendarLine: "Added to Google Calendar",
    // monthLabel removed (change 17, D2): the month is computed at request
    // time in America/New_York — see lib/dates.ts.
    // statusLabel retired with its pill (change 18 A4 / change 19 B2).
    recoveredLabel: "Recovered",
    lostLabel: "Still lost",
    replyLabel: "Reply time",
    replyValue: "18s",
    replyCaption: "average",
    caughtLabel: "Caught this month",
    reviewNote: "Review requests sent automatically after each visit.",
    sinceLabel: "Since install",
    // change 18 (D3, APPROVED): the row[0] stamp; replaces justNow (retired
    // with the pill it decorated).
    stamp: "SALVAGED",
  },

  // The customer's outgoing call (change 11). Approved copy; do not reword.
  call: {
    callingLabel: "calling…",
    ringingLabel: "ringing…",
    endedLabel: "Call Ended",
    endLabel: "End",
    // change 17 (A1, APPROVED): the six-button iOS in-call grid, in iOS's
    // own casing. Non-interactive scenery.
    grid: ["mute", "keypad", "speaker", "add call", "FaceTime", "contacts"],
  },

  // The owner-side notification card (change 10). Approved copy. nowLabel is
  // the timestamp corner specified in the A4 beat ("now" small muted
  // top-right) — added here rather than hardcoded, per standing rule 3.
  notify: {
    bookedLabel: "Booked",
    appTag: "Salvage",
    nowLabel: "now",
  },

  // The live business-name field (change 10). Approved copy. The old hint
  // ("Everything below updates as you type.") retired — change 19 (B7)
  // replaced it with yours.hint.
  name: {
    label: "Type your business name",
    placeholder: "Harbor Row Aesthetics",
  },

  rotatePrompt: "Turn your phone upright.",

  // The snap pager (change 12, A4). Approved copy. Kicker + title are
  // wayfinding, not headlines — small, top-left of each section.
  // change 18 (B5, APPROVED): folio kickers — "No. 1 — The call" reads as a
  // log page mark, not a dashboard step counter.
  sections: {
    call: { kicker: "No. 1", title: "The call" },
    save: { kicker: "No. 2", title: "The save" },
    yours: { kicker: "No. 3", title: "Make it yours" },
    math: { kicker: "No. 4", title: "The math" },
  },
  // change 15 (A3/A1): cues.down retired — the rail chevron is the standing
  // affordance; cues.right retired with the mobile section-2 track it
  // explained. cues.presets remains the one swipe cue.
  cues: {
    presets: "Swipe to change trade",
  },
  a11y: {
    pager: "Demo sections",
    dot: "Go to section",
    panelDot: "Go to panel",
    share: "Copy demo link",
    next: "Next section",
    soundOn: "Sound on",
    soundOff: "Sound off",
    // change 20 (E2, APPROVED): the once-per-session sound toast.
    tapForSound: "Tap for sound",
  },

  // Desktop section-1 scene type (change 15, A2). Approved copy.
  // change 19 (A/B1, APPROVED): the mobile caption runs its own three
  // lines on the same beats (0 / 3.6 / 5.6).
  scene: {
    closed: "Closed since 6.",
    dialing: "She's already dialing the next one.",
    caught: "Not this time.",
    mobile: {
      calls: "A customer calls you.",
      nobody: "Nobody answers.",
      caught: "Not this time.",
    },
  },

  // Section-3 tiles (change 13, S3d). Approved copy — the numerals come from
  // the preset, the suffixes complete the lines ("$340 a job", "12 missed a
  // month", "$4,080 still lost").
  yours: {
    ticketSuffix: "a job",
    missedSuffix: "missed a month",
    lostSuffix: "still lost",
    // change 19 (A/B7, APPROVED).
    hint: "Your name lands on the phone.",
    scrollUp: "Scroll up to watch it as {bizName}.",
  },

  // Phone / OG chrome. Same human veto as everything else in this file.
  chrome: {
    // change 17 (C3, APPROVED): prefixes thread[0].time only.
    todayPrefix: "Today ",
    // change 19 (A/B5, APPROVED): under the first business bubble only.
    autoReplyTag: "Salvage · auto-reply",
    phone: {
      statusTime: "8:47",
      // change 17 (D1, APPROVED): March 14, 2026 is a Saturday; the
      // thread's weekday evening needs a weekday date.
      lockDate: "Thursday, March 12",
      threadLabel: "Text message",
      deliveredLabel: "Delivered",
    },
    og: {
      wordmark: "Davy Jones' Locker",
    },
  },
};

export const PRESETS: Preset[] = [
  {
    id: "salon", label: "Salon and Spa", bizName: "Harbor Row Aesthetics",
    customerName: "Danielle R.",
    accent: "#E8A0B4", accentSoft: "#3A2230", accentInk: "#1A0C12",
    ticket: 340, missedPerMonth: 12, callsCaught: 4, recovered: 1360, lost: 4080,
    sinceCalls: 31, sinceRecovered: 9240,
    // Entry [0] is this thread's own booking. Sum of all 4 amounts === recovered.
    caught: [
      { name: "Danielle R.", number: "(804) 555-0142", detail: "Thu 2:00 with Marisa · filler", amount: 340, date: "Mar 14" },
      { name: "Renee K.", number: "(804) 555-0119", detail: "Tue 11:00 with Marisa · color", amount: 260, date: "Mar 11" },
      { name: "Alyssa P.", number: "(804) 555-0176", detail: "Sat 9:30 with Priya · facial", amount: 380, date: "Mar 8" },
      { name: "Tara W.", number: "(804) 555-0133", detail: "Wed 4:15 with Marisa · lash fill", amount: 380, date: "Mar 4" },
    ],
    thread: [
      { from: "business", time: "8:47 PM", text: "This is Harbor Row Aesthetics, sorry we missed you. We're closed for the night, but I can get you on the book right now if you want." },
      { from: "customer", time: "8:52 PM", text: "Yes please. Looking for filler, sometime next week." },
      { from: "business", time: "8:53 PM", text: "Tuesday 10:30 or Thursday 2:00 with Marisa. Which works?" },
      { from: "customer", time: "8:56 PM", text: "Thursday 2:00." },
    ],
  },
  {
    id: "home", label: "Home Services", bizName: "Ridgeline Plumbing",
    customerName: "Mark T.",
    accent: "#F0A044", accentSoft: "#3A2A14", accentInk: "#1A1206",
    ticket: 850, missedPerMonth: 15, callsCaught: 5, recovered: 4250, lost: 12750,
    sinceCalls: 24, sinceRecovered: 18700,
    caught: [
      { name: "Mark T.", number: "(804) 555-0197", detail: "Tue 8:00 · water heater", amount: 850, date: "Mar 13" },
      { name: "Chris D.", number: "(804) 555-0155", detail: "Fri 1:00 · drain clog", amount: 900, date: "Mar 10" },
      { name: "Elena V.", number: "(804) 555-0184", detail: "Mon 9:00 · toilet install", amount: 1200, date: "Mar 6" },
      { name: "Sam O.", number: "(804) 555-0161", detail: "Thu 7:30 · water heater replace", amount: 1300, date: "Mar 2" },
    ],
    thread: [
      { from: "business", time: "8:47 PM", text: "Ridgeline Plumbing, sorry we couldn't pick up. What's going on? I can get someone scheduled." },
      { from: "customer", time: "8:49 PM", text: "Water heater's leaking into the garage." },
      { from: "business", time: "8:50 PM", text: "Shut the valve on top of the tank for now. We can have a tech out at 8 AM." },
      { from: "customer", time: "8:51 PM", text: "8 works. Thank you." },
    ],
  },
  {
    id: "dental", label: "Dental", bizName: "Fairfield Dental",
    customerName: "Priya S.",
    accent: "#7CC4E8", accentSoft: "#16324A", accentInk: "#08161F",
    ticket: 600, missedPerMonth: 9, callsCaught: 3, recovered: 1800, lost: 5400,
    sinceCalls: 19, sinceRecovered: 9800,
    caught: [
      { name: "Priya S.", number: "(804) 555-0168", detail: "Fri 9:15 with Dr. Nakamura · chipped tooth", amount: 600, date: "Mar 12" },
      { name: "Owen L.", number: "(804) 555-0122", detail: "Wed 10:30 with Dr. Nakamura · cleaning", amount: 300, date: "Mar 9" },
      { name: "Maya F.", number: "(804) 555-0147", detail: "Mon 2:00 with Dr. Osei · filling", amount: 400, date: "Mar 5" },
      { name: "Luis R.", number: "(804) 555-0109", detail: "Thu 3:45 with Dr. Nakamura · crown", amount: 500, date: "Mar 1" },
    ],
    thread: [
      { from: "business", time: "8:47 PM", text: "Fairfield Dental, sorry we missed your call. Office opens at 8, but I can hold a time for you now." },
      { from: "customer", time: "8:54 PM", text: "Chipped a molar tonight. Not bleeding, just sharp." },
      { from: "business", time: "8:55 PM", text: "We keep two same-day slots. 9:15 tomorrow with Dr. Nakamura?" },
      { from: "customer", time: "8:57 PM", text: "I'll take it." },
    ],
  },
  // change 19 (A, APPROVED): the fourth preset — every business that takes
  // calls. Three caught entries; their sum === recovered (750, stored).
  {
    id: "other", label: "Something else", bizName: "Your business",
    customerName: "Jordan M.",
    accent: "#9BB0C4", accentSoft: "#1E2C3A", accentInk: "#0B131B",
    tagline: "Any business that takes calls.",
    ticket: 250, missedPerMonth: 10, callsCaught: 3, recovered: 750, lost: 2500,
    sinceCalls: 22, sinceRecovered: 5500,
    caught: [
      { name: "Jordan M.", number: "(804) 555-0151", detail: "Fri 3:30 · appointment", amount: 250, date: "Sep 2" },
      { name: "Casey B.", number: "(804) 555-0128", detail: "Tue 1:00 · appointment", amount: 250, date: "Sep 1" },
      { name: "Morgan L.", number: "(804) 555-0187", detail: "Mon 9:30 · appointment", amount: 250, date: "Sep 1" },
    ],
    thread: [
      { from: "business", time: "8:47 PM", text: "Sorry we missed your call. We're closed right now, but I can get you booked." },
      { from: "customer", time: "8:50 PM", text: "Yes, I need to come in this week." },
      { from: "business", time: "8:51 PM", text: "Wednesday 10:00 or Friday 3:30?" },
      { from: "customer", time: "8:53 PM", text: "Friday 3:30." },
    ],
  },
];

export const DEFAULT_PRESET = "salon";

/** Resolves ?biz=. Unknown or missing falls back to DEFAULT_PRESET; never throws. */
export function resolvePreset(biz: string | string[] | undefined): Preset {
  const id = Array.isArray(biz) ? biz[0] : biz;
  return PRESETS.find((p) => p.id === id) ?? PRESETS.find((p) => p.id === DEFAULT_PRESET) ?? PRESETS[0];
}

export const MAX_NAME_LEN = 40;

/**
 * Resolves &name=. One function for BOTH the server read (searchParams) and
 * the client's debounced commit, so a shared link renders exactly what the
 * sender saw. Trim + cap only — no HTML stripping needed because the value
 * is only ever rendered as React text content, never markup (gate 55).
 * Empty result means "use the preset's default bizName".
 */
export function resolveName(raw: string | string[] | undefined): string {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (!s) return "";
  return s.trim().slice(0, MAX_NAME_LEN);
}

export const SHARE_ORIGIN = "https://salvage-demo.vercel.app";
