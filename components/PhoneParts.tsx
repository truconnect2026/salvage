import { type ReactNode } from "react";

/* change 48: the pieces both phones share — the owner's phone (section 1,
   components/PhoneOwner.tsx) and the thread phones (sections 2-3 and the OG
   card, components/Phone.tsx) — moved out of Phone.tsx verbatim, so the
   first load carries the owner's phone and nothing of the thread phones. */

/* Hand-written status glyphs. No emoji, no icon library. */

function SignalGlyph() {
  return (
    <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor" aria-hidden="true">
      <path d="M0 7.6h2.6V11H0z" />
      <path d="M4.8 5.4h2.6V11H4.8z" />
      <path d="M9.6 2.9h2.6V11H9.6z" />
      <path d="M14.4 0h2.6v11h-2.6z" />
    </svg>
  );
}

function WifiGlyph() {
  /* change 30 (B5): FILLED arcs — annular sectors, no strokes. */
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor" aria-hidden="true">
      <path d="M8 0C4.9 0 2.1 1.2 0 3.2l1.5 1.6C3.2 3.2 5.5 2.2 8 2.2s4.8 1 6.5 2.6L16 3.2C13.9 1.2 11.1 0 8 0z" />
      <path d="M8 4.4c-2 0-3.8.8-5.1 2.1l1.5 1.6C5.3 7.2 6.6 6.6 8 6.6s2.7.6 3.6 1.5l1.5-1.6C11.8 5.2 10 4.4 8 4.4z" />
      <path d="M8 8.8c-.9 0-1.7.4-2.3 1L8 12l2.3-2.2c-.6-.6-1.4-1-2.3-1z" />
    </svg>
  );
}

export function StatusGlyphs() {
  /* change 36 (B5): the cluster is 17px tall with 6px gaps. */
  return (
    <span data-status-cluster className="flex h-[17px] items-center gap-[6px] text-white">
      <span data-glyph="signal" className="flex">
        <SignalGlyph />
      </span>
      <span data-glyph="wifi" className="flex">
        <WifiGlyph />
      </span>
      <BatteryGlyph />
    </span>
  );
}

function BatteryGlyph() {
  /* change 36 (B5): the fill is inset 1px inside the shell, the way iOS
     draws it — a filled lozenge floating in the casing, not a flush block. */
  return (
    <svg width="25" height="12" viewBox="0 0 25 12" aria-hidden="true">
      <path
        d="M3.4 0.7h14.9a2.7 2.7 0 0 1 2.7 2.7v5.2a2.7 2.7 0 0 1-2.7 2.7H3.4a2.7 2.7 0 0 1-2.7-2.7V3.4A2.7 2.7 0 0 1 3.4 0.7z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.55"
      />
      <path
        data-battery-fill
        d="M3.9 2.9h10.5a1.2 1.2 0 0 1 1.2 1.2v3.8a1.2 1.2 0 0 1-1.2 1.2H3.9a1.2 1.2 0 0 1-1.2-1.2V4.1a1.2 1.2 0 0 1 1.2-1.2z"
        fill="currentColor"
      />
      <path d="M22.4 4.1c1.3 0.5 1.3 3.3 0 3.8z" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

/* Filled hang-up handset for the call screen's End button. */
export function HandsetGlyph() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 16 16"
      aria-hidden="true"
      style={{ transform: "rotate(135deg)" }}
    >
      <path
        d="M13.6 11.3l-2.1-1.5a1 1 0 0 0-1.3.2l-.7.9a9.6 9.6 0 0 1-3.4-3.4l.9-.7a1 1 0 0 0 .2-1.3L5.7 3.4a1 1 0 0 0-1.4-.2l-1 .8a1.7 1.7 0 0 0-.5 1.8 13.2 13.2 0 0 0 8.4 8.4 1.7 1.7 0 0 0 1.8-.5l.8-1a1 1 0 0 0-.2-1.4z"
        fill="currentColor"
      />
    </svg>
  );
}

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 2)
    .toUpperCase();


/* change 35 (A1): the titanium band. One gradient, reused by the nubs, so
   the rim and the hardware read as a single machined piece. The device's
   shadow pair lives in globals.css on [data-phone-rim], not here: the A5
   entry grows it from the bare contact shadow, and an inline box-shadow
   would outrank the rule that does the growing. */
export const RIM = "linear-gradient(135deg, #C9CDD3 0%, #6B7078 45%, #2A2E34 100%)";

/* The real device's shell (aspect mode): body, slab, sonar, nubs, rim,
   glass, and the scaled screen the children fill. */
export function PhoneDevice({
  children,
  staticDevice = false,
  slab = false,
  sonar = false,
}: {
  children: ReactNode;
  staticDevice?: boolean;
  slab?: boolean;
  sonar?: boolean;
}) {
  /* change 35 (A1): the real device — a 390x810 body (ratio 2.077, gate
     194) in three layers, outermost first: a 2px titanium RIM at r55, 13px
     of GLASS at r53, and the SCREEN at r40, inset 15 from the body edge on
     all four sides. Height always follows width; the screen zooms
     uniformly inside the glass. */
  return (
    <div
      data-phone-device
      data-client-world
      {...(staticDevice ? { "data-phone-static": true } : {})}
      className="relative mx-auto aspect-[390/810] w-full max-w-[390px] shrink-0"
    >
      {/* z -1: the device wrapper creates no stacking context, so the slab
          and rings escape BEHIND the section's content — a flex `order`ed
          sibling would otherwise paint the full-height band over the
          section's text (change 18 review, lens 1 finding 1). */}
      {/* change 26 (A2): the slab's right edge lands at 33% of the device
          width — the band sits mostly LEFT of the phone and the phone
          breaks its edge through its left third. */}
      {slab && (
        <div
          aria-hidden="true"
          data-accent-slab
          data-slab
          className="absolute -left-[31.1%] -z-1 w-[62%] bg-[var(--accent-soft,#0F1E33)]"
          style={{ top: "-150vh", bottom: "-150vh" }}
        />
      )}
      {sonar && (
        <svg
          aria-hidden="true"
          data-sonar
          className="pointer-events-none absolute left-1/2 top-1/2 -z-1 -translate-x-1/2 -translate-y-1/2"
          width="2800"
          height="2800"
          viewBox="0 0 2800 2800"
        >
          <circle data-sonar-ring="0" cx="1400" cy="1400" r="0" fill="none" stroke="var(--accent, var(--color-teal))" strokeWidth="1" opacity="0" />
          <circle data-sonar-ring="1" cx="1400" cy="1400" r="0" fill="none" stroke="var(--accent, var(--color-teal))" strokeWidth="1" opacity="0" />
        </svg>
      )}
      {/* change 35 (A2): three nubs ON the rim, in the rim gradient — two
          volume (30 tall, 10 apart, from 92) left, one power (56, from 104)
          right, 2.5px proud. Nothing else on the body: the change-33
          two-tone frame and the change-17 masked specular are both gone,
          because the rim gradient IS the specular now. */}
      <div aria-hidden="true" data-nub className="absolute -left-[2.5px] top-[92px] h-[30px] w-[2.5px] rounded-l-[2px]" style={{ background: RIM }} />
      <div aria-hidden="true" data-nub className="absolute -left-[2.5px] top-[132px] h-[30px] w-[2.5px] rounded-l-[2px]" style={{ background: RIM }} />
      <div aria-hidden="true" data-nub className="absolute -right-[2.5px] top-[104px] h-[56px] w-[2.5px] rounded-r-[2px]" style={{ background: RIM }} />

      <div
        data-phone-rim
        className="absolute inset-0 rounded-[55px] p-[2px]"
        style={{ background: RIM }}
      >
        <div data-phone-glass className="h-full w-full rounded-[53px] bg-[#050608] p-[13px]">
          <div data-screen-fit="aspect" className="overflow-hidden rounded-[40px]">
            <div
              data-phone-screen
              className="flex flex-col overflow-hidden bg-black font-phone"
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
