// ====================================================================
// api/feedback.js — フィードバック収集エンドポイント (Vercel Serverless / Node)
// ====================================================================

import { createClient } from "@libsql/client";
import { createHash } from "node:crypto";

let _db = null;
function db() {
  if (_db) return _db;
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL is not set");
  _db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  return _db;
}

const RATINGS = new Set(["easy", "just", "hard"]);
const ROMAJI = new Set([
  "a", "i", "u", "e", "o",
  "ka", "ki", "ku", "ke", "ko",
  "sa", "shi", "su", "se", "so",
  "ta", "chi", "tsu", "te", "to",
  "na", "ni", "nu", "ne", "no",
  "ha", "hi", "fu", "he", "ho",
  "ma", "mi", "mu", "me", "mo",
  "ya", "yu", "yo",
  "ra", "ri", "ru", "re", "ro",
  "wa", "wo", "n",
]);
const RATE_WINDOW_SEC = 120;
const RATE_MAX = 6;

function clientHash(req) {
  const xff = req.headers["x-forwarded-for"] || "";
  const ip = String(xff).split(",")[0].trim() || "0.0.0.0";
  const ua = String(req.headers["user-agent"] || "");
  const daySalt = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${ip}|${ua}|${daySalt}`).digest("hex").slice(0, 16);
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return null; }
}

function normalizeGame(value) {
  const game = String(value || "hiragana").trim();
  return /^[a-z0-9_-]{1,24}$/.test(game) ? game : "hiragana";
}

function normalizeKana(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "{}";
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!ROMAJI.has(key)) continue;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const seen = Math.max(0, Math.min(200, Math.trunc(Number(raw.seen) || 0)));
    const correct = Math.max(0, Math.min(seen, Math.trunc(Number(raw.correct) || 0)));
    out[key] = { seen, correct };
    if (Object.keys(out).length >= 46) break;
  }
  const json = JSON.stringify(out);
  return json.length <= 2048 ? json : "{}";
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const allow = process.env.FEEDBACK_ALLOW_ORIGIN;
  if (allow) {
    const origin = req.headers.origin || "";
    if (origin && origin !== allow) {
      return res.status(403).json({ ok: false, error: "forbidden_origin" });
    }
  }

  const body = await readJson(req);
  if (body === null) return res.status(400).json({ ok: false, error: "invalid_json" });

  const rating = String(body.rating || "");
  if (!RATINGS.has(rating)) return res.status(400).json({ ok: false, error: "invalid_rating" });

  const comment = String(body.comment || "").trim().slice(0, 280);
  const score = Math.max(0, Math.min(1_000_000, Math.trunc(Number(body.score) || 0)));
  const configVersion = Math.max(1, Math.trunc(Number(body.configVersion) || 1));
  const ts = typeof body.ts === "string" && body.ts.length <= 40 ? body.ts : new Date().toISOString();
  const game = normalizeGame(body.game);
  const kanaJson = normalizeKana(body.kana);
  const uaHash = clientHash(req);

  try {
    const client = db();

    const recent = await client.execute({
      sql: `SELECT COUNT(*) AS n FROM feedback
            WHERE ua_hash = ? AND created_at >= datetime('now', ?)`,
      args: [uaHash, `-${RATE_WINDOW_SEC} seconds`],
    });
    if (Number(recent.rows[0]?.n || 0) >= RATE_MAX) {
      return res.status(429).json({ ok: false, error: "rate_limited" });
    }

    await client.execute({
      sql: `INSERT INTO feedback (ts, config_version, rating, comment, score, game, kana_json, ua_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [ts, configVersion, rating, comment, score, game, kanaJson, uaHash],
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[feedback] insert failed:", err?.message || err);
    return res.status(503).json({ ok: false, error: "store_unavailable" });
  }
}
