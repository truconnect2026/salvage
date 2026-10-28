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
    <div data-start-agree className="mt-5 flex flex-col gap-4">
      <label className="start-agree-row">
        <input
          type="checkbox"
          data-agree
          checked={ok}
          onChange={(e) => setOk(e.target.checked)}
          className="start-check h-6 w-6 shrink-0 accent-[var(--color-teal)]"
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
        className="start-pay outline-none focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2"
      >
        {pay}
      </a>
    </div>
  );
}
