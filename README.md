# AURA FARMING SIMULATOR: NO CAP BATTLE EDITION 2027

Stand there. Look cool. Bluff.

An async aura battle. Put a style on the board, sealed, and farm aura while it stands. Someone steps up with a style
of their own, both are revealed at once, and the style that beats the other wins.

- **Styles**: 💎 DRIP > 😏 RIZZ > 🗿 MOG > 💎 DRIP. The same style is a draw (MUTUAL MOG).
- **AURA FARM**: pick a style and tap FARM AURA to put it on the board. While it stands untaken you farm 10,000 aura an hour (up to 3
  farms a day; they expire at midnight UTC: "Your time is up").
- **Aura**: win +100,000 (AURA FARMED), lose -100,000 (COOKED), a draw changes nothing.
- **Records**: once a farm is taken, both styles are public. The Farm tab shows each poster's latest 10 styles, so the
  thing to read is how someone plays.
- **FLEX**: take a farm with your style. Their card flips over, the winning emoji does its thing to the other one, and
  the farm's line ("MOG couldn't handle the RIZZ.") and result stamp in (`public/reveal.js`).
- **The ledger**: every finished farm, sealed in a SHA-256 hash chain with both styles' fingerprints and the farm's line.
  After each one, the chain's length and newest fingerprint go to the shared registry (dungeon-items `REGISTRY`) as a
  checkpoint, with the line. Card
  duels from v0.1-v0.5 stay on it as they were sealed.
- **Save codes and passkeys**: the shared Accounts service (dungeon-items `ACCOUNTS.md`, bound as `ACCOUNTS`). This game
  keeps its own players and cookie; a device loaded later gets its own token in `sessions`.

## Running it

Cloudflare Worker + static assets + D1, like scoundrel.exe. One-time setup:

```
npx wrangler d1 create aura-db           # put the id in wrangler.jsonc
npx wrangler d1 execute aura-db --remote --file=schema.sql
```

Database changes go in `migrations/` (and `schema.sql`), run on the live aura-db before the push that needs them.

Tests: `npm test` (Node 22+, uses node:sqlite in place of D1).
