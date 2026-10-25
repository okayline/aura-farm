# Changelog

## v0.79 (Oct 24 2026, HST)

- In the Details panel under FLEX, "Same style" is now "Mutual MOG" (still +0 AURA).
- In the Details panel on your own farm, "Goes up" now reads "+10,000 every hour" and "Your farms up" is removed. Removed: the words "Win/lose" and the "Your farms up" line. (The times there already use the new format.)

## v0.78 (Oct 24 2026, HST)

- On a farm's page, the times now show seconds: "14:46:09 on Oct 25th, 2026".
- In the Details panel under FLEX, removed "Your AURA today" (the top of every screen already shows it) and "Your farms up".

## v0.77 (Oct 24 2026, HST)

- On a farm's page, the times in the Details and Results panels ("Put up", "Comes down", "Taken") now read "14:46 on Oct 25th, 2026": 24-hour time, then the date with the day's ending (1st, 2nd, 3rd, 4th) and the year. Removed: the old "Oct 25, 2:46 AM" style.

## v0.76 (Oct 24 2026, HST)

- On The Farm, when you move the mouse over a farm card, the whole card lights up pink behind it (like the profile pic does) and FLEX turns bright white with a glow. On a phone nothing changes. Removed: nothing; before this the cards did not react to the mouse.

## v0.75 (Oct 24 2026, HST)

- On the About tab's ledger, the emojis in each panel ("😏 vs 💎") are bigger. Removed: the smaller size they had.

## v0.74 (Oct 24 2026, HST)

- On The Farm, each card now says "+240,000 AURA at stake" where it used to say "worth +240,000 AURA". Removed: the word "worth".

## v0.73 (Oct 24 2026, HST)

- On the About tab's ledger, each panel's time and date now read "05:10:43 on Oct 21, 2026 - (the farm's line)": the time first (24-hour, with seconds), then the date with the year. Removed: the old order, "Oct 21, 2026 - 05:10:43".

## v0.72 (Oct 24 2026, HST)

- On your Home screen, each farm card no longer says "+10,000 an hour". It reads "+140,000 AURA farmed so far" and, under it, the time left ("9h 46m left"). Removed: "+10,000 an hour ·" from that line (the farm's own page still says what it earns).

## v0.71 (Oct 24 2026, HST)

- On the About tab's ledger, there is a little more space between the lines of each panel (the title, the date and line, the styles, the hash). Removed: the tighter spacing.

## v0.70 (Oct 24 2026, HST)

- On the About tab's ledger, the hash stays on one line and shows as much of it as fits, trailing off with "…" only when the screen is too narrow for all of it. Removed: the hash wrapping onto a second line (v0.68).

## v0.69 (Oct 24 2026, HST)

- On the About tab's ledger, the date, time and line share one line: "Oct 24, 2026 - 17:14:09 - A RIZZY standoff." The date now has the year. A farm with no line (the old card duels) shows just "Oct 23, 2026 - 19:00:05". Removed: the time on a line of its own (v0.68) and the date without a year.

## v0.68 (Oct 24 2026, HST)

- Each panel on the About tab's ledger shows when its farm was taken, above the line ("A RIZZY standoff."), in the same small text: 24-hour time with seconds, in your own time zone, like "Oct 24, 17:14:09". The panel shows the whole fingerprint (hash) instead of its first 16 characters and "…"; it wraps onto a second line. The ledger now sends each entry's sealing time. Removed: the cut-off hash ("371da1e438e41152…").

## v0.67 (Oct 24 2026, HST)

- The About panel is one short paragraph in the game's voice: pick a style (💎 beats 😏 beats 🗿 beats 💎), FARM AURA puts yours on the board face down and earns +10,000 AURA an hour while nobody takes it, FLEX on someone's Farm when you have one up, the winner takes 100,000 AURA plus 10,000 for every hour that Farm stood and the loser gets COOKED, the same style is a draw, "Stand there. Look cool. Bluff." Removed: the five paragraphs from v0.66, which also said a Farm lasts up to 24 hours, 3 can be up at once, FLEX once every 30 minutes per Farm, and that battles are sealed in the ledger.

## v0.66 (Oct 24 2026, HST)

- The Ledger tab is now called About. Above "Legends of AURA" it has a short panel on how to play: what beats what, FARM AURA (+10,000 AURA an hour, up to 24 hours, 3 at once), FLEX (the winner takes 100,000 AURA plus 10,000 for every hour that Farm stood), what you need to FLEX (a Farm up, once every 30 minutes per Farm), and that every finished battle is sealed in the ledger. The numbers come from the game's rules file, so they follow it if the rules change. Removed: the name "Ledger" on the tab. The address is still `?tab=ledger`, and the tab keeps its 📜 icon.

## v0.65 (Oct 24 2026, HST)

- The second line under your AURA FARM on Home now reads "Flex on someone's Farm to start an AURA Battle!". Removed: "Flex on someone currently Farming to start an AURA Battle!" (v0.59).

## v0.64 (Oct 24 2026, HST)

- On your Home screen, each farm you have up says how much it has farmed so far, above its "+10,000 an hour" line: "+130,000 AURA farmed so far" for a farm that has stood 13 hours. It counts up as the hours pass, the same number as "Farmed so far" on that farm's own page (10,000 for each whole hour, for that farm on its own). Removed: nothing.

## v0.63 (Oct 24 2026, HST)

- Lighter on the database, nothing changes on screen except that Today can be up to 30 seconds behind. A player's latest styles (the emoji row on The Farm and on a farm's page) are now found with two new lookup lists, `farms_c_status` and `farms_t_status` (migration `007_record_indexes.sql`), instead of reading every finished farm in the game twice each time. Home reads only your farms from the last 3 days instead of all of them. Today looks up names for the top 100 players only instead of for both players of every farm, and keeps today's board for 30 seconds (a farm posted or taken clears it). Removed: reading every finished farm for each record; the two player lookups on every farm in Today's query (`namesFrom` and `picsFrom`); the quick refresh of today's board on every tap of Today.
- Before this goes live, run `migrations/007_record_indexes.sql` on the live aura-db.

## v0.62 (Oct 24 2026, HST)

- "Aura" is no longer one of the first words in random names (so no new "Aura Goblin" or "Aura Yapper"). 31 first words and 23 last words are left. Removed: "Aura" from the first words. Names you already have stay until you reroll.

## v0.61 (Oct 24 2026, HST)

- Every "aura" and "Aura" on the screens now reads AURA: the numbers ("+260,000 AURA", "COOKED. -100,000 AURA", "MUTUAL MOG. +0 AURA"), "AURA today", "Your AURA today", "AURA farmed so far", "+10,000 AURA every hour…", "Nobody has any AURA yet. Go farm." and the page's description line. Removed: the lowercase and capitalised spellings. Farms already taken keep their sealed ledger entry as it was written, so an old entry's record text still says "aura" in lowercase; the caption shown above it reads AURA.
- The Farm no longer works out each poster's aura for the day, which its rows stopped showing in v0.60. Removed: that lookup and the `aura` number the board sent with each row (one fewer database query each time The Farm loads).

## v0.60 (Oct 24 2026, HST)

- On The Farm, each row says what that farm is worth: "worth +260,000 aura" for a farm that has stood 16 hours, which is what the winner gets if it is taken now (100,000 plus 10,000 for each whole hour). It counts up as the hours pass, the same number as "If you win" on the FLEX screen. Removed: "+50,000 aura today" (the poster's aura for the day) on those rows.

## v0.59 (Oct 24 2026, HST)

- Home screen: the "beats (emoji)" line under DRIP, RIZZ and MOG is gone (it stays on the FLEX screen). The line under your Aura Farm now reads "Flex on someone currently Farming to start an AURA Battle!". On a finished farm, a loss ("COOKED. -280,000 aura") is red and a win ("AURA FARMED. +100,000 aura") is blue, the DRIP blue. Removed: the home screen's "beats" line; the pink win color and the pale purple loss color (a draw keeps the pale purple).

## v0.58 (Oct 24 2026, HST)

- The "vs." between the face-down card and your styles is now "VS." in capitals. Removed: the lowercase "vs." (v0.57).

## v0.57 (Oct 24 2026, HST)

- On a farm you can FLEX, a centered "vs." now sits between the face-down "?" card and your DRIP, RIZZ and MOG cards, with a blank line above and below it. Removed: nothing.

## v0.56 (Oct 24 2026, HST)

- On a farm you can FLEX, a face-down "?" card now sits between the farmer's name and your DRIP, RIZZ and MOG cards, the same face-down card the battle shows before it flips, so you can see there is a hidden style to beat. Removed: nothing.

## v0.55 (Oct 24 2026, HST)

- On the Legends of AURA ledger, a farm you were in shows your side: COOKED. and the aura you lost if you lost, AURA FARMED. and what you won if you won. Farms you weren't in still show the winner's side. The page now gets your player id from the server (the ledger already holds player ids) to tell which farms are yours. The second line under your Aura Farm now reads "Flex on someone Farming to AURA Battle!". Removed: every ledger entry reading AURA FARMED. whoever lost; the v0.54 wording of that line.

## v0.54 (Oct 24 2026, HST)

- On the main screen, when all your farms are up, DRIP, RIZZ and MOG are dimmed and can't be tapped. Under "+10,000 Aura every hour while your Farm is up" there is a second line: "FLEX on someone who is Farming to battle them". Removed: nothing (the cards could be picked even when no farm could be put up, and still can be on the FLEX screen).

## v0.53 (Oct 23 2026, HST)

- Each farm you have up lets you FLEX once every 30 minutes: with 1 farm up that is 1 FLEX per 30 minutes, with 3 farms up it is 3. Too soon, and FLEX says how many minutes until the next. Removed: the one-hour wait between FLEXes (v0.46).

## v0.52 (Oct 23 2026, HST)

- On a finished farm's results screen, once the reveal is over, tapping anywhere on the card goes back, the same as the back link. Removed: nothing (the back link stays, and a tap during the reveal still does nothing).

## v0.51 (Oct 23 2026, HST)

- The Farm shows one row for each farm again, so a player with 3 farms up is listed 3 times, and FLEX on a row takes that farm. Removed: the one row per player and its "N farms up" line (v0.50).

## v0.50 (Oct 22 2026, HST)

- The Farm shows one row per player, with how many farms they have up. FLEX on it takes their oldest farm; once that one is taken, the row moves on to their next. Removed: a separate row for each farm, so a player with 3 farms up was listed 3 times.

## v0.49 (Oct 22 2026, HST)

- A farm earns a flat 10,000 aura for every hour it stands. A farm that stands its full 24 hours earns 240,000. Removed: the 1,000 more each hour (11,000, 12,000 and so on) and the 516,000 a full day used to pay. Standing aura is worked out from the farms, so past days' aura counts at the flat rate too.

## v0.48 (Oct 21 2026, HST)

- Sending a finished farm to the shared registry reads only that farm's ledger entry and the one before it. Removed: reading and re-checking the whole ledger after every farm, which got slower with every farm (the ledger itself is unchanged).

## v0.47 (Oct 21 2026, HST)

- Your profile pic shows to the left of your name on your player screen. Tap it to pick any of the 24, and that one shows everywhere your pic does, even after you reroll your name. Removed: a pic always picked from your name, which changed every time you rerolled.
- Rerolled names use fewer slang words: 32 first words and 23 last words, like "Sigma Goblin", "Cozy Rizzler" or "Clutch Enjoyer". Kept from v0.22: "Gyatt", "Lit", "Dank", "Yeet", "Clutch", "Enjoyer" and "Ratio". Removed: the other words added in v0.22 (like "Fanum", "Zaddy", "Simp"), and from the originals "Delulu", "Feral", "Unhinged", "Mid", "Valid", "Petty", "Salty", "Silly", "Sleepy", "Crunchy", "Final Boss", "Side Quest", "Locked In", "Gremlin", "Menace", "Pookie", "Moai", "Gremlin Era", "Side Char", "Main Char", "Villain", "Hater" and "Sweat" (the animals stay gone). Names you already have stay until you reroll.

## v0.46 (Oct 21 2026, HST)

- When DRIP beats RIZZ, the line is one of 3 instead of 8. Removed: the water jokes (drowned, slipped, too wet, rinsed, soaked). Farms already taken keep the line they were sealed with.

## v0.45 (Oct 21 2026, HST)

- Each farm you have up lets you FLEX once an hour: with 1 farm up that is 1 FLEX an hour, with 3 farms up it is 3 an hour. Too soon, and FLEX says how many minutes until the next. Removed: one FLEX per farm over 24 hours, which was the same as a daily limit.

## v0.44 (Oct 21 2026, HST)

- You get one FLEX for every farm you put up, good for 24 hours from when you posted it. Nothing counts down while you wait, and FLEXing doesn't take your farm down. With none left, FLEX says to put a farm up. A visitor with no player can't FLEX, and FLEXing no longer makes a player for them. Removed: the limit of 3 FLEXes every 30 minutes, and the new player that FLEXing used to make.

## v0.43 (Oct 21 2026, HST)

- You can FLEX 3 times in any 30 minutes. The 4th says how many minutes until the next one. Stops one player clearing the whole board in one go. Removed: no limit on FLEXes.

## v0.42 (Oct 21 2026, HST)

- A new player made by putting up or taking a farm without logging in is now limited to 3 an hour from one address; past that you get "Too many new players from here. Try again later." Stops one person making endless players to take or post farms. Logging in with a save code or passkey keeps its own limit of 20 an hour. Removed: no limit on new guests.

## v0.41 (Oct 21 2026, HST)

- The FLEX screen's Details now have "Aura farmed so far": the total the farm has earned while it has been up, counting up as the hours pass. Your open farm's "Earned so far" is now "Farmed so far". Removed: the label "Earned so far".

## v0.40 (Oct 21 2026, HST)

- Phones with Reduce Motion on now get the fight too, in a calm version: their card fades over (no flip), then the loser fades to grey, and the line, AURA FARMED. and the amount fade in one beat apart. No flipping, flying emoji, shaking or stamping. Removed: jumping straight to the finished screen for those phones.

## v0.39 (Oct 21 2026, HST)

- With 3 farms up, FARM AURA is greyed out even when a style is picked, instead of lighting up and then saying no. Removed: the button looking ready when you already have 3 up.

## v0.38 (Oct 21 2026, HST)

- A farm that has stood longer is worth more when it is taken: the winner gets, and the loser loses, 100,000 plus 10,000 for every whole hour it stood (110,000 after 1 hour, 220,000 after 12, 330,000 after 23). The FLEX screen's "If you win" and "If you lose" count up as the hours pass. Removed: the flat 100,000.
- A farm earns more the longer it stands: 10,000 in its first hour, 11,000 in its second, 12,000 in its third, and so on (186,000 after 12 hours, 516,000 after 24). "Earning", "Earned so far", "At most" and the hourly line on your Farming rows follow it. Farms up together still earn once, from the oldest. Removed: the flat 10,000 an hour.
- Your open farm's Details also say what you win or lose if it is taken now, and that earning goes up 1,000 and win/lose 10,000 every hour. The FLEX screen's Details say the win/lose goes up 10,000 every hour. Removed: nothing.

## v0.37 (Oct 21 2026, HST)

- Reloading The Farm, Today or Ledger now comes back to the same tab: the address shows `?tab=board`, `?tab=top` or `?tab=ledger` (Home stays the plain address). Removed: reloads always landing on Home.
- On the leaderboard only the top 3 portraits glow: #1 as it was, #2 a little less, #3 less again. Removed: the glow on everyone else.

## v0.36 (Oct 21 2026, HST)

- Each row in The Farm says how long that farm has been up, under FLEX (or FARMING on your own): "Up for 5 hrs", counting up as time passes (minutes in the first hour). Removed: nothing.

## v0.35 (Oct 21 2026, HST)

- The FLEX screen's Details panel no longer ends with "DRIP beats RIZZ, RIZZ beats MOG, MOG beats DRIP." Removed: that sentence; the cards above it still show what each beats.

## v0.34 (Oct 21 2026, HST)

- The Farm lists whoever has been farming the longest at the top. Removed: newest first.

## v0.33 (Oct 21 2026, HST)

- The farm panels on the home screen ("Farming", "vs. Sleepy Mogger") are a size bigger: more room inside, larger name and a larger line under it. The other lists (The Farm, Today, Ledger) are as they were. Removed: the smaller size on the home screen.

## v0.32 (Oct 21 2026, HST)

- Your open farm's Details has "Earned so far": 10,000 for each whole hour it has stood, updating as the hours pass. It counts that farm on its own, so farms up together show the same amount while your total counts the time once. Removed: nothing.

## v0.31 (Oct 21 2026, HST)

- Three explainer sentences are gone: "Nobody has taken it yet. It comes down on its own when the time is up." and "Farms up at the same time earn once, not twice." on your open farm's page, and the "Sealed with this fingerprint…" sentence there and in the FLEX screen's panel. The fingerprints themselves stay. Removed: those sentences.

## v0.30 (Oct 21 2026, HST)

- The details panels start rolled up and open when you tap them: the one under FLEX, your open farm's details, and a finished farm's Results. A panel you open stays open while that screen refreshes, and starts rolled up again the next time you open a farm. Removed: the panels always being open.
- Opening a farm starts at the top of its page (your farm: who is farming and the time left) instead of wherever the list was scrolled to. Removed: the page keeping the list's scroll position.

## v0.29 (Oct 21 2026, HST)

- The FLEX screen has a panel under the FLEX button with what is public about the farm: its number, who put it up, when it went up and comes down, the time left and how long it has stood, what you win or lose (or nothing on the same style), your aura today and farms up, which style beats which, and the sealed fingerprint of their style. Removed: nothing; the screen ended at the FLEX button.

## v0.28 (Oct 21 2026, HST)

- The AURA LEADERBOARD shows each player's profile pic beside their name. Removed: the rows with only a rank and a name.
- The Ledger tab's heading reads "Legends of AURA". Removed: "The ledger" as that heading.

## v0.27 (Oct 21 2026, HST)

- The menu at the bottom is bigger: each tab has its emoji large above its name, and the name is a size bigger. Removed: the emoji and name on one small line.
- Each player's profile pic is one of 24 emojis chosen from their name (it looks random, but it is the same for them on every screen and doesn't change when the page redraws), on the board, the face-off, the open farm page and the take screen. Removed: the same 😎 for everyone else and 🧍 for you.
- A blank row above the Results box on a finished farm's page. Removed: the tighter gap.

## v0.26 (Oct 21 2026, HST)

- A finished farm's own page is detailed: the result, who put it up and who took it with what each played and their aura, when it went up and was taken and how long it stood, the rules version, both players' latest styles, and each side's sealed fingerprint with the salt that opens it, so anyone can check it. It waits until the reveal has played. Removed: the face-off with only the seal under it.
- The open farm's page no longer says "Only you can see it" under your style. Removed: that sentence.

## v0.25 (Oct 21 2026, HST)

- A farm that is up shows how long it has left ("21h 40m left"), under "Farming" on your list and on its own page. The server sends the seconds left, so a wrong clock on the phone can't change it, and only those words update (about every 20 seconds), so nothing else on the screen is redrawn. When the time runs out the page shows it. Removed: no time shown anywhere.
- Your own open farm's page is filled in: a progress bar, when it went up and when it comes down, how long it has been up, +10,000 an hour and the most it can earn (+240,000), your aura today, how many farms you have up, your record, your sealed style with what it beats and loses to, and its public fingerprint. Removed: the bare "Farming" panel and card.

## v0.24 (Oct 21 2026, HST)

- A finished farm has a blank line above the line ("RIZZ met RIZZ.") and one under the caption ("MUTUAL MOG. +0 aura"). Removed: the tighter spacing there.
- In the reveal, the emoji no longer drops a little when the animation starts and then pops back up: its flying copy now starts exactly where the emoji sat. Removed: the copy being placed about 10px low, centred on the empty line under the emoji.

## v0.23 (Oct 21 2026, HST)

- A finished farm's page shows its whole ledger entry: the record exactly as sealed, the hash before it and its own hash, so anyone can check it. Removed: the hash shown alone under "Ledger entry".

## v0.22 (Oct 21 2026, HST)

- More random names: 22 new first words and 17 new last words (like "Clutch Raider", "Fanum Zaddy", "Gagged Ick"). Removed: the old last words "Bean", "Cat", "Rat", "Pigeon", "Raccoon", "Possum", "Frog", "Shrimp" and "Capybara" (all the animals).

## v0.21 (Oct 21 2026, HST)

- Each browser keeps its own player. Log in as someone else and then log out, and you are back on the player this browser had, instead of getting a new empty one. If that player was deleted or has since got a save code, log out starts fresh. Removed: a new empty player after every log out.

## v0.20 (Oct 21 2026, HST)

- Log out happens on one tap. "Forget" a save code and "remove" a passkey ask "are you sure?" on the page itself, with Yes and No. Removed: the browser pop-ups for all three.

## v0.19 (Oct 21 2026, HST)

- Each browser keeps its own player. Log in as someone else and then log out, and you're back on the player this browser had, instead of a new one. Removed: v0.18's "log in first" after a log out, and the "Switch anyway?" question before logging in (switching no longer loses this browser's player).
- Rolled back the same day, before v0.20 (commit `3719077`). v0.21 brought the same idea back.

## v0.18 (Oct 21 2026, HST)

- After you log out of this browser, playing asks you to log in with your save code or passkey first, instead of making a new player. A browser that has never played still gets a player the first time it plays. Removed: a new empty player every time you played after logging out.
- Rolled back the same day, before v0.20 (commit `f801bc6`).

## v0.17 (Oct 21 2026, HST)

- A finished farm's page shows its whole ledger entry: the record exactly as sealed, the hash before it and its own hash, so anyone can check it. The registry's Aura Farm entries open this page when tapped, and no longer repeat the record there. Removed: the hash shown alone under "Ledger entry".
- Rolled back the same day, before v0.20 (commit `d755476`, back to v0.15). v0.23 brought the farm page's ledger entry back.

## v0.16 (Oct 21 2026, HST)

- Logging in as another player (save code or passkey) first asks "Switch anyway?" if the player you're on has no save code or passkey, because you couldn't get back to it. Removed: switching away from an unsaved player without a word.
- Rolled back the same day, before v0.20 (commit `d755476`, back to v0.15). Not brought back.

## v0.15 (Oct 21 2026, HST)

- A farm stays up for 24 hours from when you post it, even past midnight. You can have 3 up at once. Your aura still counts by the day: hours a farm stands and wins or losses land on the day they happen. Removed: every farm ending at midnight UTC, and "3 a day".

## v0.14 (Oct 21 2026, HST)

- Each style card says what it beats, just below it ("beats 😏"), on Home and when you FLEX. Removed: nothing.

## v0.13 (Oct 21 2026, HST)

- Opening a farm puts its address in the bar (aura.88x31.app/?farm=N), so you can copy or share it. Your browser's back button goes back from a farm, and "back" in the game does the same. Removed: the address staying the same whatever you opened.

## v0.12 (Oct 21 2026, HST)

- Your Farming rows on Home show what each farm is farming (💎, 😏 or 🗿), only to you. Removed: nothing.
- More space above a finished farm's ledger entry. Removed: nothing.

## v0.11 (Oct 21 2026, HST)

- A standing farm says "+10,000 an hour". Removed: "10,000 an hour" without the plus.
- "On The Registry" opens The Registry at this farm's own entry. Removed: the link to the top of The Registry.

## v0.10 (Oct 20 2026, HST)

- Home says "(your name)'s AURA FARM". Removed: the plain "AURA FARM" heading (still shown before you have a name).
- The Today tab is the AURA LEADERBOARD. Removed: "Most aura today".
- Bigger text in the bottom menu. Removed: nothing.
- A finished farm is its ledger entry's page: tap any entry on the Ledger tab to open its farm, which shows its ledger entry number and fingerprint and links to The Registry. The registry's Aura Farm entries link back to the farm. Removed: nothing; ledger entries just weren't tappable before.
- A farm you weren't in shows both players' names. Removed: "you" on farms that aren't yours.

## v0.9 (Oct 20 2026, HST)

- STARE DOWN is now FLEX. Removed: the words STARE DOWN.
- After you FLEX, their card starts face down and flips over, then the winning emoji does its thing: DRIP rains diamonds on RIZZ, RIZZ grows and MOG crumbles, MOG leans in and DRIP crumbles, and a draw just sparkles. Then the loser goes black and white and the result stamps in, one piece at a time. Removed: the result just appearing.
- Every farm has a line that says what happened ("MOG couldn't handle the RIZZ."), eight for each matchup. It's sealed on the ledger with the farm, shown on the Ledger tab, and goes to the shared registry. Removed: nothing; farms from before this have no line.
- The finished-farm screen puts the result between the two cards, with the aura bigger. Removed: each player's emoji history on that screen, and the result line under the cards.
- A little more room under the emoji on every style card. Removed: nothing.

## v0.8 (Oct 20 2026, HST)

- The tabs are renamed: Home (was Farm) and 🌾 The Farm (was Board). Removed: the names "Farm" and "Board" for those tabs.
- FARM AURA keeps you on Home: your farm shows up in the list below instead of opening its own screen. Removed: the jump to the farm screen after tapping FARM AURA.
- The finished-farm screen is centered: the other player, then you, each with name, record and style card, and the result underneath. The one who lost is black and white. Removed: the left-aligned layout.

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
