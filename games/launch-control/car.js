// Side-profile supercar (mid-engine wedge) as an SVG string. Wrap colors change the body and rim light.
const TPL = `
  <defs>
    <linearGradient id="P-body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="BODY0"/>
      <stop offset=".4" stop-color="BODY1"/>
      <stop offset="1" stop-color="BODY2"/>
    </linearGradient>
    <linearGradient id="P-rim" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="PAINT" stop-opacity=".35"/>
      <stop offset=".5" stop-color="PAINT"/>
      <stop offset="1" stop-color="PAINT" stop-opacity=".7"/>
    </linearGradient>
    <linearGradient id="P-glass" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#30402f"/>
      <stop offset=".45" stop-color="#080c08"/>
      <stop offset="1" stop-color="#000"/>
    </linearGradient>
    <radialGradient id="P-sheen" cx=".62" cy=".2" r=".6">
      <stop offset="0" stop-color="PAINT" stop-opacity=".16"/>
      <stop offset="1" stop-color="PAINT" stop-opacity="0"/>
    </radialGradient>
    <g id="P-wheel">
      <circle r="36" fill="#030303"/>
      <circle r="34" fill="none" stroke="#1b1b1b" stroke-width="2.5"/>
      <circle r="27" fill="#0c0c0c" stroke="#4a4a4a" stroke-width="1.4"/>
      <g stroke="#7a7a7a" stroke-width="2.6" stroke-linecap="round">
        <path d="M0-25V-7M0 25V7"/>
        <path d="M0-25V-7M0 25V7" transform="rotate(36)"/>
        <path d="M0-25V-7M0 25V7" transform="rotate(72)"/>
        <path d="M0-25V-7M0 25V7" transform="rotate(108)"/>
        <path d="M0-25V-7M0 25V7" transform="rotate(144)"/>
      </g>
      <path d="M-22-11A24 24 0 0 1-11-22" stroke="CALIPER" stroke-width="5" stroke-opacity=".85" fill="none" stroke-linecap="round"/>
      <circle r="6" fill="#1a1a1a" stroke="#888" stroke-width="1.2"/>
    </g>
  </defs>
  <ellipse cx="228" cy="138" rx="220" ry="6" fill="#000" opacity=".8"/>

  <!-- rear wing -->
  <path d="M30 46 L34 34 M50 45 L52 33" stroke="#0c110c" stroke-width="4"/>
  <path d="M4 33 L64 30 L66 34 L6 38 Z" fill="#0c110c" stroke="url(#P-rim)" stroke-width="1.4"/>

  <!-- body -->
  <path id="shell" d="M18 98 L14 64 L10 50 L26 46 L78 47 L150 40 L196 30 L236 28 L300 60 L372 72 L426 84 L444 92 L440 100 L379 100 A39 39 0 0 0 301 100 L139 100 A39 39 0 0 0 61 100 L18 100 Z" fill="url(#P-body)"/>
  <path d="M18 98 L14 64 L10 50 L26 46 L78 47 L150 40 L196 30 L236 28 L300 60 L372 72 L426 84 L444 92 L440 100 L379 100 A39 39 0 0 0 301 100 L139 100 A39 39 0 0 0 61 100 L18 100 Z" fill="url(#P-sheen)"/>

  <!-- rim light on the top edge -->
  <path d="M10 50 L26 46 L78 47 L150 40 L196 30 L236 28 L300 60 L372 72 L426 84 L444 92" fill="none" stroke="url(#P-rim)" stroke-width="2.2" stroke-linejoin="round"/>
  <!-- wheel-arch lips -->
  <path d="M379 100 A39 39 0 0 0 301 100" fill="none" stroke="PAINT" stroke-opacity=".45" stroke-width="1.4"/>
  <path d="M139 100 A39 39 0 0 0 61 100" fill="none" stroke="PAINT" stroke-opacity=".45" stroke-width="1.4"/>

  <!-- glass -->
  <path d="M202 34 L236 31 L290 60 L216 62 Z" fill="url(#P-glass)"/>
  <path d="M236 31 L290 60" stroke="#fff" stroke-opacity=".22" stroke-width="1"/>
  <!-- engine-cover slats behind the cabin -->
  <path d="M84 49 L146 43 M88 53.5 L148 47.5 M92 58 L150 52" stroke="#000" stroke-width="2.2"/>

  <!-- big side intake -->
  <path d="M152 66 L206 61 L196 94 L148 96 Z" fill="#000"/>
  <path d="M152 66 L206 61 L196 94" fill="none" stroke="url(#P-rim)" stroke-width="1.6"/>
  <path d="M160 72 L201 68 M158 79 L199 75 M156 86 L197 82" stroke="#181818" stroke-width="2"/>

  <!-- sharp character line + rocker -->
  <path d="M432 90 L310 76 L214 68" fill="none" stroke="PAINT" stroke-opacity=".6" stroke-width="1.3"/>
  <path d="M296 99 L146 99" stroke="PAINT" stroke-opacity=".3" stroke-width="1.2"/>
  <path d="M290 62 L294 97" stroke="#000" stroke-width="1.2"/>

  <!-- mirror -->
  <path d="M284 56 L300 51 L303 57 L290 60 Z" fill="#0c110c" stroke="url(#P-rim)" stroke-width="1"/>

  <!-- lights -->
  <path d="M398 78 L436 88" stroke="#f2fff0" stroke-width="3" stroke-linecap="round"/>
  <path d="M404 84 L430 90" stroke="#f2fff0" stroke-opacity=".35" stroke-width="1.2" stroke-linecap="round"/>
  <path d="M12 54 L36 52" stroke="#ff2a2a" stroke-width="3.4" stroke-linecap="round"/>
  <path d="M12 54 L36 52" stroke="#ff2a2a" stroke-width="9" stroke-opacity=".18" stroke-linecap="round"/>

  <!-- splitter + diffuser -->
  <path d="M386 101 L442 99" stroke="#000" stroke-width="3"/>
  <path d="M18 100 L58 100" stroke="#000" stroke-width="3"/>
  <path d="M22 92 L30 100 M32 92 L40 100 M42 92 L50 100" stroke="#000" stroke-width="2"/>

  <g class="wR" transform="translate(100 101)"><use href="#P-wheel"/></g>
  <g class="wF" transform="translate(340 101)"><use href="#P-wheel"/></g>
`;

export const WRAPS = [
  { id: "matrix", name: "Blackout · Green", body: ["#1c241c", "#0c110c", "#020302"], rim: "#39ff14", cal: "#39ff14" },
  { id: "black", name: "Gloss Black", body: ["#2a2e31", "#0e1012", "#020203"], rim: "#e9f1f5", cal: "#ff3b3b" },
  { id: "silver", name: "Satin Silver", body: ["#c9d1d6", "#8a949a", "#3c4347"], rim: "#ffffff", cal: "#ffb000" },
  { id: "orange", name: "Gloss Orange", body: ["#ff9a3d", "#e0560a", "#5a1f02"], rim: "#ffd2a8", cal: "#111111" },
  { id: "blue", name: "Electric Blue", body: ["#5aa0ff", "#1e5ae6", "#071c4d"], rim: "#bfe0ff", cal: "#ffd21f" },
  { id: "red", name: "Racing Red", body: ["#ff5a68", "#c8102e", "#40040c"], rim: "#ffc4ca", cal: "#ffd21f" },
  { id: "chrome", name: "Chrome", body: ["#f4f8fb", "#55606a", "#dde5ea"], rim: "#ffffff", cal: "#3dc8ff" },
];
export const wrapById = (id) => WRAPS.find((w) => w.id === id) || WRAPS[0];

export function carSVG(wrapId, prefix) {
  const w = wrapById(wrapId);
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 150">' +
    TPL.replaceAll("P-", prefix + "-").replaceAll("PAINT", w.rim).replaceAll("CALIPER", w.cal)
      .replace("BODY0", w.body[0]).replace("BODY1", w.body[1]).replace("BODY2", w.body[2]) + "</svg>";
}
