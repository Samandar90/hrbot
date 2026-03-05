// db.js (PRO - STABLE)
import pkg from "pg";
const { Pool } = pkg;

const DATABASE_URL = process.env.DATABASE_URL || "";

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("render.com")
    ? { rejectUnauthorized: false }
    : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export async function q(text, params = []) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    console.error("DB ERROR:", {
      message: err?.message,
      code: err?.code,
      detail: err?.detail,
      query: text,
    });
    throw err;
  }
}

export function jsonParam(value) {
  return JSON.stringify(value ?? {});
}

export async function getState(userId) {
  const r = await q("select state, data from user_state where user_id=$1", [
    userId,
  ]);
  return r.rowCount ? r.rows[0] : { state: "idle", data: {} };
}

export async function setState(userId, state, data = {}) {
  await q(
    `insert into user_state(user_id, state, data)
     values($1,$2,$3::jsonb)
     on conflict (user_id)
     do update set state=$2, data=$3::jsonb, updated_at=now()`,
    [userId, state, jsonParam(data)],
  );
}

export async function clearState(userId) {
  await q("delete from user_state where user_id=$1", [userId]);
}

export function isAdmin(userId) {
  const ids = (process.env.ADMIN_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(String(userId));
}
