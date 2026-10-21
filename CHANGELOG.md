# Changelog

## v0.7 (Oct 20 2026, HST)

- Fewer labels: the Farm tab says one short line ("+10,000 Aura per hour while your Farm is up"), and the Board, Today and Ledger tabs, the take screen and your own farm are just their titles. Removed: "beats X" on every style button and the paragraphs of explainer text on every screen.
- "👆 Use passkey" is a button in one row with "🔑 New code" and "👆 Add passkey". Removed: the longer "New save code" and "Add a passkey" labels: the "or log in with a passkey" link under the save code box.
- VIBES are gone: no more peeking at a style, and no VIBES counter at the top. Removed: the peek, earning VIBES by losing a farm, and the VIBES tables (migration 005).

## v0.6 (Oct 20 2026, HST)

- AURA FARM: no more cards. You pick a style and tap FARM AURA to put it on the board, sealed: 💎 DRIP, 😏 RIZZ or 🗿 MOG. While it stands untaken you farm 10,000 aura an hour. Whoever takes it picks their own, both are revealed at once, and the style that beats the other wins 100,000 (the loser is COOKED, a draw is MUTUAL MOG). Removed: the 19 cards, the deal, 5-card hands, lineups and their order, face-offs, TOTAL MOG, NO CAP and the CAP.
- Records: once a farm is taken, both styles are public, and the board shows each poster's latest 10. Read how they play. Removed: nothing, since no style was public before.
- VIBES: before taking a farm, spend one to see one style it isn't. You earn one for each farm you lose (up to 3). Removed: peeking at a card in a round.
- A farm that expires at midnight UTC says "Your time is up". Card duels from before this stay on the ledger and in your list as they were. Removed: challenges that were open when this went live were cancelled with nothing paid.

## v0.5 (Oct 20 2026, HST)

- Cards vs cards: you keep 3 of your 5 in an order, they do the same, and the two lineups face off card by card the moment they take it. Win more face-offs to win 10,000 aura; win all 3 for TOTAL MOG (+100,000); win with the CAP in your 3 for NO CAP (+500,000). The bluff is the order you pick. Removed: LOCK IN, FARM and DIP, planning a move per round, playing round by round, the pot, CRASHED OUT and "dipped holding the win".
- One CAP in the deck, so 19 cards. Removed: the second CAP.
- VIBES: before you take a challenge, spend one to see which card they play in a round. You earn one for each duel you lose (up to 3). Removed: peeking during a duel, and earning VIBES by dipping.
- Challenges that were open or being played when this went live were cancelled (they were dealt from the old deck). Nothing was paid out for them.

## v0.4 (Oct 20 2026, HST)

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
