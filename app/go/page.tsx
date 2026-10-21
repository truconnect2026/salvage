import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";

import FitName from "@/app/go/FitName";
import GoCard, { type GoCopy } from "@/app/go/GoCard";
import { COPY, GO_COPY, LIVE_COPY } from "@/lib/client.config";
import { isInApp, isIOS, prettyPhone, telNumber } from "@/lib/go";
import { jobsFor, ogQuery, proofFor, resolveGoParams, sampleFor, scheduleFor, tradeLabel } from "@/lib/go-params";

/*
 * change 42: /go — the page a business's customer lands on from a
 * missed-call text or a QR code. Server-rendered; it imports none of the
 * demo's engine, audio or rAF code. Everything the client needs arrives as
 * props, so lib/client.config.ts stays out of the client bundle.
 * change 45: the schedule, the proof row and the owner card's sample are
 * config data, resolved here and handed down.
 *
 * Next 16 hands searchParams as a Promise (see app/page.tsx).
 */
type SP = Promise<{ [key: string]: string | string[] | undefined }>;

/* The opengraph-image file convention receives params only, never the
   query, and a file-based og:image overrides this one. The per-business
   card is the route handler at /go/og, wired here from RESOLVED values.
   change 45: the same holds for the manifest — app/manifest.ts is root-only
   and query-blind, so the per-business one is the handler at /go/manifest. */
export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const p = resolveGoParams(await searchParams);
  const trade = tradeLabel(p);
  const description = trade ? `${trade} · ${GO_COPY.go.book}` : GO_COPY.go.book;
  const q = ogQuery(p);
  const image = { url: `/go/og?${q}`, width: 1200, height: 630, alt: p.biz };
  return {
    title: p.biz,
    description,
    /* A page per lead, under the lead's own business name: never indexed. */
    robots: { index: false, follow: false },
    manifest: `/go/manifest?${q}${p.demo ? "&demo=1" : ""}${p.ref ? `&ref=${encodeURIComponent(p.ref)}` : ""}${p.lead ? `&lead=${encodeURIComponent(p.lead)}` : ""}`,
    appleWebApp: { capable: true, title: p.biz, statusBarStyle: "black-translucent" },
    icons: { apple: `/go/icon?${q}&size=180` },
    openGraph: { title: p.biz, description, url: "/go", siteName: "Salvage", type: "website", images: [image] },
    twitter: { card: "summary_large_image", title: p.biz, description, images: [image.url] },
  };
}

/* The browser chrome takes the page's own ground. */
export const viewport: Viewport = { themeColor: "#060B14", colorScheme: "dark", viewportFit: "cover" };

/* iOS Safari proper: not Chrome, Firefox, Edge or the Google app on iOS,
   and not an in-app browser — only Safari has Add to Home Screen there. */
const isIOSSafari = (ua: string) => isIOS(ua) && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua) && !isInApp(ua);

/* The request's clock, read once — outside render, like ledgerDates(). The
   client re-checks against its own on every minute boundary. */
const requestNow = () => Date.now();

export default async function GoPage({ searchParams }: { searchParams: SP }) {
  const p = resolveGoParams(await searchParams);
  const ua = (await headers()).get("user-agent") ?? "";
  const serverNow = requestNow();
  const proof = proofFor(p);

  /* Demo mode and live mode ring the same lines today: the URL carries no
     business number. Demo mode adds the folio note and the owner's side. */
  const tel = GO_COPY.goTel;
  const copy: GoCopy = {
    ...GO_COPY.go,
    recoveredLabel: COPY.ledger.recoveredLabel,
    mark: COPY.productName.charAt(0),
    notify: COPY.notify,
    privacyLabel: LIVE_COPY.legal.privacyLabel,
    termsLabel: LIVE_COPY.legal.termsLabel,
  };

  return (
    <>
    {/* change 45.1: with no script the demo banner can never dock — the
        docked card stands and the banner never shows. */}
    <noscript>
      <style>{"[data-go-banner]{display:none!important}[data-go-sample]{visibility:visible!important}"}</style>
    </noscript>
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
      installHint={isIOSSafari(ua)}
      schedule={scheduleFor(p)}
      serverNow={serverNow}
      proof={proof && { radius: proof.radius, hoursLabel: proof.hoursLabel, hours: proof.hours, reply: proof.reply }}
      sample={sampleFor(p)}
      copy={copy}
    />
    </>
  );
}
