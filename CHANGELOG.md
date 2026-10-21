# Changelog

## v0.4 (not released yet)

- Three styles, no numbers: every card is 💎 DRIP, 😏 RIZZ or 🗿 MOG (DRIP beats RIZZ, RIZZ beats MOG, MOG beats DRIP), plus 2 🤫 CAPs that lose to everything. Each round the two cards face off; win more rounds than them and you win the pot. The duel screen shows rounds won so far. Removed: the 54-card deck, ranks and aura per card, YAP, adding up totals, and the "never even tried" bonus.
- FARM's emoji is now 🌾, so it isn't mixed up with MOG's 🗿. Removed: 🗿 on the FARM button.
- Duels finished before this show their cards as they were sealed.

## v0.3.3 (Oct 20 2026, HST)

- Planning goes one round at a time: your card for that round flips, then you pick LOCK IN, FARM or DIP for it. Planned rounds are listed with their card; tap one to change it. Removed: the three rows of move buttons with no cards beside them.

## v0.3.2 (Oct 20 2026, HST)

- Snappier: tabs switch the moment you tap, showing what they had last time, then update. After a move, the duel updates first and your aura in the header catches up a moment later. The server makes one trip to the database per screen instead of 3 or 4. Removed: waiting for the server before a tab changed, and re-loading your header on every tab switch.

## v0.3.1 (Oct 20 2026, HST)

- Gen-z slang names: rerolling gives names like "Certified Rat", "Delulu Bean" or "Unhinged Sweat". Removed: the calm two-word names (like "Quiet Heron"); names you already have stay until you reroll.

## v0.3 (Oct 20 2026, HST)

- Play against the plan: when you post a challenge you also plan your move for each round. Whoever takes it plays the whole duel straight away, one round at a time, and you never have to come back. Removed: waiting for the other player each round, "your move" on challenges you posted, and the page checking back every 10 seconds.
- Challenges that were open or being played when this went live were cancelled (they had no plan). Nothing was paid out for them.
- Names are random only: "🎲 reroll name" gives you a new two-word name. Removed: typing your own name.
- The glow is back the way it was in v0.1, but softer on the big white text (the title, headings, the big button and the pot). Removed: v0.2's toned-down glow on cards, captions and buttons.

## v0.2.1 (Oct 20 2026, HST)

- The version number is now shown at the bottom of every screen. Nothing was removed.

## v0.2 (Oct 20 2026, HST)

- Save codes and passkeys: tap your name (or "log in") at the top to make one, then log in as the same player on another browser or device. They're the same ones the other 88x31 games use. Removed: tapping your name no longer opens the rename box straight away; "change name" is on that screen now.
- Every finished duel is now also checkpointed on the shared 88x31 registry, which is timestamped on Bitcoin. Nothing was removed for this.
- Faster page changes: switching tabs makes about 7 small database queries instead of about 55, and the page asks for both things at once instead of one after the other. Removed: the all-time aura total the server worked out on every click (the page never showed it), and the "last seen" write on every click (now at most every 15 minutes).
- Less text glow: softer, smaller glows on the title, your aura, the pot and the captions. Removed: the glow on card labels, move buttons, the big button and the selected tab.

## v0.1 (Oct 20 2026, HST)

- First version: the challenge board, async duels with secret picks, VIBES (peeks only: the "is it above 3?" ask was removed before release), standing aura, today's board and the ledger.
