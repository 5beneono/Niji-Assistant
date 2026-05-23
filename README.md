# Niji Assistant / Prompt Sketchbook

日本語の「アイデアノート」から、**にじ系画像生成向けの英語プロンプト**を作り、句ごとに解体・採否管理できるローカルWebアプリです。

> 便利ツールとしてではなく、問いの編集装置として使う。
> それがこのリポジトリの芯です。

---

## これは何か

`Prompt Sketchbook` は次の3つを一体化したアプリです。

1. 日本語ノートを英語プロンプトへ変換（Gemini API利用）
2. 生成された英文を句単位で分解し、ラベル・効果・採否を可視化
3. 修正指示を与えて、差分付きで次バージョンを生成

単なる翻訳よりも、**「どの句が、見たい絵にどう効いているか」**の判断を支援します。

---

## 主な機能

- **プロジェクト管理**
  - 複数テーマ（制作テーマ）を保持
  - タイトル、見たいもの（intention）、日本語ノート、履歴を保存
- **プロンプト生成**
  - `/api/generate-prompt` で Gemini にJSONスキーマ付きで依頼
  - 結果を `prompt_en / phrases / summary` 形式で取得
- **句分解とラベル付け**
  - 各句にラベル（原文対応 / 翻訳補完 / 表現強化 / 解釈追加 / 分岐語 / 要確認）
  - `adopted` のON/OFFで採否切り替え
- **意図（見たいもの）ベース評価**
  - `contribution_note` と `contribution_level(high/medium/low)` を句ごとに付与
  - 「貢献度低」フィルタ表示に対応
- **改稿ワークフロー**
  - 修正指示テキストから再生成
  - 追加・削除差分（diff）を返すモードあり
- **ローカル保存 / 入出力**
  - LocalStorage保存
  - JSONエクスポート/インポート
- **モバイルUI**
  - タブ切り替え + スワイプ操作

---

## 技術スタック

- Node.js (ESM)
- フロントエンド: Vanilla JS + HTML + CSS
- バックエンド: `node:http` のシンプルな静的配信 + APIサーバー
- 生成AI: `@google/genai`

---

## ディレクトリ構成

```text
.
├─ app.js        # フロントエンドロジック（状態管理・UI操作・API呼び出し）
├─ index.html    # UI本体
├─ styles.css    # スタイル
├─ server.mjs    # 静的配信 + Gemini APIプロキシ
├─ package.json
└─ README.md
```

---

## セットアップ

### 1) 依存関係インストール

```bash
npm install
```

### 2) `.env` を作成

プロジェクトルートに `.env` を作り、最低限以下を設定してください。

```env
GEMINI_API_KEY=your_api_key_here
PORT=3000
HOST=0.0.0.0
GEMINI_MODEL=gemini-3.5-flash
```

> 補足: APIキーはリクエストヘッダー `x-gemini-api-key` でも上書き可能です。

### 3) 起動

```bash
npm start
```

ブラウザで `http://localhost:3000` を開きます。

---

## API仕様（概要）

### `POST /api/generate-prompt`

入力はJSON。`task` に応じてレスポンス形式が変わります。

- 通常生成: `prompt_en`, `phrases`, `summary`
- 改稿系タスク（`task === "niji_prompt_revision"`）: 上記 + `diff`

`phrases[]` の主な要素:

- `phrase`: 英語句
- `ja`: 和訳/対応
- `labels[]`: 分類ラベル
- `effect`: 視覚効果の説明
- `note`: 補足
- `alternatives[]`: 言い換え候補
- `adopted`: 採用フラグ
- `contribution_note`: 意図への寄与メモ
- `contribution_level`: `high|medium|low`

---

## 開発メモ

- `npm run build` は実体ビルドなし（ダミー）
- `npm run lint` も現状ダミー
- 実運用に向けては以下の追加を推奨
  - 入力バリデーション強化
  - エラー分類（4xx/5xx）とUIメッセージ整備
  - テスト（APIスキーマ、状態遷移、UI操作）
  - レート制限 / 監査ログ

---

## 視点の提案

このアプリの価値は「英語化」そのものではなく、
**“採用する語彙の理由を外在化できること”** にあります。

もし「ねおのならこう考えそう」と示唆するなら、
- 良いプロンプトを作る前に、
- **何を残し、何を捨てるかの判断軸（意図）を先に固定する**

この順序の反転が、再現性を作ります。
