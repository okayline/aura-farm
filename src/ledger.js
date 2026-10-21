// The ledger: one SHA-256 hash chain, one entry per finished duel. Same design as the other games' ledgers
// (scoundrel.exe, irl-dungeon, dawn-baton); the chain helpers are copied from scoundrel.exe src/ledger.js.
//
//   record = JSON of the duel: both players' ids, the duel's seed (so anyone can re-deal both hands), both lineups
//            with their salts and commitments, the rounds won, the result and its caption. Every duel is decided the
//            moment it is taken, so both lineups are always revealed (v0.5). Records from before v0.5 kept a lineup
//            secret after a DIP, and the poster's commitment there also covered their plan: sha256("cards|plan|salt").
//   hash   = SHA-256( prev_hash + "|" + record )
//
// The first entry chains from GENESIS. Changing any old record breaks its hash and every hash after it.
// prev_hash is UNIQUE, so two entries can never build on the same head (no forks). Records hold player ids, never
// names. An entry is written in the same D1 batch as the duel's ending, so a duel is finished if and only if it is on
// the ledger.

export const GENESIS = "0".repeat(64);

export async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// What a lineup's commitment covers: its cards in order and its salt, sha256("cards|salt").
export const commitment = (cards, salt) => sha256(cards.join(",") + "|" + salt);

export async function head(db) {
  const h = await db.prepare("SELECT hash FROM ledger ORDER BY id DESC LIMIT 1").first();
  return h ? h.hash : GENESIS;
}

// The insert for one entry chained from `prev`. `guard` is an SQL condition (with its binds) that must hold for the
// insert to happen: "this duel is now done", so nothing is sealed for an ending that didn't save.
export async function chainInsert(db, prev, { day, duelId, record, t }, guard) {
  const hash = await sha256(prev + "|" + record);
  return db.prepare(
    `INSERT INTO ledger (kind, day, duel_id, record, prev_hash, hash, created_at)
     SELECT 'duel', ?, ?, ?, ?, ?, ? WHERE ${guard.sql}`)
    .bind(day, duelId, record, prev, hash, t, ...guard.args);
}

// Check rows (oldest first) form an unbroken chain from GENESIS: { ok: true } or { ok: false, at: id }.
export async function verifyChain(rows) {
  let p = GENESIS;
  for (const r of rows) {
    if (r.prev_hash !== p || (await sha256(p + "|" + r.record)) !== r.hash) return { ok: false, at: r.id };
    p = r.hash;
  }
  return { ok: true };
}

export const isUnique = (e) => /UNIQUE/i.test(String(e && e.message));
