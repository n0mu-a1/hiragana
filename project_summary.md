# ひらがな おとあて — project_summary

## 現在の目的
未就学児（甥っ子5歳）向け「ひらがな おとあて」PWA。iPhone Safari・完全オフライン・無料・課金NG。
**完成条件＝「見て読める」**: 音が鳴る → 3つのかなカードから正しい字をタップ → 正解で花丸＋ほめ音、誤答はやさしく再挑戦。
こだわり: 完成後 `/Users/im/AI/reflex-lab` と結合（同一 Turso / 同一 loop 機構の共有 or マルチゲームhub）。

## 重要な設計判断
- **reflex-lab 構成を踏襲**（素のHTML/CSS/JS PWA、フレームワーク禁止）。`game-config.js`=AI自動修正ゾーン（balance/text/theme の値だけ）。
- **かな真実テーブル（kana↔romaji↔audio↔confusables）は `data/kana.js` に固定**＝game.js同様に自動修正禁止ゾーン。gate が「game-config.jsのみ」を守る限り改変されない。
- quiz方式＝**音声再生→3択（かな字形）から選ぶ**。🔊もう一回ボタン、特大タップ領域、ペナルティ無し。
- 音声＝**mac `say`(Kyoko) でローカル生成・同梱**（完全オフライン・無料・課金ゼロ）。
- 任せ方＝**設計は私／実装は codex に委譲**。

## 完了した変更
- `tools/gen-audio.sh` — 再現可能な音声生成スクリプト（say -r105 + ffmpeg で先頭120ms/末尾220ms無音付与しAAC化）。
- `audio/*.m4a` — **52ファイル生成・検証済み**（46かな + ほめ/再挑戦6）。合計288K。
- **codex実装完了**: index.html/styles.css/game.js/game-config.js/data/kana.js/feedback.js/sw.js/manifest/icon + api/feedback.js/db/schema.sql/loop全式/.github/loop.yml 等。
- **多段検証 全green**: 静的(node --check) / 内容(verify.mjs: kana46・rows{}・音声参照全実在) / loopテスト52/52 / loop:dry-run / **ブラウザE2E（iPhone 390×844）= 音声HTTP200・3択・正解花丸+自動送り・誤答dim+shake+ハロー誘導・結果7×💮・FB送信・統計永続・コンソールエラー0**。
- **敵対的レビュー（28エージェント・各指摘を再検証）= ブロッカー0**。実在 major1+minor約9+nit約7、誇張5件は棄却。
- **確定指摘を codex で修正（委譲）・再検証済み**:
  - [major] game.js タイマー3種をstateで管理し clearTimers() を goHome/startSession/nextQuestion で破棄＋各コールバックにクイズ画面ガード（ホーム遷移時の幽霊出題・音声漏れ・統計汚染を解消）。回帰テストで seen 不増を確認。
  - [minor] game.js フィードバック=1セッション1記録（endSessionで保留→手動優先、未評価で離脱時のみ自動1件）。回帰で二重記録なしを確認。
  - [minor] styles.css iPhone幅で🔊🏠を88px化・.choices gap24px・`-webkit-user-select`追加。
  - [minor] sw.js 非GET即return（POSTのcache.put拒否＝unhandled rejection解消）。CACHE→hiragana-v3。
  - [minor] iOSアイコン: icon-180/192/512.png をChromeで生成→index.html/manifest/sw.jsに配線。

## reflex-lab 結合（完了・2026-06-28）— 「あそびハブ」
- **方式**: reflex-lab を拡張してマルチゲームハブ化（既存 repo `n0mu-a1/reflex-lab` / Vercel project `reflex-lab`(本番 reflex-lab-two.vercel.app) / Turso `reflex-lab-nomura` / 6h自律ループ / x-poster告知 を全て流用・非破壊）。**commit/push は未実施**（user がレビュー後にデプロイ）。
- **調査で判明**: 「別アプリ統合」= `/Users/im/AI/kanji-drill`（教育漢字1013字4択PWA・画像不具合報告→Vercel Blob の別系統）。reflex-lab とはコード/Turso/Vercel 非共有。**kanji-drill は完全不可触**（git 0 dirty 確認）。元 `/Users/im/AI/hiragana` も不可触（reflex-lab/hiragana/ へコピー）。
- **構造**: `reflex-lab/` ルート=ハブ画面（あそびハブ：2カード→ `/hiragana/` `/reflex/`）。reflex 旧一式は `reflex/` へ移動、hiragana 一式は `hiragana/` へコピー。`api/` `db/` `loop/` `.github/` はルートで統合。
- **Phase1（codex）**: ルートに index/styles/manifest/sw/icon(ハブ)。`api/feedback.js`=reflex堅牢化(rate limit/Origin/ua_hash/ts)維持+`game∈{reflex,hiragana}`検証(既定reflex)+`kana_json`(hiragana時のみ・上限2000字)+INSERT列拡張。`reflex/feedback.js`に`game:"reflex"`付与（hiraganaは既に付与済）。`db/schema.sql`に game/kana_json。`db/migrate.mjs`(新規・冪等)=既存DBへ `ALTER ADD COLUMN game DEFAULT 'reflex'`/`kana_json`（既存reflex行は自動 game='reflex' にバックフィル＝非破壊）。`package.json` に `db:migrate`。
- **Phase2（codex）**: `loop/config.mjs` に PROFILES{reflex,hiragana}（GAME_CONFIG_FILE/PATCHNOTES/DECISION/SEED/BALANCE_BOUNDS/DIFFICULTY_LEVERS をゲーム別、共有スカラーは据置）+ getProfile。`run.mjs --game`、`collect` は `WHERE game=?`、decide/gate/patch/notes を profile 伝播。gate の「game-config.jsのみ」「ALLOWED_DOCS」をゲーム別パス化、安全弁は全維持。`loop.yml`=単一ジョブで2ゲーム逐次(`for g in reflex hiragana`)→ reflex-lab-bot で1コミット→push（push競合回避）。
- **検証 全green**: `node --check loop/*.mjs` / `node --test loop/*.test.mjs` 53/53 / 両ゲーム dry-run 完走（reflex は config v2 vs seed v1 でN=0→noop＝正しい挙動、hiragana はN=10で patch提案）/ ブラウザE2E(390×844: ハブ2カード描画・/hiragana/(おとあて)・/reflex/(config v2保持)・**コンソールエラー0**)/ 全ルート+音声 HTTP200。

## マージ完了（2026-06-28）— PR #1 / squash `0a55d3c`
- **pr-merge スキルで一気通貫**: 敵対的レビュー(blocker2/major1/minor複数・棄却0)→ codex で全修正 → 検証(node --check 全OK・`node --test` 53/53・両ゲーム dry-run 完走)→ ブランチ `hub-integration` → コミット → push → PR #1 → **squash マージ** → main 追従。
- **レビュー修正の要点**: [blocker]移行順序事故=api/collect を未マイグレーション時 graceful 退化＋loop.yml に冪等 migrate ステップ(自己修復)／[blocker]loop.yml の git add から .gitignore対象 decision.json 除去／[major]run.mjs 異常終了 decision を --game 別パスへ／[minor]sub-SW のキャッシュ削除を自prefix限定・hiragana SW audio サブパス対応・verify に rows∈[0,1]・整数検査復活・loop:dry seed パス。
- **本番稼働確認(2026-06-28)**: `/`=あそびハブ・`/hiragana/`=おとあて・`/reflex/`=瞬発ラボ 全 200、`/hiragana/audio/a.m4a` 200(audio/mp4)。Vercel 本番デプロイ成功。
- **コミット除外**(意図通り): `decision.json`(reflex/・hiragana/)・`.env.local`・`node_modules/`（全て .gitignore）。

## 未完了タスク（user 手動）
- [ ] **Turso 列追加 `npm run db:migrate`**: 本番DB操作のため auto-mode 分類器がブロック（私は未実行）。**ただし必須ではない**=マージ済み loop.yml の migrate ステップが次回 cron(≤6h)で自動実行＋api/collect は graceful 退化するため無停止。即時有効化したい場合のみ user が手動実行（reflex-lab で `set -a; . ./.env.local; set +a; node db/migrate.mjs`）。
- [ ] 後回しの軽微指摘（任意）: .choices 3列固定（人間承認レバー・既定3）、hub アイコンのオフライン欠け(cosmetic)。
- [ ] 任意: ハブに kanji-drill カード追加（本番URL が分かれば `<a>` 1行で追加可）。

## 編集したファイル一覧
- tools/gen-audio.sh（新規）, audio/*.m4a（生成・52）
- PWA一式（codex生成）: index.html, styles.css, game.js, game-config.js, data/kana.js, feedback.js, sw.js, manifest.webmanifest, icon.svg
- icon-180.png / icon-192.png / icon-512.png（Chromeで生成）
- api/feedback.js, db/schema.sql, loop/*, .github/workflows/loop.yml, package.json, vercel.json, README.md, PATCHNOTES.md 等
- IMPLEMENTATION_BRIEF.md（codex委譲用の唯一の仕様源）, data_kana_table.json（検証済みテーブル）
- project_summary.md（本ファイル）

## 音声マニフェスト（コード/SWはこの名前に束縛）
かな: a i u e o ka ki ku ke ko sa shi su se so ta chi tsu te to na ni nu ne no ha hi fu he ho ma mi mu me mo ya yu yo ra ri ru re ro wa wo n
ほめ/再挑戦: seikai yoku hanamaru sugoi mouichido oshii

## ふぐあい報告UI（承認型・漢字ドリル方式）— 2026-06-28
- report.js（新規）: 画面スクショ(html2canvas)＋一言＋メタを別オリジンの patch-bot へ POST。
  送信先 = https://reflex-lab-two.vercel.app/api/report （`window.PATCHBOT_REPORT_URL` で上書き可）、payload に app:"hiragana"。
  720px JPEG圧縮、オフライン時 localStorage キュー(hiragana_report_queue_v1)で再送。game.js 非依存(DOMから画面導出)。
- index.html に report.js 読込、styles.css に報告UI(ピンク系)、sw.js を v3→v4 で report.js プリキャッシュ。
- main に直接コミット（1285c0b、未コミットだったアプリ実装一式も併せて baseline 化）。

## 本番デプロイ＋疎通確認（2026-06-29）
- **前提変化を確認**: 旧ゲームハブ（reflex-lab-two.vercel.app の `/` `/hiragana/`）は patch-bot 化で**消滅（404）**。Vercel プロジェクト `reflex-lab`(reflex-lab-two) は今や **patch-bot repo にリンク**。hiragana 本番はどこにも無い状態だった。
- **patch-bot 受信疎通 = OK**: env `BLOB_READ_WRITE_TOKEN`(45分前作成) 反映のため patch-bot を `vercel --prod --yes` で再デプロイ → `/api/report` に hiragana テスト報告1件 POST → `{ok:true}` / Blob `reports/hiragana/2026-06-28/1782661211117-c37c4245.json (507B)` 保存確認。※初回は再デプロイ前で503（正しく未保存）。
- **テスト artifact 残置**: 上記 blob 1件。掃除は auto-mode が mass-delete 判定でブロック→残置（507B・triage cron 停止中で無害）。必要時 user が個別削除。
- **hiragana を新規 Vercel プロジェクト `hiragana` として本番デプロイ** = **https://hiragana-red.vercel.app** （このスタンドアロン repo を `vercel --prod --yes`、dir 名で新規プロジェクト作成）。
- **本番実測 全 200**: `/` index/game.js/report.js/data/kana.js、`/audio/a.m4a`(audio/mp4)、manifest/sw.js/icon-192.png。`api/feedback` POST=503（Turso 未配線・graceful・ゲーム無依存で正常）。report.js は別オリジン patch-bot(CORS *)へ POST=疎通済み。
- 任意フォローアップ: ①hiragana に Turso 配線（feedback/loop を使うなら TURSO_DATABASE_URL/AUTH_TOKEN を `hiragana` プロジェクトに設定）②patch-bot 側 `REPORT_ALLOW_ORIGIN` を本番オリジン(hiragana-red.vercel.app 等)に絞る。

## GitHub 化 + Discord 承認フロー env 仕込み（2026-06-29）
- **この repo を GitHub 化**: `n0mu-a1/hiragana`(private) を作成・push（従来 remote 無し→これで GitHub Actions も使える）。同様に **kanji-drill も `n0mu-a1/kanji-drill` 化**＝旧「kanji-drill 完全不可触」前提は解除（ユーザー承認で push）。※`Elementary-School-Kanji-Quiz`(react-example) は別物・無関係。
- **patch-bot 承認型(M2)の env を本番反映**（GHA `n0mu-a1/patch-bot`）: Discord BOT(iris流用)/OWNER_ID/CHANNEL×2(IRISサーバー #ひらがな-報告 #漢字ドリル-報告)/TARGET_REPO×2/GH_DISPATCH_TOKEN(fine-grained)/BLOB。詳細は patch-bot 側 project_summary 参照。
- **未了**（M2 本体・cron）: 承認→dispatch→修正→PR の実装と受け側 yml、triage cron 復活は未着手。env 仕込みのみ完了。
