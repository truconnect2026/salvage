export type Bubble = { from: "system" | "business" | "customer"; text: string; time: string };
export type Preset = {
  id: string; label: string; bizName: string;
  ticket: number; missedPerMonth: number; callsCaught: number; recovered: number;
  thread: Bubble[];
};

export const META = {
  title: "Salvage — every missed call, caught | Davy Jones' Locker",
  description: "See what a missed call is costing you, and watch one get saved.",
};

export const COPY = {
  eyebrow: "Concept demo · Davy Jones' Locker",
  productName: "Salvage",
  headline: "The phone rang. Nobody answered. They called someone else.",
  sub: "Salvage catches the call you missed and books it before they move on.",
  presetPrompt: "Pick your line of work:",
  ledgerTitle: "Recovered this month",
  ledgerCaption: "What Salvage caught while the lights were off.",
  mathLead: "Miss",
  mathMid: "calls a month at",
  mathTail: "a job. That's what's walking out the door.",
  ctaLabel: "See it on your own number",
  ctaHref: "https://calendly.com/andy-davyjoneslocker/30min",
  footNote: "Demo. Numbers are illustrative.",
};

export const PRESETS: Preset[] = [
  {
    id: "salon", label: "Salon & Spa", bizName: "Harbor Row Aesthetics",
    ticket: 340, missedPerMonth: 12, callsCaught: 4, recovered: 1360,
    thread: [
      { from: "system",   time: "8:47 PM", text: "Missed call. Front desk closed at 6." },
      { from: "business", time: "8:47 PM", text: "This is Harbor Row Aesthetics, sorry we missed you. We're closed for the night, but I can get you on the book right now if you want." },
      { from: "customer", time: "8:52 PM", text: "Yes please. Looking for filler, sometime next week." },
      { from: "business", time: "8:53 PM", text: "Tuesday 10:30 or Thursday 2:00 with Marisa. Which works?" },
      { from: "customer", time: "8:56 PM", text: "Thursday 2:00." },
    ],
  },
  {
    id: "home", label: "Home Services", bizName: "Ridgeline Plumbing",
    ticket: 850, missedPerMonth: 15, callsCaught: 5, recovered: 4250,
    thread: [
      { from: "system",   time: "8:47 PM", text: "Missed call. Line was busy." },
      { from: "business", time: "8:47 PM", text: "Ridgeline Plumbing, sorry we couldn't pick up. What's going on? I can get someone scheduled." },
      { from: "customer", time: "8:49 PM", text: "Water heater's leaking into the garage." },
      { from: "business", time: "8:50 PM", text: "Shut the valve on top of the tank for now. We can have a tech out at 8 AM." },
      { from: "customer", time: "8:51 PM", text: "8 works. Thank you." },
    ],
  },
  {
    id: "dental", label: "Dental", bizName: "Fairfield Dental",
    ticket: 600, missedPerMonth: 9, callsCaught: 3, recovered: 1800,
    thread: [
      { from: "system",   time: "8:47 PM", text: "Missed call. After hours." },
      { from: "business", time: "8:47 PM", text: "Fairfield Dental, sorry we missed your call. Office opens at 8, but I can hold a time for you now." },
      { from: "customer", time: "8:54 PM", text: "Chipped a molar tonight. Not bleeding, just sharp." },
      { from: "business", time: "8:55 PM", text: "We keep two same-day slots. 9:15 tomorrow with Dr. Nakamura?" },
      { from: "customer", time: "8:57 PM", text: "I'll take it." },
    ],
  },
];

export const DEFAULT_PRESET = "salon";

// ---------------------------------------------------------------------------
// Chrome strings — NOT part of the approved COPY veto block above.
// These are the literal strings specified in the change-1 build spec for the
// phone UI and the OG composition. Standing rule 3 says every user-facing
// string lives in this file, so they are centralised here rather than being
// hardcoded in components. Subject to the same human veto.
// ---------------------------------------------------------------------------
export const CHROME = {
  phone: {
    statusTime: "8:47",
    threadLabel: "Text message",
    deliveredLabel: "Delivered",
  },
  ledger: {
    callsCaughtLabel: "calls caught",
  },
  presets: {
    disabledTitle: "wired in change 2",
  },
  og: {
    wordmark: "Davy Jones' Locker",
  },
};
