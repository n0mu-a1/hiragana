-- ====================================================================
-- db/schema.sql — 自律パッチループの収集・効果測定スキーマ (Turso / libSQL)
-- 適用: turso db shell <db> < db/schema.sql
-- ====================================================================

CREATE TABLE IF NOT EXISTS feedback (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ts             TEXT    NOT NULL,
  config_version INTEGER NOT NULL,
  rating         TEXT    NOT NULL CHECK (rating IN ('easy','just','hard')),
  comment        TEXT    NOT NULL DEFAULT '',
  score          INTEGER NOT NULL DEFAULT 0,
  game           TEXT    NOT NULL DEFAULT 'hiragana',
  kana_json      TEXT    NOT NULL DEFAULT '{}',
  ua_hash        TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_feedback_version ON feedback(config_version);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_game_ver ON feedback(game, config_version);

CREATE TABLE IF NOT EXISTS patch_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  from_version  INTEGER NOT NULL,
  to_version    INTEGER NOT NULL,
  action        TEXT    NOT NULL,
  auto          INTEGER NOT NULL DEFAULT 1,
  summary       TEXT    NOT NULL DEFAULT '',
  diff_json     TEXT    NOT NULL DEFAULT '{}',
  stats_json    TEXT    NOT NULL DEFAULT '{}',
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_patchlog_to ON patch_log(to_version);
