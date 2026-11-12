// Crosshair cursor for the whole arcade (mouse/trackpad only; touch screens keep their normal behavior).
// The center dot glows red whenever the pointer is over something you can click.
const fine = matchMedia("(hover: hover) and (pointer: fine)");
const CLICKABLE = [
  "a[href]", "button", "[role=button]", "input", "select", "textarea", "label", "summary",
  ".tile", ".cell", ".col", ".c.open", ".pad", ".fb", ".lout", ".wraps button", ".card.live",
].join(",");

function setup() {
  if (document.getElementById("xhair")) return;
  const css = document.createElement("style");
  css.id = "xhair-css";
  css.textContent = `
    html.xh, html.xh *{cursor:none!important}
    #xhair{position:fixed;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;pointer-events:none;z-index:2147483647;
      opacity:0;transition:opacity .15s;will-change:transform}
    #xhair.on{opacity:1}
    #xhair svg{width:100%;height:100%;overflow:visible;transition:transform .18s ease}
    #xhair .ring,#xhair .tick{stroke:#39ff14;filter:drop-shadow(0 0 3px rgba(57,255,20,.85))}
    #xhair .dot{fill:#39ff14;transition:fill .12s,filter .12s,r .12s;filter:drop-shadow(0 0 3px rgba(57,255,20,.9))}
    #xhair.hot svg{transform:scale(.82) rotate(45deg)}
    #xhair.hot .dot{fill:#ff2a2a;r:3.4px;filter:drop-shadow(0 0 4px #ff2a2a) drop-shadow(0 0 10px rgba(255,42,42,.9))}
    #xhair.hot .ring,#xhair.hot .tick{stroke:#ffffff;filter:drop-shadow(0 0 1px #000) drop-shadow(0 0 1.5px #000)}
    #xhair.down svg{transform:scale(.7) rotate(45deg)}`;
  document.head.appendChild(css);
  const el = document.createElement("div");
  el.id = "xhair";
  el.innerHTML = `<svg viewBox="-17 -17 34 34" aria-hidden="true">
    <circle class="ring" r="11" fill="none" stroke-width="1.6"/>
    <path class="tick" d="M0-16V-7M0 16V7M-16 0H-7M16 0H7" stroke-width="1.8" stroke-linecap="round"/>
    <circle class="dot" r="2.4"/></svg>`;
  document.body.appendChild(el);

  let x = -100, y = -100, raf = 0;
  const draw = () => { raf = 0; el.style.transform = `translate(${x}px,${y}px)`; };
  const isHot = (t) => {
    const c = t && t.closest ? t.closest(CLICKABLE) : null;
    return !!c && !c.disabled && c.getAttribute("aria-disabled") !== "true";
  };
  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    x = e.clientX; y = e.clientY;
    el.classList.add("on");
    el.classList.toggle("hot", isHot(e.target));
    if (!raf) raf = requestAnimationFrame(draw);
  }, { passive: true });
  addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") el.classList.add("down"); }, { passive: true });
  addEventListener("pointerup", () => el.classList.remove("down"), { passive: true });
  document.addEventListener("mouseleave", () => el.classList.remove("on"));
  addEventListener("blur", () => el.classList.remove("on"));
  document.documentElement.classList.add("xh");
}
function teardown() {
  document.documentElement.classList.remove("xh");
  document.getElementById("xhair")?.remove();
  document.getElementById("xhair-css")?.remove();
}
const apply = () => (fine.matches ? setup() : teardown());
if (document.body) apply(); else addEventListener("DOMContentLoaded", apply);
fine.addEventListener?.("change", apply);
