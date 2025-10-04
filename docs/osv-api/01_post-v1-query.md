# POST /v1/query

## 概要
単一のパッケージまたはコミットハッシュに対する脆弱性情報を検索するAPIです。

## エンドポイント
```
POST https://api.osv.dev/v1/query
```

## パラメータ

| パラメータ | 型 | 必須 | 説明 |
|-----------|---|------|------|
| commit | string | - | 検索対象のコミットハッシュ。指定した場合、versionは設定できません |
| version | string | - | 検索対象のバージョン文字列。ファジーマッチングが行われます |
| package | object | - | 検索対象パッケージ。commitが指定された場合はオプション |
| page_token | string | - | ページネーション用トークン |

### package オブジェクト

| パラメータ | 型 | 必須 | 説明 |
|-----------|---|------|------|
| name | string | ※ | パッケージ名。ecosystemと併用時は必須 |
| ecosystem | string | ※ | エコシステム名 (例: PyPI, npm, RubyGems) |
| purl | string | ※ | Package URL。name/ecosystemと排他的 |

### バージョン指定ルール

**重要**: 以下のルールに従う必要があります
- `version` フィールドまたは versioned purl (`pkg:...@<version>`) のどちらか一方のみ使用
- 両方を指定すると 400 Bad Request エラーになります

#### 有効な例
```json
{ "package": { "name": "jinja2", "ecosystem": "PyPI" }, "version": "3.1.4" }
{ "package": { "purl": "pkg:pypi/jinja2@3.1.4" } }
{ "package": { "purl": "pkg:pypi/jinja2" }, "version": "3.1.4" }
```

#### 無効な例（400エラー）
```json
{ "package": { "purl": "pkg:pypi/jinja2@3.1.4" }, "version": "3.1.4" }
```

## リクエスト例

### パッケージとバージョンによる検索
```bash
curl -d '{"package": {"name": "nokogiri", "ecosystem": "RubyGems"}, "version": "1.18.2"}' \
     "https://api.osv.dev/v1/query"
```

### コミットハッシュによる検索
```bash
curl -d '{"commit": "6879efc2c1596d11a6a6ad296f80063b558d5e0f"}' \
     "https://api.osv.dev/v1/query"
```

### Git タグによる検索
```bash
curl -d '{"package": {"name": "https://github.com/curl/curl.git", "ecosystem": "GIT"}, "version": "8.5.0"}' \
     "https://api.osv.dev/v1/query"
```

## レスポンス形式

### 200 OK
```json
{
  "vulns": [
    {
      "id": "OSV-2020-744",
      "summary": "Heap-double-free in mrb_default_allocf",
      "details": "詳細な説明...",
      "modified": "2022-04-13T03:04:39.780694Z",
      "published": "2020-07-04T00:00:01.948828Z",
      "references": [
        {
          "type": "REPORT",
          "url": "https://bugs.chromium.org/p/oss-fuzz/issues/detail?id=23801"
        }
      ],
      "affected": [
        {
          "package": {
            "name": "mruby",
            "ecosystem": "OSS-Fuzz",
            "purl": "pkg:generic/mruby"
          },
          "ranges": [
            {
              "type": "GIT",
              "repo": "https://github.com/mruby/mruby",
              "events": [
                {
                  "introduced": "9cdf439db52b66447b4e37c61179d54fad6c8f33"
                },
                {
                  "fixed": "97319697c8f9f6ff27b32589947e1918e3015503"
                }
              ]
            }
          ],
          "versions": ["2.1.2", "2.1.2-rc", "2.1.2-rc2"],
          "ecosystem_specific": {
            "severity": "HIGH"
          }
        }
      ],
      "schema_version": "1.4.0"
    }
  ]
}
```

## ページネーション

### 発生条件
- 1,000件を超える脆弱性が該当する場合
- クエリが20秒を超える場合

### ページネーション対応
```json
{
  "vulns": [...],
  "next_page_token": "base64文字列"
}
```

### 次ページの取得
```bash
curl -d '{"package": {...}, "version": "...", "page_token": "取得したnext_page_token"}' \
     "https://api.osv.dev/v1/query"
```

## 制限事項

### レスポンスサイズ制限
- HTTP/1.1: 32MiB
- HTTP/2: 制限なし（推奨）

### ケースセンシティブ
APIリクエストは大文字小文字を区別します。正しいケースを使用してください。
- 例: `PyPI` (正) ではなく `pypi` (誤)

## エラーレスポンス

### 400 Bad Request
- バージョン指定ルール違反
- 無効なパラメータ組み合わせ

### 例
```json
{
  "error": "version specified in both package.purl and version field"
}
```