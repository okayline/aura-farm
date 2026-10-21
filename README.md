# AURA FARMING SIMULATOR: NO CAP BATTLE EDITION 2027

Stand there. Look cool. Bluff.

An async bluffing card game. Post a challenge: you're dealt 5 cards and lock in 3, in order. Someone steps up with 3
of their own 5. Both hands are face up; the 3 each side kept are secret. When you post, you also plan a move for each
round: **🔒 LOCK IN**, **🌾 FARM** (double the pot) or **💨 DIP** (fold). Whoever takes it plays straight away, one round
at a time: their pick and your planned move flip together with the round's cards. After 3 rounds, whoever won
more rounds wins the pot.

- **Cards**: 20 cards, no numbers: 6 each of 💎 DRIP, 😏 RIZZ and 🗿 MOG, and 2 🤫 **CAPs**. DRIP > RIZZ > MOG > DRIP;
  same style is a draw; a CAP loses to everything, but winning while holding one is **NO CAP**: +500,000.
- **Rounds**: each round the two cards face off; whoever wins more of the 3 rounds wins the pot.
- **VIBES**: 1 a day, +1 per DIP (up to 3). Spend one to peek at one of their unflipped cards.
- **Standing on the board**: up to 3 open challenges; while one stands untaken you farm 1,000 aura an hour.
- **The ledger**: every finished duel, sealed in a SHA-256 hash chain with both lineups' fingerprints. After each one,
  the chain's length and newest fingerprint go to the shared registry (dungeon-items `REGISTRY`) as a checkpoint.
- **Save codes and passkeys**: the shared Accounts service (dungeon-items `ACCOUNTS.md`, bound as `ACCOUNTS`). This game
  keeps its own players and cookie; a device loaded later gets its own token in `sessions`.

## Running it

Cloudflare Worker + static assets + D1, like scoundrel.exe. One-time setup:

```
npx wrangler d1 create aura-db           # put the id in wrangler.jsonc
npx wrangler d1 execute aura-db --remote --file=schema.sql
npx wrangler secret put DAILY_SECRET     # any long random string
```

Database changes go in `migrations/` (and `schema.sql`), run on the live aura-db before the push that needs them.

Tests: `npm test` (Node 22+, uses node:sqlite in place of D1).
