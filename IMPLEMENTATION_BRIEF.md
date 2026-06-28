# ひらがな おとあて — 実装ブリーフ（codex 実装用・確定版）

対象: 5歳児向け「見て読める」かな おとあて PWA / iPhone Safari / 完全オフライン / 無料枠 / フレームワーク禁止（素の HTML/CSS/JS）。
アプリ root = `/Users/im/AI/hiragana/`（既存 `audio/`=52本検証済みを内包）。踏襲元 = `/Users/im/AI/reflex-lab/`。

本ブリーフは4設計＋検証済みかなテーブルを統合した唯一の正本。設計間で食い違う点は本書の確定値が優先。**確定した主要判断:**
- `data/kana.js` は検証済み JSON を `window.KANA_DATA` として**逐語埋め込み（改変禁止ゾーン）**。ほめ/再挑戦クリップ名は真実テーブルに無いため `game.js` 内 const に置く（ロジック資産）。
- 出題行は config の `balance.rows`（**数値重み 0..1**、0=出さない）で表現（配列禁止制約を回避）。
- rating は**クライアントで初回正答率から機械導出**して reflex-lab の既存スキーマ/ループ機構をほぼ無改変で再利用。
- per-kana 重点出題は**端末ローカル履歴 × `weakBoost`** で実装（config に苦手かな配列を書かない＝gate の配列/キー追加禁止に非抵触）。
- **gate.mjs は無改変**。自動レバーは衝突しないトップレベル数値 3 本のみ（`distractorSimilarity` / `autoAdvanceMs` / `weakBoost`）。`rows.*`・`choices`・`questionsPerSession` 等は自動で動かず escalate（人間承認）。

---

## 1. ファイルツリー（各1行）

```
/Users/im/AI/hiragana/
├── index.html              # 画面骨格・<head>メタ・読込順・SW登録
├── styles.css              # 明色こどもテーマ・特大タップ領域・花丸/誘導アニメ
├── data/
│   └── kana.js             # ★真実テーブル window.KANA_DATA（改変禁止ゾーン）
├── game-config.js          # ★AI自動修正ゾーン（version/balance/text/theme の値のみ）
├── feedback.js             # 声の収集層 window.Feedback（rating導出＋per-kana添付）
├── game.js                 # ★おとあてループ本体（編集禁止ゾーン・IIFE）
├── sw.js                   # オフラインSW（コア資産＋audio/*.m4a 全52件キャッシュ）
├── manifest.webmanifest    # PWA メタ（standalone/portrait/こども色）
├── icon.svg                # アイコン（クリーム背景に大きな「あ」、maskable）
├── audio/                  # 既存生成済み 46かな+6クリップ（.m4a）
├── api/
│   └── feedback.js         # Vercel Serverless（game/kana_json 受理を追加）
├── db/
│   └── schema.sql          # feedback(+game,+kana_json列) / patch_log
├── loop/
│   ├── config.mjs          # ★定数差し替え（BOUNDS/LEVERS/REQUIRED_SHAPE/CONFIG_PATH）
│   ├── gate.mjs            # 安全弁・純関数（reflex-lab から無改変コピー）
│   ├── collect.mjs / classify.mjs / decide.mjs / patch.mjs / verify.mjs / announce.mjs / run.mjs / db.mjs / notes.mjs
│   └── *.test.mjs          # gate/classify/hardening テスト（reflex-lab 流用）
├── .github/workflows/loop.yml  # 定期ループCI
├── package.json / vercel.json / .env.example
└── PATCHNOTES.md / decision.json / task.md / seed-feedback.json / project_summary.md
```

---

## 2. 読込順・依存（index.html `<body>` 末尾、順序＝依存関係）

```
1. data/kana.js     → window.KANA_DATA   （依存なし）
2. game-config.js   → window.GAME_CONFIG （依存なし）
3. feedback.js      → window.Feedback    （GAME_CONFIG.version を参照）
4. game.js          → IIFE 起動         （KANA_DATA, GAME_CONFIG, Feedback すべてに依存）
5. インライン<script>: 'serviceWorker' in navigator && navigator.serviceWorker.register('sw.js')
```
`<head>` に viewport/theme-color/manifest/apple-touch-icon/styles.css。**`game.js` は必ず最後**（先行 3 ファイルが未定義だと参照失敗）。

依存グラフ:
```
data/kana.js ─┐
game-config.js┤→ game.js → DOM操作 / audio/*.m4a 再生
feedback.js ──┘        └→ Feedback.record() → /api/feedback → Turso → loop
sw.js ← 全アセット(audio含む)をキャッシュ
loop/* → game-config.js を gate 通過後のみ書換
```

---

## 3. `data/kana.js` —★改変禁止ゾーン（検証済みテーブルを逐語埋め込み）

```js
// data/kana.js — かな真実テーブル（kana↔romaji↔audio↔confusables / row）
// ★改変禁止ゾーン。loop/AI は触らない。game.js と同格の不変ロジック資産。
// audio は "a.m4a" 形式（再生時に "audio/" を前置）。
window.KANA_DATA = {
  rows: [
    { id: "a",  label: "あ a",  kana: ["あ","い","う","え","お"] },
    { id: "ka", label: "か ka", kana: ["か","き","く","け","こ"] },
    { id: "sa", label: "さ sa", kana: ["さ","し","す","せ","そ"] },
    { id: "ta", label: "た ta", kana: ["た","ち","つ","て","と"] },
    { id: "na", label: "な na", kana: ["な","に","ぬ","ね","の"] },
    { id: "ha", label: "は ha", kana: ["は","ひ","ふ","へ","ほ"] },
    { id: "ma", label: "ま ma", kana: ["ま","み","む","め","も"] },
    { id: "ya", label: "や ya", kana: ["や","ゆ","よ"] },
    { id: "ra", label: "ら ra", kana: ["ら","り","る","れ","ろ"] },
    { id: "wa", label: "わ wa", kana: ["わ","を","ん"] }
  ],
  kana: [
    { kana:"あ", romaji:"a",   audio:"a.m4a",   row:"a",  confusables:["o","nu","me"] },
    { kana:"い", romaji:"i",   audio:"i.m4a",   row:"a",  confusables:["ri","ko"] },
    { kana:"う", romaji:"u",   audio:"u.m4a",   row:"a",  confusables:["tsu","ra","fu"] },
    { kana:"え", romaji:"e",   audio:"e.m4a",   row:"a",  confusables:["n","so"] },
    { kana:"お", romaji:"o",   audio:"o.m4a",   row:"a",  confusables:["a","su","na"] },
    { kana:"か", romaji:"ka",  audio:"ka.m4a",  row:"ka", confusables:["na","ta"] },
    { kana:"き", romaji:"ki",  audio:"ki.m4a",  row:"ka", confusables:["sa","chi"] },
    { kana:"く", romaji:"ku",  audio:"ku.m4a",  row:"ka", confusables:["he","shi"] },
    { kana:"け", romaji:"ke",  audio:"ke.m4a",  row:"ka", confusables:["ha","ho","ma"] },
    { kana:"こ", romaji:"ko",  audio:"ko.m4a",  row:"ka", confusables:["ni","i"] },
    { kana:"さ", romaji:"sa",  audio:"sa.m4a",  row:"sa", confusables:["ki","chi"] },
    { kana:"し", romaji:"shi", audio:"shi.m4a", row:"sa", confusables:["tsu","mo"] },
    { kana:"す", romaji:"su",  audio:"su.m4a",  row:"sa", confusables:["mu","o"] },
    { kana:"せ", romaji:"se",  audio:"se.m4a",  row:"sa", confusables:["sa","chi"] },
    { kana:"そ", romaji:"so",  audio:"so.m4a",  row:"sa", confusables:["ro","ru"] },
    { kana:"た", romaji:"ta",  audio:"ta.m4a",  row:"ta", confusables:["na","ka"] },
    { kana:"ち", romaji:"chi", audio:"chi.m4a", row:"ta", confusables:["sa","ki"] },
    { kana:"つ", romaji:"tsu", audio:"tsu.m4a", row:"ta", confusables:["shi","u","ra"] },
    { kana:"て", romaji:"te",  audio:"te.m4a",  row:"ta", confusables:["to","so"] },
    { kana:"と", romaji:"to",  audio:"to.m4a",  row:"ta", confusables:["te","ku"] },
    { kana:"な", romaji:"na",  audio:"na.m4a",  row:"na", confusables:["ta","ka"] },
    { kana:"に", romaji:"ni",  audio:"ni.m4a",  row:"na", confusables:["ko","ke"] },
    { kana:"ぬ", romaji:"nu",  audio:"nu.m4a",  row:"na", confusables:["me","ne","wa"] },
    { kana:"ね", romaji:"ne",  audio:"ne.m4a",  row:"na", confusables:["re","wa","nu"] },
    { kana:"の", romaji:"no",  audio:"no.m4a",  row:"na", confusables:["me","nu"] },
    { kana:"は", romaji:"ha",  audio:"ha.m4a",  row:"ha", confusables:["ho","ma","ke"] },
    { kana:"ひ", romaji:"hi",  audio:"hi.m4a",  row:"ha", confusables:["shi","mo"] },
    { kana:"ふ", romaji:"fu",  audio:"fu.m4a",  row:"ha", confusables:["u","ra","tsu"] },
    { kana:"へ", romaji:"he",  audio:"he.m4a",  row:"ha", confusables:["ku","shi"] },
    { kana:"ほ", romaji:"ho",  audio:"ho.m4a",  row:"ha", confusables:["ha","ke","ma"] },
    { kana:"ま", romaji:"ma",  audio:"ma.m4a",  row:"ma", confusables:["mo","ha","ho"] },
    { kana:"み", romaji:"mi",  audio:"mi.m4a",  row:"ma", confusables:["chi","sa"] },
    { kana:"む", romaji:"mu",  audio:"mu.m4a",  row:"ma", confusables:["su","me"] },
    { kana:"め", romaji:"me",  audio:"me.m4a",  row:"ma", confusables:["nu","no","a"] },
    { kana:"も", romaji:"mo",  audio:"mo.m4a",  row:"ma", confusables:["shi","ma","ya"] },
    { kana:"や", romaji:"ya",  audio:"ya.m4a",  row:"ya", confusables:["ma","mo"] },
    { kana:"ゆ", romaji:"yu",  audio:"yu.m4a",  row:"ya", confusables:["me","nu"] },
    { kana:"よ", romaji:"yo",  audio:"yo.m4a",  row:"ya", confusables:["ma","ra"] },
    { kana:"ら", romaji:"ra",  audio:"ra.m4a",  row:"ra", confusables:["u","tsu","chi"] },
    { kana:"り", romaji:"ri",  audio:"ri.m4a",  row:"ra", confusables:["i","ke"] },
    { kana:"る", romaji:"ru",  audio:"ru.m4a",  row:"ra", confusables:["ro","so"] },
    { kana:"れ", romaji:"re",  audio:"re.m4a",  row:"ra", confusables:["wa","ne","nu"] },
    { kana:"ろ", romaji:"ro",  audio:"ro.m4a",  row:"ra", confusables:["ru","so"] },
    { kana:"わ", romaji:"wa",  audio:"wa.m4a",  row:"wa", confusables:["ne","re","nu"] },
    { kana:"を", romaji:"wo",  audio:"wo.m4a",  row:"wa", confusables:["se","chi"] },
    { kana:"ん", romaji:"n",   audio:"n.m4a",   row:"wa", confusables:["e","so"] }
  ]
};
```

---

## 4. `game-config.js` —★AI自動修正ゾーン（完成形・コピペで動く）

```js
// game-config.js — AI 自動修正ゾーン / ひらがな おとあて
// loop/* が書換える唯一のファイル。値だけ変更可。変更したら version+1。
// 制約(reflex-lab loop/config.mjs): 配列/関数/getter/Symbol 不可・balance数値・theme=#rrggbb。
// 出題行は activeRows配列でなく rows{} の数値重み(0..1, 0=出さない)で表現する。
window.GAME_CONFIG = {
  version: 1,

  balance: {
    // ── 自動レバー(loopが±25%/回・1リーフ/回で動かす連続値) ──
    distractorSimilarity: 0.6, // 0..1 紛らわしさ。大=似た字で難 / 小=易（主レバー, easeSign -1）
    autoAdvanceMs: 1400,       // 正解→次問の待ち(ms)。大=ゆっくり=易い体感（easeSign +1）
    weakBoost: 2.0,            // 端末ローカル苦手かなの重点度。大=苦手集中=難（easeSign -1）
    // ── 人間承認のみ(escalate。loop自動変更不可) ──
    choices: 3,                // カード枚数。3択設計の中核（[2,4]整数）
    questionsPerSession: 7,    // 1セッション問数=花丸スロット数（[5,20]整数）
    newKanaBoost: 1.5,         // 初出かなの出題重み
    wrongLockMs: 600,          // 誤答後の一瞬の入力ロック(ms)。減点は無し
    retryHintDelayMs: 1200,    // 誤答後、正解カードを光らせ始める間(ms)
    rows: {                    // 出題行の重み(0..1)。0=出さない。あ行から段階解放(人間承認)
      a: 1, ka: 1, sa: 1, ta: 0, na: 0,
      ha: 0, ma: 0, ya: 0, ra: 0, wa: 0
    }
  },

  text: {                      // 子は読めない前提=最小。ratings は親/loop入力用(自動変更禁止)
    title: "おとあて",
    startButton: "▶ はじめる",
    replayButton: "🔊 もういちど",
    retryButton: "▶ もういちど",
    homeButton: "🏠",
    resultPrefix: "はなまる",
    feedbackHeading: "むずかしさは どうでしたか？",
    feedbackThanks: "ありがとう！",
    ratings: { easy: "かんたん", just: "ちょうどいい", hard: "むずかしい" }
  },

  theme: {                     // 明るいこども色。全て #rrggbb / accent≠bg（gate必須）
    bg: "#fff7e6", card: "#ffffff", cardText: "#2b2b2b",
    accent: "#ff7aa2", accentDim: "#ffb3c6",
    correct: "#54d18c", correctHalo: "#ffc23c",
    hanamaru: "#e8413b", dim: "#d9d4c7"
  }
};
```

---

## 5. `game.js` —★編集禁止ゾーン（IIFE・関数粒度＋擬似コード）

冒頭エイリアス: `const C=window.GAME_CONFIG, B=C.balance, T=C.text, TH=C.theme, KD=window.KANA_DATA, F=window.Feedback;`
派生: `const TABLE=Object.fromEntries(KD.kana.map(k=>[k.romaji,k]));`

クリップ名（真実テーブルに無いので const に固定。`audio/<name>.m4a`）:
```js
const PRAISE = ["seikai","yoku","sugoi","hanamaru"]; // 正解で1つランダム
const RETRY  = ["mouichido","oshii"];                // 誤答でやさしく1つ
const CLEAR  = "sugoi";                               // セッション完了の特大演出
```

### 5.1 初期化・配線
| 関数 | 責務 |
|---|---|
| `$(id)` | `document.getElementById` ショートカット |
| `applyTheme()` | `TH.*` を CSS変数(`--bg`,`--card`,`--card-ink`,`--accent`,`--accent-dim`,`--correct`,`--halo`,`--hanamaru`,`--dim`)へ反映 |
| `bindText()` | `T.*` を各DOM/aria-labelへ流し込み |
| `wire()` | `btn-start→startSession` / `btn-replay→playPrompt` / `btn-retry→startSession` / `btn-home→goHome` / rating ボタン群 / `fb-submit→submitFeedback`。**起動時 `applyTheme();bindText();wire();F.flush();` を実行し start 画面表示** |

DOM参照: `screenStart / screenQuiz / screenResult / elProgress(花丸スロット) / btnReplay / elChoices / elFlower(花丸オーバーレイ)`。

### 5.2 音声サブシステム（iOS対策の中核 → §5.6）
共有 `Audio` 2本: `promptAudio`（出題用）/ `praiseAudio`（ほめ・再挑戦用）。`let audioUnlocked=false;`
| 関数 | 責務 |
|---|---|
| `unlockAudio()` | 初回ユーザージェスチャ内で両要素を `muted=true; play().then(()=>{pause();currentTime=0;muted=false}).catch(()=>{})`。`audioUnlocked=true` |
| `playKana(romaji)` | `promptAudio.src="audio/"+TABLE[romaji].audio; promptAudio.currentTime=0; promptAudio.play().catch(()=>{})` |
| `playClip(name)` | `praiseAudio.src="audio/"+name+".m4a"; praiseAudio.currentTime=0; praiseAudio.play().catch(()=>{})` |
| `stopPrompt()` | `promptAudio.pause(); promptAudio.currentTime=0`（出題切替時） |

全 `play()` は Promise を `.catch(()=>{})`（失敗しても操作不能にしない）。

### 5.3 per-kana 統計（localStorage）
キー `hiragana_kana_v1` → `{romaji:{seen,correct}}`。
| 関数 | 責務 |
|---|---|
| `loadKanaStats()` | JSON.parse、無ければ `{}` |
| `saveKanaStats(s)` | JSON.stringify 保存 |
| `recordSeen(romaji)` | `seen++`、保存 |
| `recordCorrect(romaji)` | `correct++`、保存（**初回正答時のみ**） |
| `correctRate(romaji)` | `seen? correct/seen : 0`（未出題=0=最優先苦手） |

### 5.4 出題選択
状態: `state={ queue:[], idx:0, total:0, correctCount:0, firstTryCorrect:0, retries:0, current:null, locked:false, wrongThisQ:false }`
| 関数 | 責務 |
|---|---|
| `activePool()` | `KD.kana.filter(k=>(B.rows[k.row]||0)>0)`。空なら `row==="a"` で代替 |
| `weightOf(k)` | `(B.rows[k.row]||1)*(1 + B.weakBoost*(1-correctRate(k.romaji)) + (loadKanaStats()[k.romaji]?.seen?0:B.newKanaBoost))` |
| `buildQueue()` | pool から重み付き抽選で `B.questionsPerSession` 件。**直近1問と同一 romaji を避ける**（連続防止）。pool が問数未満でも重複可で充足 |
| `chooseDistractors(answer)` | `B.choices-1` 個。各枠 確率 `B.distractorSimilarity` で `answer.confusables`(TABLE実在のみ) から、外れたら pool からランダム。`answer` と既選択を排除、不足は全 TABLE からランダム補完 |
| `shuffle(arr)` | Fisher–Yates（正解位置の偏り防止） |
| `weightedPick(items)` | weightOf による重み付き1件抽選ヘルパ |

### 5.5 ゲームループ（擬似コード）
```
startSession():                        # ← start/retry タップのジェスチャ直下
  unlockAudio()                        # iOS解錠（初回のみ実効）
  state = freshState()
  state.queue = buildQueue()
  state.total = state.queue.length
  show(screenQuiz); renderProgress()
  nextQuestion()

nextQuestion():
  if state.idx >= state.total: return endSession()
  state.current   = TABLE[ state.queue[state.idx] ]
  state.wrongThisQ = false
  state.locked    = false
  recordSeen(state.current.romaji)
  renderProgress()                     # 花丸スロット idx 個ぶん点灯
  renderChoices(state.current)         # 3枚（大）を shuffle して配置
  playPrompt()                         # 出題音を自動再生

playPrompt():                          # 🔊もういちども常にこれを呼ぶ（ジェスチャ内=常に可）
  stopPrompt(); playKana(state.current.romaji)

renderChoices(answer):
  options = shuffle([answer.romaji, ...chooseDistractors(answer)])
  elChoices.innerHTML = ""
  for romaji in options:
    card = <button class="kana-card" data-romaji=romaji aria-label=...>
    card.textContent = TABLE[romaji].kana       # 字形のみ・特大
    card.onclick = () => onChoiceTap(romaji, card)
    elChoices.append(card)

onChoiceTap(romaji, el):
  if state.locked: return
  if romaji === state.current.romaji: handleCorrect(el)
  else:                                handleWrong(el)

handleCorrect(el):
  state.locked = true
  el.classList.add("correct")          # 緑+花丸(色だけに依存しない:形◎/動き/音で冗長化)
  if !state.wrongThisQ:
     state.firstTryCorrect++; recordCorrect(state.current.romaji)
  state.correctCount++
  showFlower(); playClip( PRAISE[rand] )     # ほめ音（ジェスチャ外でも解錠済要素で鳴る）
  fillProgressSlot(state.idx)          # 花丸が1個“咲く”
  setTimeout(()=>{ hideFlower(); state.idx++; nextQuestion() }, B.autoAdvanceMs)

handleWrong(el):                       # ★ペナルティ無し・正解は隠さない・同じ問題に留まる
  state.locked = true
  state.wrongThisQ = true; state.retries++
  el.classList.add("dim","shake")      # 沈める+首振り（×や赤は出さない）
  playClip( RETRY[rand] )              # 「おしい/もういちど」
  setTimeout(()=> highlightCorrectCard(), B.retryHintDelayMs)  # 正解カードをハロー呼吸発光
  setTimeout(()=>{ state.locked=false }, B.wrongLockMs)        # すぐ再挑戦可

endSession():
  show(screenResult)
  renderResult( T.resultPrefix, state.correctCount )   # 花丸の数だけ表示。数字スコアは出さない
  playClip(CLEAR)
  resetFeedbackUI()
  submitFeedbackAuto()                 # ← rating自動導出して送信（親操作不要）
```
補助: `renderProgress()`（花丸スロット○×total）/ `fillProgressSlot(i)` / `showFlower()`/`hideFlower()`（💮/SVG 拡大回転キラ）/ `highlightCorrectCard()`（`data-romaji===current` に `.halo` 付与）/ `goHome()`（result→start、進捗は保持）。
**誤タップ防止:** 演出/音再生中は `state.locked` で全入力無視。連打・ダブルタップ・スワイプ誤爆を吸収。

### 5.6 iOS Safari 音声アンロック（実装指示）
1. `Audio` は**新規生成せず固定2本**（`promptAudio`/`praiseAudio`）を使い回す。src 差し替えで再生してもアンロック継続。
2. `startSession()`（=「▶はじめる」/「▶もういちど」タップのジェスチャ直下）で `unlockAudio()`: 両要素を `muted=true→play()→pause();currentTime=0;muted=false`。以後は同一要素への `play()` が**ジェスチャ外**（autoAdvance の `nextQuestion`、花丸ほめ音）でも許可される。
3. 🔊「もういちど」は常にタップ＝ジェスチャ内で無条件再生可。
4. 全 `play()` は `.catch(()=>{})`（解錠失敗時も無音で進行＝操作不能にしない）。WebAudio は使わない（52本デコードが重い）。
5. HTML/CSS 補助: `<meta viewport ... maximum-scale=1, user-scalable=no, viewport-fit=cover>`、`touch-action:manipulation`、`-webkit-tap-highlight-color:transparent`、`-webkit-touch-callout:none; user-select:none`、引っぱり更新抑制。

### 5.7 フィードバック導出（§6 と連携）
```
submitFeedbackAuto():
  q = state.total
  firstTryRate = q ? state.firstTryCorrect / q : 0
  retriesPerQ  = q ? state.retries / q : 0
  rating = (firstTryRate < 0.55 || retriesPerQ >= 1.0) ? "hard"
         : (firstTryRate >= 0.90 && retriesPerQ < 0.15) ? "easy"
         : "just"
  F.record({ rating, comment:"", score: state.firstTryCorrect,
             game:"hiragana", kana: loadKanaStats() })
```
※しきい値は**ロジック層（自動修正ゾーン外）**＝gate に守られる。任意で親エリア（ロゴ2秒長押し）で rating 上書きボタン（`T.ratings.*`）を出せるが、無くても kana 履歴でループは学習可能。

---

## 6. `feedback.js`（クライアント）— reflex-lab からの差分

ベース = `/Users/im/AI/reflex-lab/feedback.js`。**変更点のみ:**
- キー名: `MIRROR_KEY="hiragana_feedback_v1"`, `QUEUE_KEY="hiragana_feedback_queue_v1"`。`ENDPOINT="/api/feedback"`。
- `record({rating, comment, score, game, kana})` に拡張。entry へ追加:
  ```
  entry.game = (game||"hiragana")
  entry.kana = kana || {}     // {romaji:{seen,correct}}
  ```
- `flush()`・オフラインキュー・再送・`export`・`load`・`window load/online` リスナは**無改変**。

---

## 7. index.html / styles.css / manifest / icon

### index.html
- `<head>`: `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">`、`<meta name="theme-color" content="#fff7e6">`、`<link rel="manifest" href="manifest.webmanifest">`、`<link rel="icon" href="icon.svg">`、`<link rel="apple-touch-icon" href="icon.svg">`、`<link rel="stylesheet" href="styles.css">`。
- `<body>`: 3 セクション `#screen-start`（タイトル＋大きな `#btn-start`）/ `#screen-quiz`（`#progress`花丸スロット, `#btn-replay`🔊, `#choices`, `#flower`オーバーレイ, `#btn-home`）/ `#screen-result`（花丸数, rating ボタン群(任意), `#fb-submit`, `#fb-thanks`, `#btn-retry`）。
- 末尾に §2 の 5 スクリプト（順序厳守）。

### styles.css
- CSS変数を `:root` に宣言し `applyTheme()` が上書き。背景 `var(--bg)`、カード `var(--card)`、字 `var(--card-ink)`。
- `.kana-card`: 画面幅3分割の正方形に近い**特大**（実機最低 100×100px, 目標 120px+）、字は中央寄せ特大（教科書体系の太字）、カード間 `gap≥24px`。🔊/▶/🏠 は最低 88×88px。`env(safe-area-inset-*)` 尊重。
- 状態クラス: `.correct`(緑) / `.dim`(沈めグレー, 消さない) / `.shake`(横首振り keyframes) / `.halo`(`--halo` 色の光の輪＋呼吸 keyframes)。花丸 `.flower`(◎渦巻き・拡大回転キラ)。**正誤は色単独に依存させない**（形・動き・音で冗長化）。

### manifest.webmanifest
```json
{ "name":"おとあて", "short_name":"おとあて", "lang":"ja", "dir":"ltr",
  "start_url":".", "display":"standalone", "orientation":"portrait",
  "background_color":"#fff7e6", "theme_color":"#ff7aa2",
  "icons":[{"src":"icon.svg","sizes":"any","type":"image/svg+xml","purpose":"any maskable"}] }
```

### icon.svg
`viewBox 0 0 512 512`、角丸 `rx=112`、背景 `#fff7e6`、中央に大きな「あ」`#ff7aa2`。maskable 安全域（中央80%）確保。

---

## 8. `sw.js` — オフライン（コア資産＋audio 全52件を明示列挙）

```js
const CACHE = "hiragana-v1"; // 配信ごとに +1
const ASSETS = [
  ".", "index.html", "styles.css",
  "data/kana.js", "game-config.js", "feedback.js", "game.js",
  "manifest.webmanifest", "icon.svg",
  // ── 46かな（AUDIO MANIFEST と完全一致） ──
  "audio/a.m4a","audio/i.m4a","audio/u.m4a","audio/e.m4a","audio/o.m4a",
  "audio/ka.m4a","audio/ki.m4a","audio/ku.m4a","audio/ke.m4a","audio/ko.m4a",
  "audio/sa.m4a","audio/shi.m4a","audio/su.m4a","audio/se.m4a","audio/so.m4a",
  "audio/ta.m4a","audio/chi.m4a","audio/tsu.m4a","audio/te.m4a","audio/to.m4a",
  "audio/na.m4a","audio/ni.m4a","audio/nu.m4a","audio/ne.m4a","audio/no.m4a",
  "audio/ha.m4a","audio/hi.m4a","audio/fu.m4a","audio/he.m4a","audio/ho.m4a",
  "audio/ma.m4a","audio/mi.m4a","audio/mu.m4a","audio/me.m4a","audio/mo.m4a",
  "audio/ya.m4a","audio/yu.m4a","audio/yo.m4a",
  "audio/ra.m4a","audio/ri.m4a","audio/ru.m4a","audio/re.m4a","audio/ro.m4a",
  "audio/wa.m4a","audio/wo.m4a","audio/n.m4a",
  // ── 6 ほめ/再挑戦 ──
  "audio/seikai.m4a","audio/yoku.m4a","audio/hanamaru.m4a",
  "audio/sugoi.m4a","audio/mouichido.m4a","audio/oshii.m4a"
];
```
- `install`: `caches.open(CACHE).then(c=>c.addAll(ASSETS))` ＋ `self.skipWaiting()`。
- `activate`: 旧 CACHE 削除 ＋ `clients.claim()`。
- `fetch` **ハイブリッド**:
  - `audio/*.m4a` → **cache-first**（不変・大容量・完全オフライン保証）。
  - それ以外 → **network-first → 失敗時 cache**（game-config パッチを速く反映）。
  - ナビゲーション要求のオフライン時は `index.html` を返す。
- 同期補助（人間が実行・コミット時の検算）: `ls audio/*.m4a | sed 's/^/  "/; s/$/",/'` で 52 行を再確認。

---

## 9. reflex-lab からの差分（loop / gate / api / db / loop.yml）

> 核心: rating をクライアントで導出し、per-kana 重点出題は端末ローカルで行うため、**収集→分類→決定→gate→patch→検証のループ本体はほぼ無改変**。差分は「2列追加」「定数差し替え」「受理検証」に限定。

### 9.1 `db/schema.sql`（2列追加・後方互換）
`feedback` に追加（既存 reflex-lab DB と共存可＝既定値あり）:
```sql
  game        TEXT NOT NULL DEFAULT 'hiragana',  -- マルチゲーム識別子
  kana_json   TEXT NOT NULL DEFAULT '{}',        -- per-kana {romaji:{seen,correct}}
```
追加: `CREATE INDEX IF NOT EXISTS idx_feedback_game_ver ON feedback(game, config_version);`
`patch_log` は無改変。

### 9.2 `api/feedback.js`（受理検証を追加）
ベース = reflex-lab。**追加のみ:**
- 許可 romaji 集合を定義（46。`data/kana.js` の romaji と一致）。
- `game`: `/^[a-z0-9_-]{1,24}$/` で正規化、既定 `"hiragana"`。
- `kana`: オブジェクト検証 → 許可 romaji キーのみ通す / 各値 `0 ≤ correct ≤ seen ≤ 200` の整数 clamp / キー数 ≤ 46 / JSON 長 ≤ 2KB → `kana_json` 文字列化。
- INSERT を拡張:
  ```sql
  INSERT INTO feedback (ts, config_version, rating, comment, score, game, kana_json, ua_hash)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ```
- rate-limit(`ua_hash`×120s×6)・`rating` 検証・503でフロント再送キュー温存は**無改変**。

### 9.3 `loop/config.mjs`（定数差し替え＝アプリ依存の唯一点）
`CONFIG_PATH` は `resolve(ROOT,"game-config.js")` のままで OK（hiragana root）。以下 3 ブロックを置換:
```js
export const BALANCE_BOUNDS = {
  distractorSimilarity: [0, 1],
  autoAdvanceMs:        [600, 3000],
  weakBoost:            [1, 3],
  choices:              [2, 4],     // 非レバー(escalate)
  questionsPerSession:  [5, 20],    // 非レバー(escalate)
  newKanaBoost:         [1, 3],     // 非レバー
  wrongLockMs:          [200, 1500],// 非レバー
  retryHintDelayMs:     [600, 3000],// 非レバー
};
// 自動で動かす連続値のみ（トップレベル葉名=衝突なし→gate無改変で安全）
export const DIFFICULTY_LEVERS = [
  { path: "balance.distractorSimilarity", easeSign: -1, roundTo: 0.05 }, // 下げる=易
  { path: "balance.autoAdvanceMs",        easeSign: +1, roundTo: 50 },   // 上げる=易
  { path: "balance.weakBoost",            easeSign: -1, roundTo: 0.1 },  // 下げる=易
];
export const DIFFICULTY_LEVER_PATHS = new Set(DIFFICULTY_LEVERS.map(l => l.path));
export const REQUIRED_SHAPE = {
  version: "number",
  "balance.distractorSimilarity": "number", "balance.autoAdvanceMs": "number",
  "balance.weakBoost": "number", "balance.choices": "number",
  "balance.questionsPerSession": "number", "balance.newKanaBoost": "number",
  "balance.wrongLockMs": "number", "balance.retryHintDelayMs": "number",
  "balance.rows.a":"number","balance.rows.ka":"number","balance.rows.sa":"number",
  "balance.rows.ta":"number","balance.rows.na":"number","balance.rows.ha":"number",
  "balance.rows.ma":"number","balance.rows.ya":"number","balance.rows.ra":"number",
  "balance.rows.wa":"number",
  "text.title":"string","text.startButton":"string","text.replayButton":"string",
  "text.retryButton":"string","text.homeButton":"string","text.resultPrefix":"string",
  "text.feedbackHeading":"string","text.feedbackThanks":"string",
  "text.ratings.easy":"string","text.ratings.just":"string","text.ratings.hard":"string",
  "theme.bg":"string","theme.card":"string","theme.cardText":"string",
  "theme.accent":"string","theme.accentDim":"string","theme.correct":"string",
  "theme.correctHalo":"string","theme.hanamaru":"string","theme.dim":"string",
};
// 任意（苦手かな抽出を将来 loop 側で使う場合のみ）
export const MIN_KANA_SEEN = 4;
export const WEAK_T = 0.6;
```
`MIN_N`/`JUST_DOMINANT`/`DECISION_MARGIN`/`STEP`/`MAX_DELTA`/`MAX_BALANCE_CHANGES`/`REGRESSION_EPS`/`THEME_COLOR_RE`/`TEXT_MAX`/text編集系/`loadConfigFromText`/`toPlainData`/ヘルパ群は**無改変**。

### 9.4 `loop/gate.mjs` — **無改変コピー**
v1 の自動レバーは全てトップレベル葉名（`distractorSimilarity`/`autoAdvanceMs`/`weakBoost`）で `BALANCE_BOUNDS[leaf]` 衝突が無いため reflex-lab の gate をそのまま使える。`rows.*`・`choices` 等は `DIFFICULTY_LEVER_PATHS` 外なので gate が自動的に「難易度レバー外＝人間承認へ」と escalate する（＝安全）。
> （任意 v2 拡張: weak-row 自動 down-weight を入れる場合のみ、gate の `const bounds = BALANCE_BOUNDS[leaf];` 直前に「`key` が `balance.rows.` で始まれば `ROW_WEIGHT_BOUNDS[0,1]` を使う」1分岐を追加。v1 では不要。）

### 9.5 `loop/verify.mjs`
- `REQUIRED_SHAPE`（9.3）に全リーフを更新（型チェック）。
- 追加チェック: `balance.choices` と `balance.questionsPerSession` は整数、`choices ≥ 2`。
- 追加チェック（任意・堅牢化）: `balance.rows.*` の各キーが `data/kana.js` の `KANA_DATA.rows[].id` 集合に存在。

### 9.6 `collect.mjs / classify.mjs / decide.mjs / patch.mjs / announce.mjs / run.mjs / *.test.mjs`
- v1 は**無改変流用**（rating はクライアント導出で既存スキーマに乗るため、aggregate/negRate/easeOrHarden がそのまま機能）。`decide` は新 `DIFFICULTY_LEVERS` を参照して `distractorSimilarity→autoAdvanceMs→weakBoost` の順に1リーフ提案。
- `gate.test.mjs`/`hardening.test.mjs` は新 `BALANCE_BOUNDS`/レバーに合わせて期待値だけ更新。
- （任意拡張: `collect.mjs` で `kana_json` も SELECT し per-kana 合算→`classify`/PATCHNOTES に「苦手かな上位」を載せる。v1 では未使用でよい。）

### 9.7 `.github/workflows/loop.yml`
- 単体運用なら reflex-lab と同形（定期 cron → `node loop/run.mjs` → gate green なら commit）。env は Turso(+任意 GROQ)。
- reflex-lab 結合時のみ matrix 化（§11）。

---

## 10. 受け入れ基準（チェックリスト）

- [ ] **オフライン起動**: 機内モードでもホーム追加済みアプリが起動し全画面動作（SW が audio52件含む全資産を cache）。
- [ ] **音が鳴る**: 出題で対象かな `*.m4a` が自動再生、🔊で再再生（iOS 初回タップ後）。
- [ ] **3択判定**: 3枚の かなカードから正答タップで正解、誤答で不正解と判定。
- [ ] **花丸/再挑戦**: 正解＝花丸＋ほめ音＋自動送り。誤答＝減点/×/否定音なし・正解は見えたまま・色＋動き＋音で誘導・同問再挑戦。
- [ ] **PWA インストール可**: manifest/icon/SW 有効、Safari「ホーム画面に追加」で standalone 起動。
- [ ] **gate green**: `version+1` ＋ `distractorSimilarity`(または `autoAdvanceMs`/`weakBoost`) 1リーフ±25% の変更が gate を pass。`rows.*`/`choices`/`text.ratings.*` 変更は escalate。
- [ ] **loop:dry 動作**: `node loop/run.mjs --dry`（または該当フラグ）が collect→classify→decide→gate→verify を例外なく完走し決定を出力。
- [ ] **真実テーブル不可侵**: `data/kana.js` は gate 条件1（game-config.js 単独変更）で自動改変不可。
- [ ] **per-kana 学習**: 完了時 `kana`(seen/correct) が `/api/feedback` に乗り Turso に蓄積、苦手かなが `weakBoost` で多く出る。

---

## 11. 完成後 reflex-lab と結合する手順（案A: 同一 Turso＋同一 loop を `game` で多重化／推奨）

極小規模（甥1人×2ゲーム）のため案A（DB1個・workflow1本・gate純関数核を共有）を採用。手順:
1. **DB 統合**: 既存 reflex-lab Turso に §9.1 の `game`/`kana_json` 2列＋index を適用（`turso db shell <db> < db/schema.sql`、IF NOT EXISTS で冪等）。既存 reflex-lab 行は `game='hiragana'` 既定では無いため、reflex-lab 側 insert にも `game='reflex-lab'` を明示（or 既定を `'reflex-lab'` のまま別途付与）。両ゲームの行は `feedback.game` で弁別。
2. **api 共有**: 1つの `api/feedback.js` に統合（`game` で分岐検証）。hiragana は kana 検証あり、reflex-lab は kana 無視（既定 `{}`）。
3. **loop パラメータ化**: `loop/run.mjs` を `GAME` env/引数で受け、ゲーム別「戦略モジュール」`loop/strategy/<game>.mjs`（= `BALANCE_BOUNDS`/`DIFFICULTY_LEVERS`/`REQUIRED_SHAPE`/`CONFIG_PATH`/rating導出有無/per-kana有無）を注入。`gate.mjs` は純関数のまま共有。collect は `WHERE game=?` で絞る。
4. **workflow matrix 化**: `.github/workflows/loop.yml` を `strategy.matrix.game:[reflex-lab, hiragana]` にし、各ジョブが該当 repo/path の `game-config.js` を gate 通過時のみ commit。env(Turso/GROQ) は共通。
5. **ハブ（任意）**: トップに静的 `index.html`（ゲーム一覧 LP）を置き両 PWA へ導線。
6. **将来の分離点**: スキーマ/更新頻度が衝突する「本物の3本目」が出た時に案B（リポ/DB分離＋共有 `@loop/core`）へ移行。`feedback.game` で既に弁別済みのためデータ移送は容易。

### 実装着手順（codex 推奨シーケンス）
`data/kana.js`（逐語）→ `game-config.js`（§4）→ `index.html`/`styles.css` 骨格 → `game.js`（§5, 擬似コード通り）→ `feedback.js`（§6 差分）→ `manifest`/`icon`/`sw.js`（§7,§8）→ ローカルで §10 の起動・音・3択・花丸を実機/Safari 確認 → `db`/`api`（§9.1,9.2）→ `loop/config.mjs`/`verify.mjs`（§9.3,9.5）＋ `gate.mjs` コピー → `loop:dry` と `gate.test` green を確認 → §11 で結合。

---
関連パス: 真実テーブル元データ＝本書§3 / 既存音源 `/Users/im/AI/hiragana/audio/`（52件確認済）/ 踏襲元 `/Users/im/AI/reflex-lab/{feedback.js, api/feedback.js, db/schema.sql, loop/config.mjs, loop/gate.mjs}`（本書の差分はこれら実ファイルに基づく）。