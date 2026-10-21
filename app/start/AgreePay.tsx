"use client";

import { useState } from "react";

/*
 * change 50: "I agree", then the pay button. The link is inert until the box
 * is checked — in React state with JS, and by the stylesheet's :has() rule
 * without it ([data-start-agree] in globals.css), so the no-JS page holds the
 * same contract.
 */
export default function AgreePay({ agree, pay, href }: { agree: string; pay: string; href: string | null }) {
  const [ok, setOk] = useState(false);
  const live = ok && !!href;
  return (
    <div data-start-agree className="mt-6 flex flex-col items-start gap-4">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[17px] font-medium text-ink">
        <input
          type="checkbox"
          data-agree
          checked={ok}
          onChange={(e) => setOk(e.target.checked)}
          className="start-check h-5 w-5 shrink-0 accent-[var(--color-teal)]"
        />
        {agree}
      </label>
      <a
        data-pay
        href={href ?? undefined}
        aria-disabled={!live}
        tabIndex={live ? 0 : -1}
        onClick={(e) => {
          if (!live) e.preventDefault();
        }}
        className="start-pay inline-block rounded-full bg-gold px-8 py-3.5 text-[17px] font-semibold text-abyss outline-none focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2"
      >
        {pay}
      </a>
    </div>
  );
}
