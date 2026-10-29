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
     accent/accentInk measure >= 4.5:1 for all four (gate 135).
     change 35 (C1): accentSoft is one step brighter — the slab is the
     whole mobile ground in section 3 now, and the old values read as
     abyss with a tint. Ink on accentSoft measures >= 7:1 (gate 198). */
  accent: string;
  accentSoft: string;
  accentInk: string;
  ticket: number; missedPerMonth: number; callsCaught: number; recovered: number; lost: number;
  /* change 45: the /go proof row's service radius, miles. Data — 25 is
     Andy's approved default (v2 GO). change 53: null for a business people
     come TO (the salon preset) — the proof row then shows no service area. */
  radius: number | null;
  /* change 45.1: the front door's hours are per preset. Weekdays 0 = Sunday
     (never open), whole hours, America/New_York (GO_SCHEDULE.tz). */
  hours: { days: number[]; open: number; close: number };
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
  // change 26 (C7, APPROVED): the settled pair under the phone.
  replayLabel: "Watch again",
  yourSideLabel: "Your side ↓",
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
  // ctaLabel/ctaHref retired (change 21) — the close block below owns the
  // conversion path. footNote relocated to the wordmark line.
  footNote: "Demo. Numbers are illustrative.",

  // change 21 (A, APPROVED): the close.
  // change 36 (F, APPROVED): a TEXT-first close. The gold pill sends the
  // message; Calendly is the secondary link. ctaLabel/ctaSub replaced,
  // textLead retired with the phone-number line it introduced.
  close: {
    accuse: "Miss three of them and Salvage has already paid for itself.",
    ctaLabel: "Text me — I'll show you yours",
    ctaSub: "I'll plug in your business and run it with your name.",
    bookLabel: "or book 20 minutes",
    // change 36 (F5): priceLine / priceLine2 retired by change 50's pricing
    // (COPY.price below).
    builtBy: "Built by Andy Jones · Chesterfield, VA",
    // change 29 (APPROVED): one replay label page-wide — matches replayLabel.
    loopLabel: "Watch again",
    // change 27 (C3, APPROVED) — one line at 390.
    stack: "Next.js · Twilio · Vercel",
  },
  // change 26 (G6, APPROVED): the ?ref=djl portfolio variant.
  portfolio: {
    cta: "Want one for your business? →",
    sub: "Salvage is a Davy Jones' Locker build. Two-sided web systems for local businesses.",
    ogHeadline: "Salvage — a Davy Jones' Locker build",
    href: "https://davyjoneslocker.app",
  },
  // change 21 (A): contact endpoints. PLACEHOLDERS marked — Andy replaces
  // phone, smsHref, and photo; gates assert shape, never values.
  contact: {
    phone: "(757) 807-3318",
    smsHref: "sms:+17578073318",
    calendly: "https://calendly.com/andy-davyjoneslocker/30min",
    photo: "/andy.png",
  },

  ledger: {
    // change 36 (A5): screenLabel retired — the panel does not need to
    // announce itself above a lead that already says whose side it is.
    // change 36 (D1, APPROVED): the count under Recovered.
    callsBooked: "{n} calls booked",
    // change 19 (A/B4, APPROVED): the owner entry's third line.
    calendarLine: "Added to Google Calendar",
    // monthLabel removed (change 17, D2): the month is computed at request
    // time in America/New_York — see lib/dates.ts.
    // statusLabel retired with its pill (change 18 A4 / change 19 B2).
    recoveredLabel: "Recovered",
    lostLabel: "Still lost",
    // change 36 (A5): cols, replyFoot and moreRows retired with the column
    // heads, the footnote and the overflow line. Three rows, one rule
    // between them, and nothing labelling the obvious.
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
    // v2 GO (APPROVED, verbatim): the owner's incoming-call controls.
    decline: "Decline",
    slideToAnswer: "slide to answer",
    // change 43a.1 (APPROVED, verbatim): the second call's disabled slider —
    // the owner already took the first call and is out on it.
    onAJob: "You're on a job.",
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

  // change 36 (C1, APPROVED): the mechanism, in three words under the
  // phone. Each inks at its own beat; the money lands beside the third.
  beats: { missed: "Missed call", text: "Text sent", booked: "Booked" },

  rotatePrompt: "Turn your phone upright.",
  // change 41 (step 3): the landscape title card. Eyebrow and folio REUSE
  // existing approved strings (productName, the wordmark); the line is the
  // existing rotatePrompt. `sub` is new copy, APPROVED at close-out — the
  // proposed version repeated "phone held upright" from the line above it.
  rotate: {
    eyebrow: "Salvage",
    sub: "Built for a phone held upright.",
    folio: "Davy Jones' Locker",
  },

  // The snap pager (change 12, A4). Approved copy. Kicker + title are
  // wayfinding, not headlines — small, top-left of each section.
  // change 18 (B5) / change 36 (A3): the folio is the title alone. The
  // "No. 1 —" numbering was a step counter on a page that already snaps.
  sections: {
    call: { title: "The call" },
    save: { title: "The save" },
    yours: { title: "Make it yours" },
    math: { title: "The math" },
  },
  // change 34 (A, APPROVED): the tab strip's own short labels — the panel
  // headings keep the full trade names.
  // change 36 (A6/E1): cues.presets retired with the cue line — the next
  // trade's own label, showing at 40% in the 12% peek, IS the affordance.
  tabs: { salon: "Salon", home: "Home", dental: "Dental", other: "Other" },
  a11y: {
    pager: "Demo sections",
    // change 37: a11y.dot retired with the rail squares it labelled.
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
  // change 26 (C6, APPROVED): the caught line is structured — only the em
  // word takes the accent. Desktop and mobile share it; the old flat
  // scene.caught string retired.
  scene: {
    closed: "Closed since 6.",
    dialing: "She's already dialing the next one.",
    mobile: {
      calls: "A customer calls you.",
      nobody: "Nobody answers.",
      caught: { pre: "Not ", em: "this", post: " time." },
    },
  },

  // Section-3 tiles (change 13, S3d). Approved copy — the numerals come from
  // the preset, the suffixes complete the lines ("$340 a job", "12 missed a
  // month", "$4,080 still lost").
  yours: {
    // change 36 (A6): rowsHead and scrollUp retired with the ruled head and
    // the payoff pointer — the rows label themselves and the phone below
    // them is the payoff.
    rows: { ticket: "Per job", missed: "Missed per month", lost: "Lost per month" },
    // change 19 (A/B7, APPROVED).
    hint: "Your name lands on the phone.",
  },

  // change 50 (APPROVED, verbatim — Andy): the pricing, on / ("The math"),
  // on /start, and anywhere else a price shows.
  price: {
    line: "$250 to start. Includes your first month.",
    monthly: "Then $100 a month. Cancel anytime.",
    guarantee: "No missed call caught in 30 days? You get the $250 back.",
    founding: "Founding 5: only five Richmond shops at this price.",
  },

  // Phone / OG chrome. Same human veto as everything else in this file.
  chrome: {
    // change 17 (C3, APPROVED): prefixes thread[0].time only.
    todayPrefix: "Today ",
    // change 19 (A/B5, APPROVED): under the first business bubble only.
    autoReplyTag: "Salvage · auto-reply",
    // change 26 (C1, APPROVED).
    composePlaceholder: "Text Message",
    // change 30 (B3, APPROVED): the contact header's sub-label.
    textMessageLabel: "Text Message",
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

/* change 48: the front door's copy (/go), moved out of COPY verbatim — not
   a word changed — so the demo's first load never ships it (a client
   component that reads COPY carries the whole object). Still the same human
   veto as everything above. */
export const GO_COPY = {
  // change 42 (APPROVED, verbatim): the /go customer page. Appended LAST in
  // COPY so the gates' first-match config reads (closed:, call:, close:)
  // keep resolving to the demo's own strings. change 48: and still last in
  // the file, below COPY, for the same reason.
  go: {
    open: "Open now", closed: "Closed now. You can still book.",
    book: "Book a time", nextLabel: "Next available",
    text: "Text us", call: "Call", emergency: "Emergency? Call now",
    quote: "Send a photo for a quote", save: "Save our number",
    smsBody: "Hi {biz}, I need help with a job.",
    stepJob: "What do you need?", stepTime: "Pick a time", stepYou: "Your name and number",
    namePh: "Your name", phonePh: "Phone number",
    nameErr: "Add your name.", phoneErr: "Add a 10-digit phone number.",
    confirm: "Confirm booking", sendQuote: "Send photo", back: "Back", close: "Close",
    doneTitle: "You're booked.", doneSub: "{biz} will text you to confirm.",
    quoteDoneTitle: "Photo sent.", quoteDoneSub: "{biz} will text you a quote.",
    addCal: "Add to calendar", copyNumber: "Copy number", copied: "Copied",
    ownerSide: "On the owner's phone, right now:",
    demoNote: "Demo. Nothing is sent.",
    poweredBy: "Missed-call recovery by Salvage",
    // v2 GO (APPROVED, verbatim). {n} is filled from data.
    seeTheirSide: "See what your customer sees",
    proofRadius: "Serves {n} miles",
    proofHours: "Hours",
    proofReply: "Typical reply: {n} min",
    installHint: "Tap Share, then Add to Home Screen.",
    qrTitle: "Your front door",
    qrSub: "Scan it. This is what your customers see.",
    qrCaption: "Put it on the truck, the door, and every invoice.",
    kitTitle: "Your print kit",
    kitPieces: ["Truck decal","Yard sign","Invoice footer","Sticker"],
    downloadPng: "Download PNG",
    downloadSvg: "Download SVG",
  },
  jobs: {
    plumbing: ["Leak or burst pipe","Water heater","Drain clog","Toilet or fixture","Something else"],
    hvac: ["No heat or no AC","Strange noise or smell","Tune-up","New system quote","Something else"],
    electrical: ["Power out in part of the house","Breaker keeps tripping","Outlet or switch","Panel upgrade","Something else"],
    roofing: ["Active leak","Storm damage","Inspection","New roof quote","Something else"],
    garage: ["Door won't open","Broken spring","Opener","New door quote","Something else"],
    // change 53 (APPROVED, David): hair, brow and lash, nail and med-spa
    // doors alike — no injectable as the first job.
    salon: ["Color","Cut and style","Brows and lashes","Facial or skin","Something else"],
    dental: ["Toothache or chip","Cleaning","Filling","Crown","Something else"],
    other: ["New appointment","Quote","Question","Something else"],
  },
  tradeLabels: { plumbing: "Plumbing", hvac: "Heating and air", electrical: "Electrical", roofing: "Roofing", garage: "Garage doors" },
  // change 42: Andy's real voice line for /go demo mode. Texts use
  // contact.smsHref above; calls ring this one.
  goTel: "tel:+18044953492",
  // v2 GO (APPROVED, verbatim): the lead text. {go_url} is filled per row.
  lead: {
    sms: "Hi, Andy here, a Richmond web developer. This is what your customers would see when you miss their call: {go_url}",
  },
};

/* change 50: Salvage Live's copy — the texts, /start, and the legal pages.
   Its own export, like GO_COPY: only server routes and pages read it, so
   the demo's first load never ships it. Same human veto as COPY. */
export const LIVE_COPY = {
  // change 50 (APPROVED, Andy): Salvage Live's texts. {biz} and {go_url}
  // are filled per client; forward shows the owner the caller's number,
  // then their words.
  live: {
    missedText: "{biz}: sorry we missed you. Book or text us here: {go_url} Reply STOP to opt out.",
    forward: "{from}: {body}",
  },

  // change 50: /start — the link Andy texts after a "yes".
  start: {
    // APPROVED (Andy, verbatim).
    agreement:
      "Davy Jones' Locker sets up Salvage for your business: when you miss a call, the caller gets a text with a link to book or text you. $250 at signing includes setup and your first month; then $100 per month, month to month; cancel anytime with 30 days notice. If Salvage does not catch a missed call in your first 30 days, your $250 is refunded. You agree to set call forwarding on your phone (we walk you through it) and to give accurate business details for carrier text registration. Go-live usually takes 3–7 days after registration is approved. Davy Jones' Locker does not guarantee a number of jobs.",
    agree: "I agree",
    pay: "Pay $250 and start",
    // APPROVED (Andy's field list; sentence-cased as labels).
    fields: {
      legalName: "Legal business name",
      ownerCell: "Owner cell",
      carrier: "Cell carrier",
      businessPhone: "Business phone",
      website: "Website",
    },
    carriers: ["Verizon", "AT&T", "T-Mobile", "Other"],
    // APPROVED (Andy, verbatim): a yes/no question in place of an EIN field —
    // only the answer is ever stored or sent, never an EIN.
    einQuestion: "Do you have an EIN?",
    einAnswers: ["Yes", "No"],
    // APPROVED (Andy).
    formTitle: "Your details",
    submit: "Send my details",
    sent: "Got it. Andy will text you to set up call forwarding.",
    error: "Check the fields marked in red and send again.",
    // APPROVED (Andy): the text Andy gets for each submission.
    alert: "Salvage start: {legalName} ({biz}). Owner {ownerCell}, {carrier}. Business {businessPhone}. Web {website}. EIN: {ein}.",
  },

  // change 50 (APPROVED, Andy, as written): the privacy policy and the
  // texting terms carriers ask for, linked from every /go page and from
  // /start.
  legal: {
    privacyLabel: "Privacy",
    termsLabel: "Terms",
    privacy: {
      title: "Privacy",
      updated: "Last updated October 20, 2026",
      sections: [
        { h: "Who we are", p: "Davy Jones' Locker runs Salvage for local businesses in and around Richmond, Virginia. When you call a business that uses Salvage and the call is missed, Salvage sends one text to the number you called from with a link to book or to text the business." },
        { h: "What we collect", p: "Your phone number, the time of the call, and any text you send in reply. If you book through the link, the name, phone number and details you enter." },
        { h: "How we use it", p: "To send that one text, to pass your replies to the business you called, to send the business's replies back to you, and to keep a record so you never get more than one missed-call text from a business in 12 hours." },
        { h: "What we never do", p: "We do not sell, rent or share your phone number, your consent to receive texts, or your messages with anyone for their marketing. Text opt-in data and consent are never shared with third parties or affiliates." },
        { h: "Who helps us", p: "Texts are carried by Twilio, and our records are kept with our hosting and database providers, only to run Salvage." },
        { h: "Your choices", p: "Reply STOP to any Salvage text to stop texts from that business; reply START to opt back in; reply HELP for help. Message and data rates may apply." },
        { h: "Questions", p: "Call or text (757) 807-3318." },
      ],
    },
    terms: {
      title: "Terms",
      updated: "Last updated October 20, 2026",
      sections: [
        { h: "Salvage texts", p: "When a business that uses Salvage misses your call, you get one text from that business's number with a link to book or to text them. Your replies go to the business, and theirs come back to you." },
        { h: "How often", p: "One text per missed call, and never more than one missed-call text from a business in 12 hours, plus any replies in a conversation you start." },
        { h: "Costs", p: "Message and data rates may apply." },
        { h: "Stopping", p: "Reply STOP at any time and you will get no more texts from that business's number. Reply START to opt back in. Reply HELP for help." },
        { h: "Delivery", p: "Carriers are not liable for delayed or undelivered messages." },
        { h: "Businesses", p: "A business that uses Salvage signs the Salvage agreement at signup and is responsible for its own replies." },
        { h: "Contact", p: "Davy Jones' Locker, Chesterfield, Virginia. Call or text (757) 807-3318." },
      ],
    },
  },
};

/* change 45: the front door's bookable starts are DATA. The server reads
   them here and hands them to the client island as props, so lib/go.ts
   never imports this file. change 45.1: the HOURS moved onto each preset
   (dental opens at 8); this holds what every door shares. Four starts a
   day, each at least leadMinutes out. */
export const GO_SCHEDULE = {
  tz: "America/New_York",
  starts: [
    [8, 0],
    [10, 0],
    [13, 0],
    [15, 0],
  ] as [number, number][],
  slotMinutes: 60,
  leadMinutes: 60,
  openDays: 3,
};

/* change 45.1: each job's hand-drawn glyph (app/go/glyphs.tsx), keyed by
   the approved job STRING — reordering GO_COPY.jobs can never mismatch a
   glyph, and renaming a job leaves it without one, which gate 223 holds
   red until this map follows. */
export const JOB_GLYPH: Record<string, string> = {
  "Leak or burst pipe": "pipe-burst",
  "Water heater": "water-heater",
  "Drain clog": "drain",
  "Toilet or fixture": "toilet",
  "No heat or no AC": "thermostat",
  "Strange noise or smell": "noise",
  "Tune-up": "wrench",
  "New system quote": "condenser",
  "Power out in part of the house": "power-out",
  "Breaker keeps tripping": "breaker",
  "Outlet or switch": "outlet",
  "Panel upgrade": "panel",
  "Active leak": "roof-leak",
  "Storm damage": "storm",
  "Inspection": "inspect",
  "New roof quote": "roof-new",
  "Door won't open": "garage-stuck",
  "Broken spring": "spring",
  "Opener": "opener",
  "New door quote": "garage-new",
  "Color": "dye",
  "Cut and style": "scissors",
  "Brows and lashes": "lash",
  "Facial or skin": "face",
  "Toothache or chip": "tooth-chip",
  "Cleaning": "toothbrush",
  "Filling": "filling",
  "Crown": "crown",
  "New appointment": "calendar-plus",
  "Quote": "document",
  "Question": "question",
  "Something else": "else",
};

export const PRESETS: Preset[] = [
  {
    id: "salon", label: "Salon and Spa", bizName: "Harbor Row Aesthetics",
    customerName: "Danielle R.",
    accent: "#E8A0B4", accentSoft: "#4A2838", accentInk: "#1A0C12",
    // change 53 (APPROVED, David): salon-sized figures — a color at $140,
    // not a filler at $340. Stored, never derived.
    ticket: 140, missedPerMonth: 12, callsCaught: 4, recovered: 410, lost: 1680,
    // change 53: customers come to a salon — no service radius.
    radius: null,
    hours: { days: [1, 2, 3, 4, 5, 6], open: 7, close: 18 },
    sinceCalls: 31, sinceRecovered: 3720,
    // Entry [0] is this thread's own booking. Sum of all 4 amounts === recovered.
    caught: [
      // change 53 (APPROVED, David): salon bookings. Sum 410 === recovered.
      { name: "Danielle R.", number: "(804) 555-0142", detail: "Thu 2:00 with Marisa · color", amount: 140, date: "Mar 14" },
      { name: "Renee K.", number: "(804) 555-0119", detail: "Tue 11:00 with Marisa · haircut", amount: 85, date: "Mar 11" },
      { name: "Alyssa P.", number: "(804) 555-0176", detail: "Sat 9:30 with Priya · brows", amount: 65, date: "Mar 8" },
      { name: "Tara W.", number: "(804) 555-0133", detail: "Wed 4:15 with Marisa · facial", amount: 120, date: "Mar 4" },
    ],
    thread: [
      { from: "business", time: "8:47 PM", text: "This is Harbor Row Aesthetics, sorry we missed you. We're closed for the night, but I can get you on the book right now if you want." },
      { from: "customer", time: "8:52 PM", text: "Yes please. Looking for color, sometime next week." },
      { from: "business", time: "8:53 PM", text: "Tuesday 10:30 or Thursday 2:00 with Marisa. Which works?" },
      { from: "customer", time: "8:56 PM", text: "Thursday 2:00." },
    ],
  },
  {
    id: "home", label: "Home Services", bizName: "Ridgeline Plumbing",
    customerName: "Mark T.",
    accent: "#F0A044", accentSoft: "#4A3418", accentInk: "#1A1206",
    ticket: 850, missedPerMonth: 15, callsCaught: 5, recovered: 4250, lost: 12750,
    radius: 25,
    hours: { days: [1, 2, 3, 4, 5, 6], open: 7, close: 18 },
    sinceCalls: 24, sinceRecovered: 18700,
    caught: [
      { name: "Mark T.", number: "(804) 555-0197", detail: "Tue 8:00 · water heater", amount: 850, date: "Mar 13" },
      { name: "Chris D.", number: "(804) 555-0155", detail: "Fri 1:00 · drain clog", amount: 900, date: "Mar 10" },
      { name: "Elena V.", number: "(804) 555-0184", detail: "Mon 9:00 · toilet install", amount: 1200, date: "Mar 6" },
      // change 27 (C1, APPROVED): shortened for 390 fit only — same booking.
      { name: "Sam O.", number: "(804) 555-0161", detail: "Thu 7:30 · heater replace", amount: 1300, date: "Mar 2" },
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
    accent: "#7CC4E8", accentSoft: "#1C3E5C", accentInk: "#08161F",
    ticket: 600, missedPerMonth: 9, callsCaught: 3, recovered: 1800, lost: 5400,
    radius: 25,
    hours: { days: [1, 2, 3, 4, 5, 6], open: 8, close: 18 },
    sinceCalls: 19, sinceRecovered: 9800,
    caught: [
      // change 27 (C1, APPROVED): the three Nakamura rows shortened to the
      // home-preset "time · service" pattern for 390 fit only.
      { name: "Priya S.", number: "(804) 555-0168", detail: "Fri 9:15 · chipped tooth", amount: 600, date: "Mar 12" },
      { name: "Owen L.", number: "(804) 555-0122", detail: "Wed 10:30 · cleaning", amount: 300, date: "Mar 9" },
      { name: "Maya F.", number: "(804) 555-0147", detail: "Mon 2:00 with Dr. Osei · filling", amount: 400, date: "Mar 5" },
      { name: "Luis R.", number: "(804) 555-0109", detail: "Thu 3:45 · crown", amount: 500, date: "Mar 1" },
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
    accent: "#9BB0C4", accentSoft: "#253546", accentInk: "#0B131B",
    tagline: "Any business that takes calls.",
    ticket: 250, missedPerMonth: 10, callsCaught: 3, recovered: 750, lost: 2500,
    radius: 25,
    hours: { days: [1, 2, 3, 4, 5, 6], open: 7, close: 18 },
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

/* change 21 (A): the canonical domain — share links and OG urls come from
   HERE, never from location.origin and never the vercel.app host. */
export const SITE = { domain: "https://salvage.davyjoneslocker.app" };

/* change 50: client #0's number — Andy's demo line (the /go demo's own
   voice line, GO_COPY.goTel). The live product texts /start submissions to
   Andy from it. Data, E.164. */
export const DEMO_LINE = "+18044953492";

export const SHARE_ORIGIN = SITE.domain;
