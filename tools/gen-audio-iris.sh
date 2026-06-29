#!/usr/bin/env bash
# ====================================================================
# gen-audio-iris.sh — ひらがな読み上げ音声を「Iris」声で生成
#
# Iris ニュースプレイヤーと同じ VOICEVOX(HF Spaces) speaker=10「雨晴はう」で
# 各かなの読みを合成し、AAC(.m4a) に変換して audio/ に出力する。
# 子ども向けに少しゆっくり (speedScale=0.9)、アタック欠け防止に前後無音を付与。
# 依存: curl / ffmpeg / VOICEVOX_TTS_URL(=/Users/im/AI/Iris/.env.local)
# ====================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/audio"
SPEAKER="${VOICEVOX_SPEAKER:-10}"   # 雨晴はう ノーマル（Iris の声）
mkdir -p "$OUT"

set -a; source /Users/im/AI/Iris/.env.local 2>/dev/null || true; set +a
BASE="${VOICEVOX_TTS_URL:-${VOICEVOX_URL:-}}"; BASE="${BASE%/}"
[ -n "$BASE" ] || { echo "VOICEVOX_TTS_URL not set"; exit 1; }

synth() { # $1=出力名(拡張子なし) $2=読ませるテキスト
  local name="$1" text="$2"
  local tmpq tmpwav
  tmpq="$(mktemp -t irisq).json"; tmpwav="$(mktemp -t iriswav).wav"
  local enc; enc="$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' "$text")"
  # audio_query(POST・paramsはURL) → 子ども向けに整音 → synthesis
  curl -s -m 60 -X POST "$BASE/audio_query?speaker=$SPEAKER&text=$enc" \
    | python3 -c 'import sys,json;q=json.load(sys.stdin);q["speedScale"]=0.9;q["intonationScale"]=1.0;q["prePhonemeLength"]=0.1;q["postPhonemeLength"]=0.2;q["outputSamplingRate"]=48000;print(json.dumps(q))' \
    > "$tmpq"
  curl -s -m 120 -X POST "$BASE/synthesis?speaker=$SPEAKER" \
    -H 'content-type: application/json' --data-binary @"$tmpq" -o "$tmpwav"
  ffmpeg -y -loglevel error -i "$tmpwav" \
    -af "adelay=120|120,apad=pad_dur=0.22" \
    -c:a aac -b:a 64k -movflags +faststart "$OUT/$name.m4a"
  rm -f "$tmpq" "$tmpwav"
  printf "  %-10s %s\n" "$name.m4a" "$text"
}

echo "▶ かな46字 → $OUT (speaker=$SPEAKER)"
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
for pair in "${KANA[@]}"; do synth "${pair%%:*}" "${pair#*:}"; done

echo "▶ 濁音20字・半濁音5字"
DAKU=(
  ga:が gi:ぎ gu:ぐ ge:げ go:ご
  za:ざ ji:じ zu:ず ze:ぜ zo:ぞ
  da:だ di:ぢ du:づ de:で do:ど
  ba:ば bi:び bu:ぶ be:べ bo:ぼ
  pa:ぱ pi:ぴ pu:ぷ pe:ぺ po:ぽ
)
for pair in "${DAKU[@]}"; do synth "${pair%%:*}" "${pair#*:}"; done

echo "▶ ほめ言葉・再挑戦"
synth seikai      "せいかい！"
synth yoku        "よく できました"
synth hanamaru    "はなまる！"
synth sugoi       "すごい！"
synth mouichido   "もう いちど"
synth oshii       "おしい！ もう いちど"

COUNT=$(ls -1 "$OUT"/*.m4a | wc -l | tr -d ' ')
echo "✅ 生成完了: $COUNT files in $OUT"
