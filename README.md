# AURA FARMING SIMULATOR: LOCKED IN BATTLE EDITION 2027

Stand there. Look cool. Bluff.

An async aura battle. Put a style on the board, sealed, and farm aura while it stands. Someone steps up with a style
of their own, both are revealed at once, and the style that beats the other wins.

- **Styles**: 💎 DRIP > 😏 RIZZ > 🗿 MOG > 💎 DRIP. The same style is a draw (MUTUAL MOG).
- **AURA FARM**: pick a style and tap FARM AURA to put it on the board. While it stands untaken you farm 50,000 aura every hour (up to 3
  farms up at once, and FARM AURA is greyed out while you have 3; each stays up 24 hours, then expires: "Your time is up").
- **Aura**: win +500,000 (AURA FARMED), lose -500,000 (COOKED), a draw changes nothing. The 500,000 goes up 50,000 for each whole hour the farm stood before it was taken (1,100,000 at 12 hours).
- **Records**: once a farm is taken, both styles are public. The Farm tab shows each poster's latest 10 styles, so the
  thing to read is how someone plays.
- **FLEX**: take a farm with your style. Their card flips over, the winning emoji does its thing to the other one, and
  the farm's line ("MOG couldn't handle the RIZZ.") and result stamp in (`public/reveal.js`). Phones with Reduce Motion on get
  a fade-only version: their card fades over, the loser fades to grey, and the line and result fade in.
- **The ledger**: every finished farm, sealed in a SHA-256 hash chain with both styles' fingerprints and the farm's line.
  After each one, the chain's length and newest fingerprint go to the shared registry (dungeon-items `REGISTRY`) as a
  checkpoint, with the line. Card
  duels from v0.1-v0.5 stay on it as they were sealed.
- **Every farm has a page**: aura.88x31.app/?farm=N (the browser's back button works). Your own open farm shows the
  time left, a progress bar and a rolled-up Details panel (earned so far, your aura, your record, its fingerprint). A farm
  you can take has a Details panel under FLEX with what is public about it. A finished farm has a Results panel (who
  played what, the aura, when, and each side's fingerprint with the salt that opens it) and its whole ledger entry
  (record, prev, hash), with a link to its entry on The Registry.
- **Save codes and passkeys**: the shared Accounts service (dungeon-items `ACCOUNTS.md`, bound as `ACCOUNTS`). This game
  keeps its own players and cookie; a device loaded later gets its own token in `sessions`.

## Screens

Live at aura.88x31.app. Four tabs at the bottom; a reload stays on the tab you were on (`?tab=board`, `?tab=top`,
`?tab=ledger`; Home is the plain address).

- **🏠 Home**: "(your name)'s AURA FARM". Pick a style, FARM AURA, and your farms (open, finished, timed out) are listed
  below with the time left.
- **🌾 The Farm**: every open farm, whoever has been farming the longest first, with what it is worth now, the
  poster's latest styles and how long it has been up. Tap FLEX to take one.
- **🏆 Today**: the AURA LEADERBOARD for the day. The top 3 portraits glow.
- **📜 About**: a short how-to-play panel, then "Legends of AURA", the hash-chained ledger. Tap an entry to open its farm. (The address is still `?tab=ledger`.)

Each player has a profile pic, one of 24 emojis, the same on every screen: the one they picked (tap it on the player
screen), or else one picked from their name. Names are random two-word slang names ("🎲 reroll name"), 16 characters
at most.

## Running it

Cloudflare Worker + static assets + D1, like scoundrel.exe. One-time setup:

```
npx wrangler d1 create aura-db           # put the id in wrangler.jsonc
npx wrangler d1 execute aura-db --remote --file=schema.sql
```

Database changes go in `migrations/` (and `schema.sql`), run on the live aura-db before the push that needs them.

Tests: `npm test` (Node 22+, uses node:sqlite in place of D1).
