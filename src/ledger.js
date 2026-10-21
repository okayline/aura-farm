// The ledger: one SHA-256 hash chain, one entry per finished farm. Same design as the other games' ledgers
// (scoundrel.exe, irl-dungeon, dawn-baton); the chain helpers are copied from scoundrel.exe src/ledger.js.
//
//   record = JSON of the farm: both players' ids, both styles with their salts and commitments, the result and its
//            captions. A farm is decided the moment it is taken, so both styles are always revealed (v0.6). Before
//            v0.6 the record is a card duel: lineups of cards (v0.5) and, before that, plans and moves.
//   hash   = SHA-256( prev_hash + "|" + record )
//
// The first entry chains from GENESIS. Changing any old record breaks its hash and every hash after it.
// prev_hash is UNIQUE, so two entries can never build on the same head (no forks). Records hold player ids, never
// names. An entry is written in the same D1 batch as the farm's ending, so a farm is finished if and only if it is on
// the ledger.

export const GENESIS = "0".repeat(64);

export async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// What a style's commitment covers: the style and its salt, sha256("D|salt"). (v0.5 lineups were "D1,R3,X1|salt".)
export const commitment = (style, salt) => sha256(style + "|" + salt);

export async function head(db) {
  const h = await db.prepare("SELECT hash FROM ledger ORDER BY id DESC LIMIT 1").first();
  return h ? h.hash : GENESIS;
}

// The insert for one entry chained from `prev`. `guard` is an SQL condition (with its binds) that must hold for the
// insert to happen: "this farm is now done", so nothing is sealed for an ending that didn't save.
export async function chainInsert(db, prev, { day, farmId, record, t }, guard) {
  const hash = await sha256(prev + "|" + record);
  return db.prepare(
    `INSERT INTO ledger (kind, day, farm_id, record, prev_hash, hash, created_at)
     SELECT 'farm', ?, ?, ?, ?, ?, ? WHERE ${guard.sql}`)
    .bind(day, farmId, record, prev, hash, t, ...guard.args);
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
