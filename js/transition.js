// Page transition for the arcade. Loaded as a plain (non-module) script in <head> so the
// "closed" panels are on screen before the new page paints: no flash between pages.
(function () {
  var KEY = "evo-tx";
  var NAMES = {
    "": "EVOLUTION ARCADE", "tic-tac-gone": "TIC-TAC-GONE", "trick-trap": "TRICK TRAP", "launch-control": "LAUNCH CONTROL",
    "hyperflip": "HYPERFLIP", "grid-strike": "GRID STRIKE", "four-down": "FOUR DOWN",
  };
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var css = "" +
    "#evo-tx{position:fixed;inset:0;z-index:2147483000;pointer-events:none;font-family:Orb,'Arial Black',system-ui,sans-serif}" +
    "#evo-tx .p{position:absolute;left:0;right:0;height:50.5%;background:#050705;" +
      "background-image:linear-gradient(rgba(57,255,20,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(57,255,20,.07) 1px,transparent 1px),repeating-linear-gradient(0deg,rgba(57,255,20,.035) 0 1px,transparent 1px 4px);" +
      "background-size:40px 40px,40px 40px,100% 4px;transition:transform .42s cubic-bezier(.7,0,.25,1)}" +
    "#evo-tx .t{top:0;transform:translateY(-101%);border-bottom:2px solid #39ff14;box-shadow:0 6px 30px rgba(57,255,20,.45)}" +
    "#evo-tx .b{bottom:0;transform:translateY(101%);border-top:2px solid #39ff14;box-shadow:0 -6px 30px rgba(57,255,20,.45)}" +
    "#evo-tx.shut .t,#evo-tx.shut .b{transform:translateY(0)}" +
    "#evo-tx .mid,#evo-tx .low{position:absolute;left:0;right:0;text-align:center;opacity:0;transition:opacity .18s}" +
    "#evo-tx .mid{bottom:calc(50% + 22px)}#evo-tx .low{top:calc(50% + 20px)}" +
    "#evo-tx.shut.show .mid,#evo-tx.shut.show .low{opacity:1}" +
    "#evo-tx .tag{font-family:Mono,ui-monospace,monospace;font-size:11px;letter-spacing:6px;color:#39ff14;margin-bottom:14px}" +
    "#evo-tx .nm{position:relative;display:inline-block;font-weight:900;font-size:clamp(28px,7vw,64px);letter-spacing:4px;color:#fff;text-shadow:0 0 18px rgba(57,255,20,.7);padding:0 12px}" +
    "#evo-tx .nm::before,#evo-tx .nm::after{content:attr(data-t);position:absolute;inset:0;padding:0 12px;overflow:hidden}" +
    "#evo-tx .nm::before{color:#39ff14;clip-path:inset(0 0 55% 0);animation:evoG1 .5s steps(2) infinite}" +
    "#evo-tx .nm::after{color:#ff2a6d;clip-path:inset(60% 0 0 0);animation:evoG2 .45s steps(2) infinite;opacity:.8}" +
    "@keyframes evoG1{0%{transform:translate(-3px,0)}50%{transform:translate(3px,-1px)}100%{transform:translate(-1px,1px)}}" +
    "@keyframes evoG2{0%{transform:translate(3px,0)}50%{transform:translate(-3px,1px)}100%{transform:translate(1px,-1px)}}" +
    "#evo-tx .bar{width:min(320px,70vw);height:4px;margin:0 auto;background:#123012;overflow:hidden}" +
    "#evo-tx .bar i{display:block;height:100%;width:0;background:#39ff14;box-shadow:0 0 12px #39ff14;transition:width .5s cubic-bezier(.3,.7,.3,1)}" +
    "#evo-tx.load .bar i{width:100%}" +
    "#evo-tx .st{font-family:Mono,ui-monospace,monospace;font-size:10px;letter-spacing:3px;color:#6f8a6a;margin-top:10px}" +
    "#evo-tx .flash{position:absolute;left:0;right:0;top:50%;height:2px;margin-top:-1px;background:#fff;box-shadow:0 0 24px 6px #39ff14;opacity:0}" +
    "#evo-tx.open .flash{animation:evoF .5s ease-out}" +
    "@keyframes evoF{0%{opacity:1;transform:scaleX(1)}100%{opacity:0;transform:scaleX(1.4)}}" +
    (reduce ? "#evo-tx .p{transition:opacity .25s!important;transform:none!important;opacity:0}#evo-tx.shut .p{opacity:1}" : "");

  function nameFor(url) {
    var m = url.pathname.match(/\/games\/([^/]+)\//);
    return NAMES[m ? m[1] : ""] || "EVOLUTION ARCADE";
  }
  function build(name) {
    var st = document.createElement("style"); st.textContent = css; (document.head || document.documentElement).appendChild(st);
    var el = document.createElement("div"); el.id = "evo-tx";
    el.innerHTML = '<div class="p t"></div><div class="p b"></div><div class="flash"></div>' +
      '<div class="mid"><div class="tag">&gt; LOADING_</div><div class="nm"></div></div>' +
      '<div class="low"><div class="bar"><i></i></div><div class="st">EVOLUTION ARCADE · INSERT PLAYER 2</div></div>';
    el.querySelector(".nm").textContent = name; el.querySelector(".nm").setAttribute("data-t", name);
    document.documentElement.appendChild(el);
    return el;
  }

  // ---------- arriving: start closed, then split open ----------
  var saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(KEY) || "null"); sessionStorage.removeItem(KEY); } catch (e) {}
  var arriving = saved && Date.now() - saved.t < 6000;
  var el = build(arriving ? saved.name : "");
  if (arriving) {
    el.className = "shut show load";
    var opened = false;
    var open = function () {
      if (opened) return; opened = true;
      setTimeout(function () {
        el.classList.remove("show");
        el.classList.add("open"); el.classList.remove("shut");
        setTimeout(function () { el.className = ""; el.querySelector(".bar i").style.transition = "none"; }, 520);
      }, 260);
    };
    var ready = function () { (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(open); setTimeout(open, 1200); };
    if (document.readyState === "complete") ready(); else addEventListener("load", ready);
  }
  // coming back through the browser's back button from a cached page: make sure it's open
  addEventListener("pageshow", function (e) { if (e.persisted) { el.className = ""; } });

  // ---------- leaving: shut, show the destination, then go ----------
  function go(url) {
    var name = nameFor(url);
    try { sessionStorage.setItem(KEY, JSON.stringify({ name: name, t: Date.now() })); } catch (e) {}
    var nm = el.querySelector(".nm"); nm.textContent = name; nm.setAttribute("data-t", name);
    var bar = el.querySelector(".bar i"); bar.style.transition = "none"; bar.style.width = "0";
    el.style.pointerEvents = "auto";
    el.className = "shut";
    setTimeout(function () {
      el.classList.add("show");
      bar.offsetWidth; bar.style.transition = ""; bar.style.width = "";
      el.classList.add("load");
    }, 380);
    setTimeout(function () { location.href = url.href; }, reduce ? 260 : 820);
  }
  window.evoGo = function (href) { go(new URL(href, location.href)); };
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
    var url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;                         // outside links (evolution-wraps.com) just go
    if (url.pathname === location.pathname) return;                     // same page / #anchors scroll normally
    var p = url.pathname;
    if (!(/\/games\/[^/]+\/?$/.test(p) || /\/(index\.html)?$/.test(p))) return;
    e.preventDefault();
    go(url);
  });
})();
