# ひらがな おとあて

未就学児向けのオフラインPWAです。音を聞いて、3枚のひらがなカードから同じ音の字を選びます。

## 起動

```sh
cd /Users/im/AI/hiragana
python3 -m http.server 5173
```

ブラウザで `http://localhost:5173/` を開きます。iPhone では同じネットワークから Mac のローカルIPへアクセスし、Safari の「ホーム画面に追加」で PWA として起動できます。

## 構成

| ファイル | 役割 |
|---|---|
| `index.html`, `styles.css` | 画面骨格と明色こどもテーマ |
| `data/kana.js` | 46かなの真実テーブル |
| `game-config.js` | loop が値だけ調整する設定 |
| `game.js` | iOS音声unlock、3択出題、花丸、per-kana履歴 |
| `feedback.js` | localStorage控えと `/api/feedback` 送信キュー |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | オフラインPWA資産 |
| `api/feedback.js`, `db/schema.sql` | Turso 収集レイヤ |
| `loop/` | 収集→分類→決定→gate→patch→verify |

## ループ

ローカルの seed でドライラン:

```sh
npm run loop:dry
```

本番収集には Turso/Vercel/GitHub Actions の provision と secrets 設定が必要です。`gate.mjs` は `game-config.js` の小さな安全変更だけを通し、`rows.*` や選択肢数などは人間承認へ落とします。
