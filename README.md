# File Browser

ファイル・フォルダーを閲覧・選択できる Web ベースのファイルブラウザです。  
QuickLook 機能で画像・動画・音声・PDF・Markdown・SVG・Office ファイルをプレビューできます。

## 必要なもの

| ツール | 用途 | 必須 |
|--------|------|------|
| **Node.js** (v18+) | フロントエンド | ✅ |
| **Python** (3.10+) | バックエンド API | ✅ |
| **ffmpeg** | 動画サムネイル生成 | 任意 |
| **LibreOffice** | Office 系ファイルのプレビュー | 任意 |

## インストール手順

### 1. リポジトリをクローン / 展開

```bash
cd fileDialog
```

### 2. バックエンド (Python / FastAPI)

```bash
pip install -r requirements.txt
```

### 3. フロントエンド (React / Vite)

```bash
cd file-browser
npm install
```

### 4. 外部ツール (任意)

動画サムネイルを表示したい場合:

```powershell
winget install Gyan.FFmpeg
```

Office ファイル (pptx / xlsx / docx) をプレビューしたい場合:

```powershell
winget install TheDocumentFoundation.LibreOffice
```

> インストール後、ターミナルを再起動して PATH を反映してください。

## 起動方法

### バックエンド

```bash
uvicorn main:app --reload --port 8000
```

### フロントエンド

```bash
cd file-browser
npm run dev
```

ブラウザで `http://localhost:5173` を開いてください。

## プロジェクト構成

```
fileDialog/
├── main.py              # FastAPI バックエンド
├── requirements.txt     # Python 依存パッケージ
├── README.md
└── file-browser/        # React フロントエンド
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── App.jsx      # メインコンポーネント
        └── main.jsx
```
