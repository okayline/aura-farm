# Changelog

## v0.2.2 (not released yet)

- Names are random only: "🎲 reroll name" gives you a new two-word name. Removed: typing your own name.

## v0.2.1 (Oct 20 2026, HST)

- The version number is now shown at the bottom of every screen. Nothing was removed.

## v0.2 (Oct 20 2026, HST)

- Save codes and passkeys: tap your name (or "log in") at the top to make one, then log in as the same player on another browser or device. They're the same ones the other 88x31 games use. Removed: tapping your name no longer opens the rename box straight away; "change name" is on that screen now.
- Every finished duel is now also checkpointed on the shared 88x31 registry, which is timestamped on Bitcoin. Nothing was removed for this.
- Faster page changes: switching tabs makes about 7 small database queries instead of about 55, and the page asks for both things at once instead of one after the other. Removed: the all-time aura total the server worked out on every click (the page never showed it), and the "last seen" write on every click (now at most every 15 minutes).
- Less text glow: softer, smaller glows on the title, your aura, the pot and the captions. Removed: the glow on card labels, move buttons, the big button and the selected tab.

## v0.1 (Oct 20 2026, HST)

- First version: the challenge board, async duels with secret picks, VIBES (peeks only: the "is it above 3?" ask was removed before release), standing aura, today's board and the ledger.
