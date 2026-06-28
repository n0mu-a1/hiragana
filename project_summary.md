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
- `audio/*.m4a` — **52ファイル生成・検証済み**（46かな + ほめ/再挑戦6: seikai/yoku/hanamaru/sugoi/mouichido/oshii）。全長0.30–1.9s、合計**288K**（オフラインキャッシュに十分軽量）。
- 設計ワークフロー `hiragana-design`（run wf_7f461b24-973）を起動：アーキ/教育UX/config/loop結合の4設計 → 検証済みかなテーブル → codex実装ブリーフを生成中。

## 未完了タスク
- [ ] 設計ワークフロー完了 → 実装ブリーフ受領
- [ ] codex へ実装委譲（index.html/styles.css/game.js/game-config.js/data/kana.js/feedback.js/sw.js/manifest/icon + api/loop/db/.github 差分）
- [ ] 受け入れ確認（オフライン起動・音・3択判定・花丸/再挑戦・PWA・gate green・loop:dry）
- [ ] reflex-lab との結合

## 編集したファイル一覧
- tools/gen-audio.sh（新規）
- audio/*.m4a（生成・52）
- project_summary.md（本ファイル）

## 音声マニフェスト（コード/SWはこの名前に束縛）
かな: a i u e o ka ki ku ke ko sa shi su se so ta chi tsu te to na ni nu ne no ha hi fu he ho ma mi mu me mo ya yu yo ra ri ru re ro wa wo n
ほめ/再挑戦: seikai yoku hanamaru sugoi mouichido oshii
