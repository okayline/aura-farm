// Random player names: two words, like Dawn Baton, irl-dungeon and scoundrel.exe (copied from scoundrel.exe src/names.js,
// which copied irl-dungeon). Names can't be typed: every player gets one when they are made, and can reroll it any time.
// gen-z slang (ryan, Oct 21: "could we get gen-z slang name generator? haha")
const ADJECTIVES = [
  "Rizzed", "Unbothered", "Sigma", "Based", "Bussin", "Mewing", "Goated", "Lowkey", "Highkey", "Delulu",
  "Sus", "Feral", "Cracked", "Unhinged", "Iconic", "Slay", "Ohio", "Skibidi", "Chill", "Mid",
  "Cooked", "Glazed", "Aura", "Drippy", "Yappy", "Valid", "Petty", "Salty", "Extra", "Bougie",
  "Cozy", "Certified", "Silly", "Sleepy", "Crunchy", "Rare", "Final Boss", "Main", "Side Quest", "Locked In",
  "Bet", "Fanum", "Gyatt", "Vibing", "Toxic", "Snatched", "Ratioed", "Respectfully", "Touch Grass",
  "Caught In 4K", "Hot Mess", "Zesty", "Dank", "Wavy", "Lit", "Fire", "Shook", "Basic",
  "Rizzy", "Hella", "Gagged", "Pressed", "Tilted", "Sneaky", "Ate", "Spicy", "Yeet", "Clutch",
];
const NOUNS = [
  "Gremlin", "Goblin", "NPC", "Rizzler", "Menace", "Icon", "Legend", "Bestie", "Pookie", "Baddie",
  "Yapper", "Mogger", "Farmer", "Opp", "Stan", "Himbo", "Girlboss", "Goat", "Rat", "Pigeon",
  "Raccoon", "Possum", "Frog", "Shrimp", "Capybara", "Moai", "Gamer", "Lurker", "Ghost", "Cat",
  "Gremlin Era", "Side Char", "Main Char", "Villain", "Hater", "Sweat", "Noob", "Sidekick", "Tryhard", "Bean",
  "Enjoyer", "Andy", "Simp", "Fiend", "Vibes", "Vibe Check", "Arc", "Era", "Boss", "Ally",
  "Gator", "Axolotl", "Hamster", "Duck", "Otter", "Goose", "Moth", "Toad", "Crab", "Sloth",
  "Raider", "Zaddy", "Ick", "Bandit", "Rascal", "Ratio", "Cheugy", "Kid", "Plot Armor", "Besties",
];
// only the pairs of 16 characters or fewer, so names fit the header on a phone
const PAIRS = ADJECTIVES.flatMap((a) => NOUNS.map((n) => `${a} ${n}`)).filter((s) => s.length <= 16);

// Give this player a random name nobody has, if they have none (or a different one, with reroll). Returns the player
// with its name (unchanged only if every try hit a taken name, which won't happen until most of the pairs are used).
export async function giveName(env, p, { reroll = false, rand = Math.random } = {}) {
  if (!p || (p.name && !reroll)) return p;
  for (let i = 0; i < 40; i++) {
    const name = PAIRS[Math.floor(rand() * PAIRS.length)];
    if (name === p.name) continue;
    try {
      const r = await env.DB.prepare(`UPDATE players SET name = ?, name_key = ? WHERE id = ?${reroll ? "" : " AND name IS NULL"}`)
        .bind(name, name.toLowerCase(), p.id).run();
      if (!r.meta.changes) return { ...p, ...(await env.DB.prepare("SELECT name FROM players WHERE id = ?").bind(p.id).first()) };
      return { ...p, name };
    } catch (e) {
      if (!String(e.message).includes("UNIQUE")) throw e;   // taken: try another
    }
  }
  return p;
}
