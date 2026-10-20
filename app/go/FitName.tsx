/*
 * change 42: the business name — the largest display size that fits in two
 * lines, measured in the browser. A server component: the inline script
 * ships in the HTML and runs before first paint, never in the client bundle.
 */
/* ---------- the name: largest size that fits in 2 lines, measured -------- */

/* Runs inline, during parse — before first paint — and again when the web
   font lands and on resize. change 45 (DESIGN.md): the name takes the
   LARGEST display size — 56, 48, 44 — that fits: no word overflows the
   column and the block is at most two lines. A name too long for two lines
   at 44 drops below the scale by binary search (floor 26), and only a word
   too long for the column there reruns it with breaks allowed anywhere
   (floor 14) — still two lines. */
const FIT_JS = `(function(){var first=document.currentScript&&document.currentScript.previousElementSibling;if(!first)return;var el=first;function fits(m){el.style.fontSize=m+"px";var lh=parseFloat(getComputedStyle(el).lineHeight)||m*1.04;return el.scrollWidth<=el.clientWidth+0.5&&el.offsetHeight<=lh*2+1}function search(wrap,lo,hi){el.style.overflowWrap=wrap;var best=0;while(lo<=hi){var m=(lo+hi)>>1;if(fits(m)){best=m;lo=m+1}else hi=m-1}return best}function fit(){el=document.querySelector("[data-go-name]")||first;if(!el.clientWidth)return;el.style.overflowWrap="normal";var steps=[56,48,44],best=0;for(var i=0;i<steps.length;i++){if(fits(steps[i])){best=steps[i];break}}if(!best)best=search("normal",26,43);if(!best)best=search("anywhere",14,43)||14;el.style.fontSize=best+"px";el.setAttribute("data-fit",String(best))}window.__goFit=fit;fit();if(document.fonts&&document.fonts.ready)document.fonts.ready.then(fit);addEventListener("resize",fit)})();`;

export default function FitName({ biz }: { biz: string }) {
  /* No-JS estimate only: ~0.52em per glyph across two 358px lines. The
     script replaces it with a measurement before first paint. */
  const est = Math.max(26, Math.min(56, Math.floor((2 * 358) / (Math.max(biz.length, 1) * 0.52))));
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
