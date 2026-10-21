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
function Line({ text }: { text: string }) {
  return (
    <p data-start-price className="text-[17px] text-ink">
      {text.split(/(\$[\d,]+)/).map((part, i) =>
        /^\$[\d,]+$/.test(part) ? (
          <span key={i} data-figure="data">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

const field = "mt-1.5 block h-14 w-full border-x-0 border-b border-t-0 border-solid border-muted bg-transparent text-[17px] text-ink outline-none focus:border-teal";

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
    <main data-start className="min-h-svh bg-abyss px-6 pb-16 pt-12 text-ink">
      <div className="mx-auto w-full max-w-[560px]">
        <h1 data-start-biz className="font-display text-[44px] font-medium leading-[1.04] tracking-[-0.01em] text-ink">
          {biz || COPY.productName}
        </h1>
        {trade && <p className="mt-2 text-[13px] font-medium uppercase tracking-[0.04em] text-muted">{GO_COPY.tradeLabels[trade as keyof typeof GO_COPY.tradeLabels]}</p>}

        <div className="mt-8 flex flex-col gap-1.5 border-y border-line py-4">
          {[COPY.price.line, COPY.price.monthly, COPY.price.guarantee, COPY.price.founding].map((l) => (
            <Line key={l} text={l} />
          ))}
        </div>

        <p data-start-agreement className="mt-6 text-[16px] leading-relaxed text-ink">
          {S.agreement}
        </p>

        <AgreePay agree={S.agree} pay={S.pay} href={payHref(biz)} />

        <div className="mt-12 border-t border-line pt-8">
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
                <span className="text-[17px] font-medium text-muted">{S.fields.legalName}</span>
                <input name="legalName" required autoComplete="organization" aria-invalid={err("legalName")} className={field} />
              </label>
              <label className="block">
                <span className="text-[17px] font-medium text-muted">{S.fields.ownerCell}</span>
                <input name="ownerCell" type="tel" inputMode="tel" required autoComplete="tel-national" aria-invalid={err("ownerCell")} className={field} />
              </label>
              <label className="block">
                <span className="text-[17px] font-medium text-muted">{S.fields.carrier}</span>
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
                <span className="text-[17px] font-medium text-muted">{S.fields.businessPhone}</span>
                <input name="businessPhone" type="tel" inputMode="tel" required autoComplete="tel" aria-invalid={err("businessPhone")} className={field} />
              </label>
              <label className="block">
                <span className="text-[17px] font-medium text-muted">{S.fields.website}</span>
                <input name="website" type="url" inputMode="url" autoComplete="url" aria-invalid={err("website")} className={field} />
              </label>
              {/* Andy's veto: a yes/no, never the number itself. */}
              <fieldset data-start-ein aria-invalid={err("hasEin")} className="block border-0 p-0">
                <legend className="text-[17px] font-medium text-muted">{S.einQuestion}</legend>
                <div className="mt-2 flex gap-6">
                  {(["yes", "no"] as const).map((v, i) => (
                    <label key={v} className="flex min-h-11 cursor-pointer items-center gap-2 text-[17px] text-ink">
                      <input type="radio" name="hasEin" value={v} required className="h-5 w-5 accent-[var(--color-teal)]" />
                      {S.einAnswers[i]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <button type="submit" data-start-submit className="mt-2 self-start rounded-full border border-teal px-7 py-3 text-[17px] font-medium text-teal outline-none focus-visible:outline-2 focus-visible:outline-teal focus-visible:outline-offset-2">
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
