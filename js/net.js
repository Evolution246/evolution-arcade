// Shared online helpers for every arcade game (Firebase Realtime Database).
import { firebaseConfig } from "./firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
export const onlineReady = Boolean(firebaseConfig.apiKey && firebaseConfig.databaseURL);

let fb = null;
export async function net() {
  if (!onlineReady) throw new Error("Online play isn't switched on yet.");
  if (fb) return fb;
  const [{ initializeApp }, db] = await Promise.all([
    import(SDK + "firebase-app.js"),
    import(SDK + "firebase-database.js"),
  ]);
  const app = initializeApp(firebaseConfig);
  fb = { ...db, db: db.getDatabase(app) };
  return fb;
}

// A per-browser player id so a refresh puts you back in your seat.
export function playerId() {
  let id = null;
  try { id = localStorage.getItem("evo-arcade-id"); } catch {}
  if (!id) {
    id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    try { localStorage.setItem("evo-arcade-id", id); } catch {}
  }
  return id;
}

// Room codes skip look-alike characters (0/O, 1/I/L).
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function newCode() {
  let c = "";
  for (let i = 0; i < 4; i++) c += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  return c;
}
export const cleanCode = (s) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);

// Look up which game a room belongs to (used by the arcade's "Join" box).
export async function roomGame(code) {
  const { db, ref, get } = await net();
  const snap = await get(ref(db, `rooms/${code}/game`));
  return snap.exists() ? snap.val() : null;
}

export const GAME_PATHS = {
  "tic-tac-gone": "games/tic-tac-gone/",
};
