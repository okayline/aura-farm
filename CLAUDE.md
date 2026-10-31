# aura-farm: working notes

## This repo

AURA FARMING SIMULATOR: LOCKED IN BATTLE EDITION 2027: an async aura battle. You put a style on the board, sealed, and farm aura while it stands; when someone takes it, both styles are revealed at once. The name above is the one on the page, the README and the changelog. Design doc: the Claude Doc at https://claude.ai/artifact/9CGedPpAUHQ6wAD9cxGRfg (the old notes called it "NO CAP BATTLE EDITION"). Treat a push to `main` as a release: the Worker may be connected to this repo.

- **The rules live in one file**, `public/engine/aura.js`, loaded by both the Worker and the page. Change a rule there, once.
- **The ledger is a hash chain** (`src/ledger.js`), one entry per finished duel, written in the same D1 batch as the duel's ending. Records hold player ids, never names. Don't weaken `prev_hash UNIQUE`.
- **Secrets stay on the server:** the duel seed, locked lineups and this round's picks. `duelView` in `src/worker.js` decides what each player sees.
- **Database changes** need a file in `migrations/`, `schema.sql` updated to match, and the live database migrated before the push that needs it.
- **Testing:** `npm test` must pass before any commit, plus one quick check of whatever changed. Expected values come from hand-worked examples or node:crypto, not the code under test.
- **Changelog:** `CHANGELOG.md` here; the detailed dev entries are in dungeon-notes `aura-farm/changelog-v0.1.md`. clutch-feed-tilt's account code is copied from this repo.
