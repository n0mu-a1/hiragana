#!/usr/bin/env bash
# ====================================================================
# gen-audio.sh — ひらがな読み上げ音声をローカル生成（完全オフライン・無料）
#
# macOS の `say`(Kyoko) で各かなの読みを合成し、AAC(.m4a) に変換して
# audio/ に出力する。iPhone Safari でそのまま再生できる軽量ファイル。
#   - 子ども向けに少しゆっくり (-r 105)
#   - AAC のエンコード遅延でアタックが切れないよう先頭120ms/末尾220msの無音を付与
# 依存: say (macOS標準) / ffmpeg。再生成しても結果は決定的。
# ====================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/audio"
VOICE="Kyoko"
RATE=105
mkdir -p "$OUT"

synth() { # $1=出力名(拡張子なし) $2=読ませるテキスト
  local name="$1" text="$2"
  local tmp; tmp="$(mktemp -t hira).aiff"
  say -v "$VOICE" -r "$RATE" -o "$tmp" "$text"
  ffmpeg -y -loglevel error -i "$tmp" \
    -af "adelay=120|120,apad=pad_dur=0.22" \
    -c:a aac -b:a 64k -movflags +faststart "$OUT/$name.m4a"
  rm -f "$tmp"
  printf "  %-10s %s\n" "$name.m4a" "$text"
}

echo "▶ かな46字 → $OUT"
# 行ごと（あ行〜わ行）。romaji:kana
KANA=(
  a:あ i:い u:う e:え o:お
  ka:か ki:き ku:く ke:け ko:こ
  sa:さ shi:し su:す se:せ so:そ
  ta:た chi:ち tsu:つ te:て to:と
  na:な ni:に nu:ぬ ne:ね no:の
  ha:は hi:ひ fu:ふ he:へ ho:ほ
  ma:ま mi:み mu:む me:め mo:も
  ya:や yu:ゆ yo:よ
  ra:ら ri:り ru:る re:れ ro:ろ
  wa:わ wo:を n:ん
)
for pair in "${KANA[@]}"; do
  synth "${pair%%:*}" "${pair#*:}"
done

echo "▶ ほめ言葉・再挑戦"
synth seikai      "せいかい！"
synth yoku        "よく できました"
synth hanamaru    "はなまる！"
synth sugoi       "すごい！"
synth mouichido   "もう いちど"
synth oshii       "おしい！ もう いちど"

COUNT=$(ls -1 "$OUT"/*.m4a | wc -l | tr -d ' ')
echo "✅ 生成完了: $COUNT files in $OUT"
