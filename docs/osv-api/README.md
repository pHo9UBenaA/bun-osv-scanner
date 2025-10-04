# OSV.dev API Documentation

OSV.dev (Open Source Vulnerability database) API の詳細仕様をまとめたドキュメントです。

## 概要

OSV.dev は Google が運営するオープンソースソフトウェアの脆弱性データベースです。
RESTful API を通じて脆弱性情報を検索・取得することができます。

## API エンドポイント一覧

### 安定版 API
- [POST /v1/query](./01_post-v1-query.md) - 単一パッケージまたはコミットハッシュによる脆弱性検索
- [POST /v1/querybatch](./02_post-v1-querybatch.md) - 複数パッケージの一括脆弱性検索
- [GET /v1/vulns/{id}](./03_get-v1-vulns.md) - 脆弱性IDによる詳細情報取得

### 実験版 API
- [GET /v1experimental/importfindings](./04_get-v1experimental-importfindings.md) - インポート失敗レコードの取得
- [POST /v1experimental/determineversion](./05_post-v1experimental-determineversion.md) - C/C++ライブラリのバージョン特定

## 基本的な使用方法

### 1. パッケージの脆弱性を検索

```bash
curl -d '{"version": "2.4.1", "package": {"name": "jinja2", "ecosystem": "PyPI"}}' \
     "https://api.osv.dev/v1/query"
```

### 2. コミットハッシュによる検索

```bash
curl -d '{"commit": "6879efc2c1596d11a6a6ad296f80063b558d5e0f"}' \
     "https://api.osv.dev/v1/query"
```

### 3. 脆弱性詳細の取得

```bash
curl "https://api.osv.dev/v1/vulns/OSV-2020-111"
```

## 重要な注意事項

### ケースセンシティブ
- API リクエストは大文字小文字を区別します
- 例: `PyPI` (正) vs `pypi` (誤)

### レート制限
- 大量のリクエストを送信する場合は適切な間隔を設けてください
- バッチAPIの使用を検討してください

### バージョン指定ルール
- `version` フィールドと versioned purl の同時使用は禁止されています
- 片方のみを使用してください

## 参考リンク

- [OSV.dev 公式サイト](https://google.github.io/osv.dev/)
- [API Quickstart](https://google.github.io/osv.dev/quickstart/)
- [OSV Schema](https://ossf.github.io/osv-schema/)
- [OSV-Scanner](https://google.github.io/osv-scanner/)