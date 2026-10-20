/* change 48: shared by components/Demo.tsx (section 1) and
   components/DemoSections.tsx (sections 2-4), moved out of Demo.tsx
   verbatim. */

/* Wayfinding, not headlines (change 13, G3): kicker 12px tracked, title
   Fraunces 28px, muted, 32px inset. Below 1100px the title runs 20px — at
   28px it would sit on the section-1 phone's status row on a 390px screen. */
/* change 18 (B5): the folio mark — "NO. 1 — THE CALL" in one 12px mono
   line, the log's page number. The ONLY uppercase-tracked element class on
   the page (gate 111); the reserve rule from change 16 (content >= 32px
   below it) stands. */
export function SectionMark({ title }: { title: string }) {
  /* change 36 (A3): the title alone, Plex Mono 12px secondary. The
     "No. 1 —" numbering was a step counter on a page that already snaps,
     and it was the same size as content two lines below it. */
  return (
    <div data-section-mark data-chrome="folio" className="pointer-events-none absolute left-8 top-8 z-20">
      <p data-folio data-figure="data" data-ink className="text-[12px] uppercase tracking-[0.04em] text-muted" style={{ transitionDuration: "200ms" }}>
        {title}
      </p>
    </div>
  );
}

/* change 30 (C3): the button system — PRIMARY is the accent fill. */
/* change 30 (C3): SECONDARY — 1px ink stroke at 60%, ink text, hard
   corners, 44px tall. The gold CTA keeps the page's one pill; no teal
   buttons anywhere. */
export const btnSecondary =
  /* change 33 gave this an opaque ground so the accent band could never
     split its label; the band is gone (change 36) and change 40 fixes the
     control as TRANSPARENT: 1px ink stroke at 60%, ink text, 44 tall, one
     kind of button in section 1 — no fill anywhere in it. */
  "h-11 rounded-none border border-[rgba(233,238,244,0.6)] bg-transparent px-3 text-[12px] font-medium text-ink min-[1100px]:px-5 min-[1100px]:text-[15px] " +
  "transition-colors hover:bg-white/5 outline-none " +
  "focus-visible:outline-2 focus-visible:outline-teal focus-visible:outline-offset-2";
