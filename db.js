import pkg from "pg";
const { Pool } = pkg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("render.com")
    ? { rejectUnauthorized: false }
    : undefined,
});

export async function q(text, params = []) {
  const res = await pool.query(text, params);
  return res;
}

export async function getState(userId) {
  const r = await q("select state, data from user_state where user_id=$1", [userId]);
  return r.rowCount ? r.rows[0] : { state: "idle", data: {} };
}

export async function setState(userId, state, data = {}) {
  await q(
    `insert into user_state(user_id, state, data)
     values($1,$2,$3)
     on conflict (user_id) do update set state=$2, data=$3, updated_at=now()`,
    [userId, state, data]
  );
}

export async function clearState(userId) {
  await q("delete from user_state where user_id=$1", [userId]);
}

export function isAdmin(userId) {
  const ids = (process.env.ADMIN_IDS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  return ids.includes(String(userId));
}