/*
 * change 42: the business name — the largest display size that fits in two
 * lines, measured in the browser. A server component: the inline script
 * ships in the HTML and runs before first paint, never in the client bundle.
 */
/* ---------- the name: largest size that fits in 2 lines, measured -------- */

/* Runs inline, during parse — before first paint — and again when the web
   font lands and on resize. A binary search over whole pixels: a size fits
   when no word overflows the column and the block is at most two lines.
   Only a word too long for the column at the 26px floor reruns the search
   with breaks allowed anywhere (floor 14px) — still two lines. */
const FIT_JS = `(function(){var el=document.currentScript&&document.currentScript.previousElementSibling;if(!el)return;function search(wrap,lo,hi){el.style.overflowWrap=wrap;var best=0;while(lo<=hi){var m=(lo+hi)>>1;el.style.fontSize=m+"px";var lh=parseFloat(getComputedStyle(el).lineHeight)||m*1.04;if(el.scrollWidth<=el.clientWidth+0.5&&el.offsetHeight<=lh*2+1){best=m;lo=m+1}else hi=m-1}return best}function fit(){if(!el.clientWidth)return;var best=search("normal",26,64);if(!best)best=search("anywhere",14,64)||14;el.style.fontSize=best+"px";el.setAttribute("data-fit",String(best))}window.__goFit=fit;fit();if(document.fonts&&document.fonts.ready)document.fonts.ready.then(fit);addEventListener("resize",fit)})();`;

export default function FitName({ biz }: { biz: string }) {
  /* No-JS estimate only: ~0.52em per glyph across two 358px lines. The
     script replaces it with a measurement before first paint. */
  const est = Math.max(26, Math.min(64, Math.floor((2 * 358) / (Math.max(biz.length, 1) * 0.52))));
  return (
    <>
      <h1
        data-go-name
        className="font-display font-medium text-ink"
        style={{ ["--go-name-est" as string]: `${est}px` }}
        suppressHydrationWarning
      >
        {biz}
      </h1>
      {/* Server-rendered, so it runs during parse; GoCard re-calls
          window.__goFit after hydration. */}
      <script dangerouslySetInnerHTML={{ __html: FIT_JS }} />
    </>
  );
}
