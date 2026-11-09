// Two-seat online rooms (seat "x" = room creator, seat "o" = whoever joins).
// Used by Four Down, Grid Strike and Launch Control. Tic-Tac-Gone has its own copy of this logic.
import { net, playerId, newCode, cleanCode } from "./net.js";

export { cleanCode };
export const me = playerId();

export function myName() {
  try { return localStorage.getItem("evo-arcade-name") || ""; } catch { return ""; }
}
export function saveName(n) {
  n = (n || "").trim().slice(0, 12);
  try { localStorage.setItem("evo-arcade-name", n); } catch {}
  return n;
}

export async function createRoom(game, init = {}) {
  const fb = await net();
  const { db, ref, get, set, serverTimestamp } = fb;
  let code;
  for (let i = 0; i < 6; i++) {
    code = newCode();
    if (!(await get(ref(db, `rooms/${code}/game`))).exists()) break;
  }
  await set(ref(db, `rooms/${code}`), {
    game, created: serverTimestamp(), players: { x: me }, names: { x: myName() || "Player 1" }, ...init,
  });
  return enter(fb, code, "x");
}

export async function joinRoom(game, rawCode) {
  const code = cleanCode(rawCode);
  if (code.length !== 4) throw new Error("Room codes are 4 characters.");
  const fb = await net();
  const { db, ref, get, set, runTransaction } = fb;
  const snap = await get(ref(db, `rooms/${code}`));
  if (!snap.exists()) throw new Error("No room with that code. Double-check it with your friend.");
  const r = snap.val();
  if (r.game !== game) throw new Error("That code is for a different game.");
  if (r.players?.x === me) return enter(fb, code, "x");
  if (r.players?.o === me) return enter(fb, code, "o");
  if (r.players?.o) throw new Error("That room is already full.");
  const res = await runTransaction(ref(db, `rooms/${code}/players/o`), (cur) => (cur ? undefined : me));
  if (!res.committed) throw new Error("Someone else just took that seat.");
  await set(ref(db, `rooms/${code}/names/o`), myName() || "Player 2");
  return enter(fb, code, "o");
}

// Returns a room handle. Call handle.listen(fn) to get the room on every change.
function enter(fb, code, seat) {
  const { db, ref, onValue, set, update, remove, runTransaction, onDisconnect } = fb;
  const base = `rooms/${code}`;
  const here = ref(db, `${base}/online/${seat}`);
  set(here, true);
  onDisconnect(here).remove();
  history.replaceState(null, "", "?room=" + code);
  let unsub = null;
  const h = {
    code, seat, fb,
    other: seat === "x" ? "o" : "x",
    path: (p = "") => ref(db, p ? `${base}/${p}` : base),
    set: (p, v) => set(ref(db, `${base}/${p}`), v),
    update: (obj) => update(ref(db, base), obj),
    remove: (p) => remove(ref(db, `${base}/${p}`)),
    tx: (p, fn) => runTransaction(ref(db, `${base}/${p}`), fn),
    listen(fn) { unsub = onValue(ref(db, base), (s) => fn(s.val())); },
    async close(deleteRoom) {
      unsub?.();
      try { await remove(here); } catch {}
      if (deleteRoom) { try { await remove(ref(db, base)); } catch {} }
      history.replaceState(null, "", location.pathname);
    },
    inviteUrl: () => location.origin + location.pathname + "?room=" + code,
    async share(title, text) {
      const url = h.inviteUrl();
      try {
        if (navigator.share) { await navigator.share({ title, text, url }); return "shared"; }
        await navigator.clipboard.writeText(url); return "copied";
      } catch { return "failed"; }
    },
    // server clock offset (ms), for starting things at the same instant on both phones
    clockOffset() {
      return new Promise((res) => {
        let done = false, u = null;
        const fin = (v) => { if (done) return; done = true; try { u && u(); } catch {} res(v || 0); };
        try { u = onValue(ref(db, ".info/serverTimeOffset"), (s) => fin(s.val())); } catch { fin(0); }
        setTimeout(() => fin(0), 1500);
      });
    },
  };
  return h;
}
