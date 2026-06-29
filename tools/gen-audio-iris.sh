#!/usr/bin/env bash
# ====================================================================
# gen-audio-iris.sh — ひらがな読み上げ音声を「Iris」声で生成
#
# Iris ニュースプレイヤーと同じ VOICEVOX(HF Spaces) speaker=10「雨晴はう」で
# 各かなの読みを合成し、AAC(.m4a) に変換して audio/ に出力する。
# 子ども向けに少しゆっくり (speedScale=0.9)。
#
# 音作りの要点:
#  - VOICEVOX は母音の後に微小な「息」を出す。単独かなはこれが耳障りなので
#    最初の音の塊（母音）だけを残してカットする（synth_kana）。
#  - ほめ言葉は複数モーラなのでカットせず両端の無音だけ整える（synth_phrase）。
#  - 音量は loudnorm の動的ゲイン（無音区間でノイズを持ち上げる副作用あり）を使わず、
#    ピーク -1dB への固定ゲイン正規化で揃える。
# 依存: curl / ffmpeg / VOICEVOX_TTS_URL(=/Users/im/AI/Iris/.env.local)
# ====================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/audio"
SPEAKER="${VOICEVOX_SPEAKER:-10}"   # 雨晴はう ノーマル（Iris の声）
TRIM_DB="-42dB"                      # 無音/息のしきい値
mkdir -p "$OUT"

set -a; source /Users/im/AI/Iris/.env.local 2>/dev/null || true; set +a
BASE="${VOICEVOX_TTS_URL:-${VOICEVOX_URL:-}}"; BASE="${BASE%/}"
[ -n "$BASE" ] || { echo "VOICEVOX_TTS_URL not set"; exit 1; }

# VOICEVOX で合成して raw WAV(48k) を $1 に出力
voicevox() { # $1=出力wav $2=テキスト
  local out="$1" text="$2" enc
  enc="$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' "$text")"
  local q; q="$(mktemp -t irisq).json"
  curl -s -m 60 -X POST "$BASE/audio_query?speaker=$SPEAKER&text=$enc" \
    | python3 -c 'import sys,json;q=json.load(sys.stdin);q["speedScale"]=0.9;q["intonationScale"]=1.0;q["prePhonemeLength"]=0.1;q["postPhonemeLength"]=0.1;q["outputSamplingRate"]=48000;print(json.dumps(q))' \
    > "$q"
  curl -s -m 120 -X POST "$BASE/synthesis?speaker=$SPEAKER" \
    -H 'content-type: application/json' --data-binary @"$q" -o "$out"
  rm -f "$q"
}

# wav のピークを -1dB に上げる固定ゲイン(dB)を返す
peak_gain() { # $1=wav
  local p
  p="$(ffmpeg -hide_banner -i "$1" -af volumedetect -f null - 2>&1 \
       | grep -oE 'max_volume: -?[0-9.]+' | grep -oE '\-?[0-9.]+')"
  python3 -c "print(round(-1.0-($p),2))"
}

# 単独かな: 母音の塊だけ残し、息をカット → 正規化 → 末尾フェード → 前後無音
synth_kana() { # $1=出力名 $2=テキスト
  local name="$1" text="$2"
  local raw cut; raw="$(mktemp -t irisraw).wav"; cut="$(mktemp -t iriscut).wav"
  voicevox "$raw" "$text"
  # 母音終端 = リード無音後に最初に現れる無音の開始位置
  local info end endp
  info="$(ffmpeg -hide_banner -i "$raw" -af "silencedetect=noise=$TRIM_DB:d=0.03" -f null - 2>&1)"
  end="$(echo "$info" | grep -oE 'silence_start: [0-9.]+' | grep -oE '[0-9.]+' | awk '$1>0.03{print; exit}')"
  [ -n "$end" ] || end="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$raw")"
  endp="$(python3 -c "print(round($end+0.02,3))")"   # 母音減衰を20ms残す
  ffmpeg -y -loglevel error -i "$raw" \
    -af "atrim=end=${endp},silenceremove=start_periods=1:start_threshold=$TRIM_DB:detection=peak" "$cut"
  local g d fs; g="$(peak_gain "$cut")"
  d="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$cut")"
  fs="$(python3 -c "print(round(max(0.0,$d-0.04),3))")"
  ffmpeg -y -loglevel error -i "$cut" \
    -af "volume=${g}dB,afade=t=out:st=${fs}:d=0.04,adelay=120,apad=pad_dur=0.18" \
    -c:a aac -b:a 96k -movflags +faststart "$OUT/$name.m4a"
  rm -f "$raw" "$cut"
  printf "  %-10s %s\n" "$name.m4a" "$text"
}

# ほめ言葉(複数モーラ): 両端の無音だけトリム → 正規化 → 前後無音（カットしない）
synth_phrase() { # $1=出力名 $2=テキスト
  local name="$1" text="$2"
  local raw a b; raw="$(mktemp -t irisraw).wav"; a="$(mktemp -t irisa).wav"; b="$(mktemp -t irisb).wav"
  voicevox "$raw" "$text"
  ffmpeg -y -loglevel error -i "$raw" -af "silenceremove=start_periods=1:start_threshold=$TRIM_DB:detection=peak" "$a"
  ffmpeg -y -loglevel error -i "$a" -af "areverse" "$b"
  ffmpeg -y -loglevel error -i "$b" -af "silenceremove=start_periods=1:start_threshold=$TRIM_DB:detection=peak" "$a"
  ffmpeg -y -loglevel error -i "$a" -af "areverse" "$b"
  local g; g="$(peak_gain "$b")"
  ffmpeg -y -loglevel error -i "$b" \
    -af "volume=${g}dB,adelay=120,apad=pad_dur=0.20" \
    -c:a aac -b:a 96k -movflags +faststart "$OUT/$name.m4a"
  rm -f "$raw" "$a" "$b"
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
for pair in "${KANA[@]}"; do synth_kana "${pair%%:*}" "${pair#*:}"; done

echo "▶ 濁音20字・半濁音5字"
DAKU=(
  ga:が gi:ぎ gu:ぐ ge:げ go:ご
  za:ざ ji:じ zu:ず ze:ぜ zo:ぞ
  da:だ di:ぢ du:づ de:で do:ど
  ba:ば bi:び bu:ぶ be:べ bo:ぼ
  pa:ぱ pi:ぴ pu:ぷ pe:ぺ po:ぽ
)
for pair in "${DAKU[@]}"; do synth_kana "${pair%%:*}" "${pair#*:}"; done

echo "▶ ほめ言葉・再挑戦"
synth_phrase seikai      "せいかい！"
synth_phrase yoku        "よく できました"
synth_phrase hanamaru    "はなまる！"
synth_phrase sugoi       "すごい！"
synth_phrase mouichido   "もう いちど"
synth_phrase oshii       "おしい！ もう いちど"

COUNT=$(ls -1 "$OUT"/*.m4a | wc -l | tr -d ' ')
echo "✅ 生成完了: $COUNT files in $OUT"
