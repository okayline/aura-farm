# AURA FARMING SIMULATOR: NO CAP BATTLE EDITION 2027

Stand there. Look cool. Bluff.

An async bluffing card game. Post a challenge: you're dealt 5 cards and keep 3, in order. Someone steps up with 3
of their own 5. Both hands are face up; which 3 each side kept, and their order, are secret. The two lineups face off
card by card the moment it's taken: whoever wins more of the 3 face-offs wins. The bluff is the order.

- **Cards**: 19 cards, no numbers: 6 each of 💎 DRIP, 😏 RIZZ and 🗿 MOG, and 1 🤫 **CAP**. DRIP > RIZZ > MOG > DRIP;
  same style is a draw; the CAP loses to everything.
- **Aura**: win +10,000, lose -10,000, a tie (MUTUAL MOG) changes nothing. Win all 3 face-offs: **TOTAL MOG**, +100,000.
  Win with the CAP in your 3: **NO CAP**, +500,000.
- **VIBES**: 1 a day, +1 per duel lost (up to 3). Before taking a challenge, spend one to see which card they play in
  one round.
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
