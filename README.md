# Evolution Arcade

Free multiplayer browser games at games.evolution-wraps.com.

- `index.html`: arcade landing page
- `games/tic-tac-gone/`: Tic-Tac-Gone (vs computer, same device, online rooms)
- `js/net.js`: shared online helpers (room codes, player ids, Firebase loading)
- `js/firebase-config.js`: paste the Firebase web config here to turn on online play
- `database.rules.json`: Realtime Database rules (paste into Firebase console → Realtime Database → Rules)

It's a static site with no build step, hosted on GitHub Pages, so pushing to `main` publishes it.
