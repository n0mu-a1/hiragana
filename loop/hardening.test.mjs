// ====================================================================
// loop/hardening.test.mjs — 敵対検証(red-team)で再現された穴の回帰テスト。
// すべて「危険なものは通さない / 直すべき時に判断する」を固定化する。
// ====================================================================

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gate } from "./gate.mjs";
import { verifyText } from "./verify.mjs";
import { computePatch } from "./patch.mjs";
import { decide } from "./decide.mjs";
import { loadConfig, loadConfigFromText, CONFIG_PATH } from "./config.mjs";

const base = loadConfig();
const baseText = readFileSync(CONFIG_PATH, "utf8");
const bumped = () => { const c = structuredClone(base); c.version = base.version + 1; return c; };
const mkStats = (n, easy, just, hard) => ({
  version: base.version, n, easy, just, hard,
  easyRate: easy / n, justRate: just / n, hardRate: hard / n, negRate: (easy + hard) / n,
});

// ── gate: 累積破壊 / 非レバー / theme / ratings ───────────────────
test("BLOCK: 複数balanceキー同時変更（累積破壊）", () => {
  const n = bumped();
  n.balance.distractorSimilarity = 0.55;
  n.balance.autoAdvanceMs = 1550;
  n.balance.weakBoost = 1.8;
  const r = gate({ oldConfig: base, newConfig: n });
  assert.equal(r.pass, false);
  assert.ok(r.failures.some((f) => f.includes("同時変更")), r.failures.join("; "));
});

test("BLOCK: 難易度レバー外の自動変更", () => {
  for (const key of ["choices", "questionsPerSession", "newKanaBoost", "wrongLockMs", "retryHintDelayMs"]) {
    const n = bumped();
    const cur = n.balance[key];
    n.balance[key] = cur + 1;
    const r = gate({ oldConfig: base, newConfig: n });
    assert.equal(r.pass, false, `${key} は人間承認のはず`);
  }
});

test("BLOCK: 評価ラベル text.ratings.* の自動変更", () => {
  const n = bumped(); n.text.ratings.hard = "ハード";
  assert.equal(gate({ oldConfig: base, newConfig: n }).pass, false);
});

test("BLOCK: theme が #rrggbb 以外", () => {
  const n = bumped(); n.theme.accent = "red; } body { display:none }";
  assert.equal(gate({ oldConfig: base, newConfig: n }).pass, false);
});

test("BLOCK: theme accent と bg が同色（不可視化）", () => {
  const n = bumped(); n.theme.accent = n.theme.bg;
  assert.equal(gate({ oldConfig: base, newConfig: n }).pass, false);
});

test("BLOCK: text に HTML メタ文字", () => {
  const n = bumped(); n.text.title = "<img src=x onerror=alert(1)>";
  assert.equal(gate({ oldConfig: base, newConfig: n }).pass, false);
});

// ── verify/config: getter(TOCTOU) / 非列挙 / 巨大文字列 / version小数 ──
test("BLOCK: getter を仕込んだ config は読込で拒否(TOCTOU)", () => {
  const evil = baseText.replace('accent: "#ff7aa2",', 'get accent() { return "#ff7aa2"; },');
  assert.throws(() => loadConfigFromText(evil));
  assert.equal(verifyText(evil, { expectedVersion: base.version }).ok, false);
});

test("BLOCK: defineProperty による非列挙キーはトークン拒否", () => {
  const evil = baseText + '\nObject.defineProperty(window.GAME_CONFIG.theme,"evil",{value:"x",enumerable:false});\n';
  assert.equal(verifyText(evil, { expectedVersion: base.version }).ok, false);
});

test("BLOCK: 巨大文字列 / 制御文字 / version小数 を verify が弾く", () => {
  const big = baseText.replace('title: "おとあて",', `title: ${JSON.stringify("A".repeat(300))},`);
  assert.equal(verifyText(big, { expectedVersion: base.version }).ok, false);
  const frac = baseText.replace("version: 1,", "version: 2.5,");
  assert.equal(verifyText(frac, { expectedVersion: 2.5 }).ok, false);
});

// ── patch: 指数表記 / 楽観ロック / コメント重複 ───────────────────
test("BLOCK: 指数表記の to は patch が拒否", () => {
  assert.throws(() => computePatch(baseText, [{ path: "balance.autoAdvanceMs", from: base.balance.autoAdvanceMs, to: 1e-7, kind: "balance" }]));
});

test("BLOCK: 楽観ロック（現値と from 不一致）", () => {
  assert.throws(() => computePatch(baseText, [{ path: "balance.autoAdvanceMs", from: 999999, to: 1550, kind: "balance" }]));
});

test("OK: コメントに同一文言があってもキー指定で正しく置換", () => {
  const withComment = baseText.replace(
    'startButton: "▶ はじめる",',
    '// ラベル "▶ はじめる" を表示\n    startButton: "▶ はじめる",',
  );
  const out = computePatch(withComment, [{ path: "text.startButton", from: "▶ はじめる", to: "▶ はじまる", kind: "text" }]);
  assert.match(out, /startButton: "▶ はじまる",/);
  assert.match(out, /ラベル "▶ はじめる" を表示/);
});

// ── decide: 二極化 escalate / 片側偏在で ease / typo escalate ──────
test("DECIDE: 高不満で難/易拮抗は escalate（二極化）", () => {
  const d = decide({ config: base, currentStats: mkStats(100, 49, 2, 49), signals: {} });
  assert.equal(d.action, "escalate");
});

test("DECIDE: just=hard=50% easy=0% は易化 patch（境界の片側偏在）", () => {
  const d = decide({ config: base, currentStats: mkStats(20, 0, 10, 10), signals: {} });
  assert.equal(d.action, "patch");
  assert.equal(d.diff[0].path, "balance.distractorSimilarity");
});

test("DECIDE: 評価ラベルの誤字提案は escalate（自動置換しない）", () => {
  const d = decide({ config: base, currentStats: mkStats(20, 2, 14, 4), signals: { typos: [{ from: "むずかしい", to: "ハード" }] } });
  assert.equal(d.action, "escalate");
});

test("DECIDE: 母数不足での文言修正は escalate", () => {
  const d = decide({ config: base, currentStats: mkStats(3, 1, 1, 1), signals: { typos: [{ from: "おとあて", to: "おとあて！" }] } });
  assert.equal(d.action, "escalate");
});

test("NLP-BLOCK: 大改変の偽『誤字』(文言汚染)は patch されず escalate", () => {
  // プロンプトインジェクションで classifier に既存文言→詐欺文を出させたケースを模擬
  const d = decide({
    config: base,
    currentStats: mkStats(20, 2, 14, 4), // just優勢→balanceは無変更。typoだけが争点
    signals: { typos: [{ from: "おとあて", to: "当選！ http://evil.example で1万円もらえる今すぐクリック" }] },
  });
  assert.equal(d.action, "escalate");
});

test("NLP-OK: 本物の小さな誤字修正は自動 patch", () => {
  const d = decide({
    config: base,
    currentStats: mkStats(20, 2, 14, 4),
    signals: { typos: [{ from: "おとあて", to: "おとあて！" }] },
  });
  assert.equal(d.action, "patch");
  assert.equal(d.diff[0].path, "text.title");
});

// ── LLM経路の文言汚染（bidi/不可視・編集距離超過）を gate/verify が独立に弾く ──
test("BLOCK: 双方向制御文字(RLO)入りの文言は gate と verify が拒否", () => {
  const evil = base.text.resultPrefix + "\u202e"; // 表示偽装（右左反転）
  const n = bumped(); n.text.resultPrefix = evil;
  assert.equal(gate({ oldConfig: base, newConfig: n }).pass, false);
  const newText = computePatch(baseText, [{ path: "text.resultPrefix", from: base.text.resultPrefix, to: evil, kind: "text" }]);
  assert.equal(verifyText(newText, { expectedVersion: base.version + 1 }).ok, false);
});

test("BLOCK: ゼロ幅スペース / BOM 入りの文言も拒否", () => {
  const a = bumped(); a.text.title = "おと\u200bあて"; // ZWSP
  assert.equal(gate({ oldConfig: base, newConfig: a }).pass, false);
  const b = bumped(); b.text.title = "\ufeffおとあて"; // BOM
  assert.equal(gate({ oldConfig: base, newConfig: b }).pass, false);
});

test("BLOCK: 誤字修正の範囲を超える文言改変は gate が独立に拒否（decideを信頼しない）", () => {
  const to = "まったく別の宣伝文句にすり替える例文"; // 元と大きく異なる（編集距離が許容超）
  const n = bumped(); n.text.title = to;
  const r = gate({ oldConfig: base, newConfig: n });
  assert.equal(r.pass, false);
  assert.ok(r.failures.some((f) => f.includes("誤字修正の範囲")), r.failures.join("; "));
});

test("VERIFY-BLOCK: text に <> を含むと verify 単独でも弾く（gateと多層）", () => {
  const newText = computePatch(baseText, [{ path: "text.startButton", from: base.text.startButton, to: "<b>開始", kind: "text" }]);
  assert.equal(verifyText(newText, { expectedVersion: base.version + 1 }).ok, false);
});

// ── 正常系の回帰（壊していないこと） ─────────────────────────────
test("OK: 通常の易化 patch は gate/verify を通る", () => {
  const from = base.balance.distractorSimilarity;
  const to = 0.55;
  const newText = computePatch(baseText, [{ path: "balance.distractorSimilarity", from, to, kind: "balance" }]);
  const nc = loadConfigFromText(newText);
  assert.equal(verifyText(newText, { expectedVersion: base.version + 1 }).ok, true);
  assert.equal(gate({ oldConfig: base, newConfig: nc }).pass, true);
});
