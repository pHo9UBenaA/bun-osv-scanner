# POST /v1/querybatch

## 概要
複数のパッケージまたはコミットハッシュに対する脆弱性情報を一括で検索するAPIです。
レスポンスには脆弱性IDと更新日時のみが含まれ、詳細情報は含まれません。

## エンドポイント
```
POST https://api.osv.dev/v1/querybatch
```

## パラメータ

### リクエストボディ
```json
{
  "queries": [
    {
      "commit": "string",
      "version": "string", 
      "package": {
        "name": "string",
        "ecosystem": "string",
        "purl": "string"
      },
      "page_token": "string"
    }
  ]
}
```

各クエリアイテムは [POST /v1/query](./01_post-v1-query.md) と同じパラメータルールに従います。

### バージョン指定ルール
- 各クエリアイテムは `/v1/query` と同じルールに従う必要があります
- `version` または versioned purl のどちらか一方のみ使用
- 両方を指定すると 400 Bad Request エラーになります

## リクエスト例

```bash
cat <<EOF | curl -d @- "https://api.osv.dev/v1/querybatch"
{
  "queries": [
    {
      "package": {
        "purl": "pkg:pypi/mlflow@0.4.0"
      }
    },
    {
      "commit": "6879efc2c1596d11a6a6ad296f80063b558d5e0f"
    },
    {
      "package": {
        "ecosystem": "PyPI",
        "name": "jinja2"
      },
      "version": "2.4.1"
    }
  ]
}
EOF
```

## レスポンス形式

### 200 OK
```json
{
  "results": [
    {
      "vulns": [
        {
          "id": "GHSA-vqj2-4v8m-8vrq",
          "modified": "2023-03-14T05:47:39.989396Z"
        },
        {
          "id": "GHSA-wp72-7hj9-5265", 
          "modified": "2023-03-24T22:28:29.389429Z"
        }
      ]
    },
    {
      "vulns": [
        {
          "id": "OSV-2020-484",
          "modified": "2022-04-13T03:04:32.842142Z"
        }
      ]
    },
    {
      "vulns": [
        {
          "id": "GHSA-462w-v97r-4m45",
          "modified": "2023-03-10T05:23:41.874079Z"
        }
      ]
    }
  ]
}
```

## 特徴

### レスポンス順序保証
レスポンスの順序は入力クエリの順序と一致することが保証されています。

### 軽量レスポンス
脆弱性の詳細情報は含まれず、IDと更新日時のみが返されます。
詳細情報が必要な場合は [GET /v1/vulns/{id}](./03_get-v1-vulns.md) を使用してください。

## ページネーション

### 発生条件
以下の条件のいずれかが満たされた場合にページネーションが発生します：
- 個別クエリで1,000件を超える脆弱性が該当
- クエリセット全体で3,000件を超える脆弱性が該当

### ページネーション対応レスポンス
```json
{
  "results": [
    {
      "vulns": [...],
      "next_page_token": "query1のトークン"
    },
    {
      "vulns": [...],
      "next_page_token": "query2のトークン"  
    },
    {
      "vulns": [...]
      // next_page_tokenなし = 完了
    }
  ]
}
```

### 次ページの取得
`next_page_token` が返されたクエリのみ次のリクエストに含めます：

```bash
cat <<EOF | curl -d @- "https://api.osv.dev/v1/querybatch"
{
  "queries": [
    {
      "package": {...},
      "version": "...",
      "page_token": "query1のnext_page_token"
    },
    {
      "package": {...}, 
      "version": "...",
      "page_token": "query2のnext_page_token"
    }
  ]
}
EOF
```

## 使用場面

### 適用場面
- 依存関係管理ツール
- CI/CDパイプラインでの一括スキャン
- SBOM（Software Bill of Materials）の脆弱性チェック

### 利点
- 複数パッケージを効率的に検索
- ネットワーク往復回数の削減
- レスポンス順序の保証

## 制限事項

### ケースセンシティブ
APIリクエストは大文字小文字を区別します。

### バッチサイズ
一度に送信できるクエリ数に制限がある可能性があります。
大量のクエリを送信する場合は適切に分割してください。

## エラーレスポンス

### 400 Bad Request
- バージョン指定ルール違反
- 無効なクエリパラメータ

### エラー例
```json
{
  "error": "version specified in both package.purl and version field"
}
```