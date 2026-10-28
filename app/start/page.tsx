import type { Metadata } from "next";

import AgreePay from "@/app/start/AgreePay";
import { COPY, GO_COPY, LIVE_COPY, resolveName } from "@/lib/client.config";

/*
 * change 50: /start?biz=<name>&trade=<trade> — the one link Andy texts after
 * a "yes". The business name, the four approved price lines, the approved
 * agreement, "I agree", then the Stripe Payment Link (STRIPE_START_URL, Vercel
 * env), and under it the onboarding form (/api/start). Server-rendered; the
 * only client code is the agree-then-pay pair. Every string is
 * lib/client.config.ts's.
 */
type SP = Promise<{ [key: string]: string | string[] | undefined }>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/* Stripe matches the payment to the shop by client_reference_id
   (letters, digits, dashes, underscores; at most 200). */
const refId = (biz: string) =>
  biz
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 200);

function payHref(biz: string): string | null {
  const base = process.env.STRIPE_START_URL;
  if (!base) return null;
  try {
    const u = new URL(base);
    if (biz) u.searchParams.set("client_reference_id", refId(biz));
    return u.toString();
  } catch {
    return null;
  }
}

/* The figures in mono, the words in sans — the price-line rule on /. */
function Line({ text, lead }: { text: string; lead?: boolean }) {
  return (
    <p data-start-price className={lead ? "start-line start-lead" : "start-line"}>
      {!lead && (
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" className="start-tick">
          <circle cx="10" cy="10" r="9" stroke="currentColor" strokeOpacity="0.35" />
          <path d="M6 10.4l2.6 2.6L14 7.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      <span>
        {text.split(/(\$[\d,]+)/).map((part, i) =>
          /^\$[\d,]+$/.test(part) ? (
            <span key={i} data-figure="data" className="text-gold">
              {part}
            </span>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </span>
    </p>
  );
}

const field = "start-field mt-2 block h-14 w-full px-4 text-[17px] text-ink outline-none";

export default async function StartPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const biz = resolveName(sp.biz);
  const rawTrade = one(sp.trade);
  const trade = rawTrade in GO_COPY.tradeLabels ? rawTrade : "";
  const sent = one(sp.sent) === "1";
  const errors = one(sp.error).split(",").filter(Boolean);
  const S = LIVE_COPY.start;
  const err = (k: string) => errors.includes(k);

  return (
    <main data-start className="start-page min-h-svh px-5 pb-16 pt-12 text-ink">
      <div className="mx-auto w-full max-w-[560px]">
        {trade && <p className="start-eyebrow">{GO_COPY.tradeLabels[trade as keyof typeof GO_COPY.tradeLabels]}</p>}
        <h1 data-start-biz className="mt-2 font-display text-[44px] font-medium leading-[1.04] tracking-[-0.01em] text-ink">
          {biz || COPY.productName}
        </h1>

        <div className="start-offer mt-7">
          <Line text={COPY.price.line} lead />
          <div className="start-rule" />
          <div className="flex flex-col gap-3">
            {[COPY.price.monthly, COPY.price.guarantee, COPY.price.founding].map((l) => (
              <Line key={l} text={l} />
            ))}
          </div>
        </div>

        <p data-start-agreement className="start-terms mt-5">
          {S.agreement}
        </p>

        <AgreePay agree={S.agree} pay={S.pay} href={payHref(biz)} />

        <div className="start-card mt-10">
          {sent ? (
            <p data-start-sent className="text-[17px] font-medium text-ink">
              {S.sent}
            </p>
          ) : (
            <form data-start-form method="post" action="/api/start" className="flex flex-col gap-5" noValidate>
              <h2 className="font-display text-[28px] font-medium leading-tight text-ink">{S.formTitle}</h2>
              <input type="hidden" name="biz" value={biz} />
              <input type="hidden" name="trade" value={trade} />
              {/* No person sees this field. */}
              <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
                <input type="text" name="company_url" tabIndex={-1} autoComplete="off" />
              </div>
              {errors.length > 0 && (
                <p data-start-error role="alert" className="text-[16px] text-ember">
                  {S.error}
                </p>
              )}
              <label className="block">
                <span className="text-[15px] font-medium text-muted">{S.fields.legalName}</span>
                <input name="legalName" required autoComplete="organization" aria-invalid={err("legalName")} className={field} />
              </label>
              <label className="block">
                <span className="text-[15px] font-medium text-muted">{S.fields.ownerCell}</span>
                <input name="ownerCell" type="tel" inputMode="tel" required autoComplete="tel-national" aria-invalid={err("ownerCell")} className={field} />
              </label>
              <label className="block">
                <span className="text-[15px] font-medium text-muted">{S.fields.carrier}</span>
                <select name="carrier" required defaultValue="" aria-invalid={err("carrier")} className={`${field} appearance-none`}>
                  <option value="" disabled>
                    {S.fields.carrier}
                  </option>
                  {(["verizon", "att", "tmobile", "other"] as const).map((v, i) => (
                    <option key={v} value={v}>
                      {S.carriers[i]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[15px] font-medium text-muted">{S.fields.businessPhone}</span>
                <input name="businessPhone" type="tel" inputMode="tel" required autoComplete="tel" aria-invalid={err("businessPhone")} className={field} />
              </label>
              <label className="block">
                <span className="text-[15px] font-medium text-muted">{S.fields.website}</span>
                <input name="website" type="url" inputMode="url" autoComplete="url" aria-invalid={err("website")} className={field} />
              </label>
              {/* Andy's veto: a yes/no, never the number itself. */}
              <fieldset data-start-ein aria-invalid={err("hasEin")} className="block border-0 p-0">
                <legend className="text-[15px] font-medium text-muted">{S.einQuestion}</legend>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  {(["yes", "no"] as const).map((v, i) => (
                    <label key={v} className="start-choice">
                      <input type="radio" name="hasEin" value={v} required className="h-5 w-5 accent-[var(--color-teal)]" />
                      {S.einAnswers[i]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <button type="submit" data-start-submit className="start-submit mt-2 outline-none focus-visible:outline-2 focus-visible:outline-teal focus-visible:outline-offset-2">
                {S.submit}
              </button>
            </form>
          )}
        </div>

        <nav data-legal-links className="mt-12 flex gap-6 text-[13px] text-muted">
          <a href="/privacy" className="underline decoration-[rgba(44,199,182,0.7)] underline-offset-2 outline-none focus-visible:outline-2 focus-visible:outline-teal">
            {LIVE_COPY.legal.privacyLabel}
          </a>
          <a href="/terms" className="underline decoration-[rgba(44,199,182,0.7)] underline-offset-2 outline-none focus-visible:outline-2 focus-visible:outline-teal">
            {LIVE_COPY.legal.termsLabel}
          </a>
        </nav>
      </div>
    </main>
  );
}
