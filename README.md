# Niji Assistant / Prompt Sketchbook

Niji Assistant / Prompt Sketchbook は、日本語のアイデアノートを入力として、画像生成向け英語プロンプトを生成・分解・改稿するローカルWebアプリケーションです。

## 概要

本アプリは以下の機能を統合しています。

1. 日本語ノートから英語プロンプトを生成（Gemini API利用）
2. 生成結果を句単位で分解し、ラベル・効果・採否を管理
3. 修正指示を入力し、差分付きで再生成

翻訳結果の表示だけでなく、句ごとの採用判断を管理できる点を重視しています。

---

## 主な機能

- **プロジェクト管理**
  - 複数プロジェクトを保持
  - タイトル、intention（見たいもの）、日本語ノート、履歴を保存
- **プロンプト生成**
  - `POST /api/generate-prompt` で Gemini にリクエスト
  - レスポンスを `prompt_en / phrases / summary` として取得
- **句分解とラベル管理**
  - 各句にラベル（原文対応 / 翻訳補完 / 表現強化 / 解釈追加 / 分岐語 / 要確認）を付与
  - `adopted` の切り替えで句の採否を管理
- **intention寄与評価**
  - `contribution_note` と `contribution_level (high/medium/low)` を句単位で保持
  - 貢献度フィルタ表示に対応
- **改稿ワークフロー**
  - 修正指示から再生成
  - 改稿タスクで `diff`（追加/削除）を取得
- **データ保存・移行**
  - LocalStorageへ保存
  - JSONエクスポート/インポート対応
- **モバイルUI**
  - タブ切り替えとスワイプ操作に対応

---

## 技術スタック

- Node.js (ESM)
- フロントエンド: Vanilla JS / HTML / CSS
- バックエンド: `node:http` ベースの静的配信 + APIエンドポイント
- 生成AIクライアント: `@google/genai`

---

## ディレクトリ構成

```text
.
├─ app.js        # フロントエンドロジック（状態管理・UI操作・API呼び出し）
├─ index.html    # UI
├─ styles.css    # スタイル
├─ server.mjs    # 静的ファイル配信 + Gemini API呼び出し
├─ package.json
└─ README.md
```

---

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. `.env` の作成

プロジェクトルートに `.env` を作成し、以下を設定してください。

```env
GEMINI_API_KEY=your_api_key_here
PORT=3000
HOST=0.0.0.0
GEMINI_MODEL=gemini-3.5-flash
```

補足: `GEMINI_API_KEY` はリクエストヘッダー `x-gemini-api-key` で上書き可能です。

### 3. 起動

```bash
npm start
```

ブラウザで `http://localhost:3000` にアクセスします。

---

## API仕様（概要）

### `POST /api/generate-prompt`

入力はJSONです。`task` に応じてレスポンスの構造が変化します。

- 通常生成: `prompt_en`, `phrases`, `summary`
- 改稿タスク（`task === "niji_prompt_revision"`）: 上記 + `diff`

`phrases[]` の主な要素:

- `phrase`: 英語句
- `ja`: 和訳/対応
- `labels[]`: 分類ラベル
- `effect`: 効果説明
- `note`: 補足
- `alternatives[]`: 代替候補
- `adopted`: 採用フラグ
- `contribution_note`: intention寄与メモ
- `contribution_level`: `high | medium | low`

---

## 開発メモ

- `npm run build`: 現状は no-op
- `npm run lint`: 現状は no-op
- 実運用に向けた追加候補
  - 入力バリデーション強化
  - エラーハンドリングの整理（4xx/5xx）
  - テスト追加（APIスキーマ、状態遷移、UI操作）
  - レート制限、監査ログ

---

## 運用方針

本アプリは、生成結果の文面品質だけでなく、採用判断の再現性を重視します。

推奨フロー:

1. `intention` を先に定義
2. 句ごとの寄与を確認
3. `adopted` と修正指示で反復調整

この手順により、プロンプト変更の理由を追跡しやすくなります。
