import type { Metadata } from "next";
import { headers } from "next/headers";

import FitName from "@/app/go/FitName";
import GoCard, { type GoCopy } from "@/app/go/GoCard";
import { COPY } from "@/lib/client.config";
import { isInApp, isIOS, isOpenAt, nextSlot, prettyPhone, telNumber } from "@/lib/go";
import { jobsFor, ogQuery, resolveGoParams, tradeLabel } from "@/lib/go-params";

/*
 * change 42: /go — the page a business's customer lands on from a
 * missed-call text or a QR code. Server-rendered; it imports none of the
 * demo's engine, audio or rAF code. Everything the client needs arrives as
 * props, so lib/client.config.ts stays out of the client bundle.
 *
 * Next 16 hands searchParams as a Promise (see app/page.tsx).
 */
type SP = Promise<{ [key: string]: string | string[] | undefined }>;

/* The opengraph-image file convention receives params only, never the
   query, and a file-based og:image overrides this one. The per-business
   card is the route handler at /go/og, wired here from RESOLVED values. */
export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const p = resolveGoParams(await searchParams);
  const trade = tradeLabel(p);
  const description = trade ? `${trade} · ${COPY.go.book}` : COPY.go.book;
  const image = { url: `/go/og?${ogQuery(p)}`, width: 1200, height: 630, alt: p.biz };
  return {
    title: p.biz,
    description,
    /* A page per lead, under the lead's own business name: never indexed. */
    robots: { index: false, follow: false },
    openGraph: { title: p.biz, description, url: "/go", siteName: "Salvage", type: "website", images: [image] },
    twitter: { card: "summary_large_image", title: p.biz, description, images: [image.url] },
  };
}

/* The request's clock, read once — outside render, like ledgerDates(). */
function requestClock() {
  const now = Date.now();
  return { open: isOpenAt(now), next: nextSlot(now) };
}

export default async function GoPage({ searchParams }: { searchParams: SP }) {
  const p = resolveGoParams(await searchParams);
  const ua = (await headers()).get("user-agent") ?? "";
  const { open, next } = requestClock();

  /* Demo mode and live mode ring the same lines today: the URL carries no
     business number. Demo mode adds the folio note and the owner's side. */
  const tel = COPY.goTel;
  const copy: GoCopy = { ...COPY.go, recoveredLabel: COPY.ledger.recoveredLabel, notify: COPY.notify };

  return (
    <GoCard
      biz={p.biz}
      nameSlot={<FitName biz={p.biz} />}
      presetId={p.presetId}
      trade={tradeLabel(p)}
      jobs={jobsFor(p)}
      emergency={p.presetId === "home"}
      demo={p.demo}
      refId={p.ref}
      lead={p.lead}
      accent={p.preset.accent}
      accentInk={p.preset.accentInk}
      ticket={p.preset.ticket}
      tel={tel}
      telPretty={prettyPhone(telNumber(tel))}
      smsBase={COPY.contact.smsHref}
      ios={isIOS(ua)}
      inApp={isInApp(ua)}
      open={open}
      nextLabel={next?.label ?? ""}
      copy={copy}
    />
  );
}
