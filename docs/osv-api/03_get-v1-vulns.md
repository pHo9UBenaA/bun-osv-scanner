# GET /v1/vulns/{id}

## 概要
指定された脆弱性IDに対応する詳細な脆弱性情報を取得するAPIです。

## エンドポイント
```
GET https://api.osv.dev/v1/vulns/{id}
```

## パラメータ

### パスパラメータ
| パラメータ | 型 | 必須 | 説明 |
|-----------|---|------|------|
| id | string | ○ | 脆弱性ID（例: OSV-2020-111, GHSA-xxxx-xxxx-xxxx） |

### ケースセンシティブ
APIリクエストは大文字小文字を区別します。
- 例: `GHSA` (正) ではなく `ghsa` (誤)

## リクエスト例

```bash
curl "https://api.osv.dev/v1/vulns/OSV-2020-111"
```

## レスポンス形式

### 200 OK
```json
{
  "id": "OSV-2020-111",
  "summary": "Heap-use-after-free in int std::__1::__cxx_atomic_fetch_sub<int>",
  "details": "OSS-Fuzz report: https://bugs.chromium.org/p/oss-fuzz/issues/detail?id=21604\n\n```\nCrash type: Heap-use-after-free WRITE 4\nCrash state:\nint std::__1::__cxx_atomic_fetch_sub<int>\nstd::__1::__atomic_base<int, true>::operator--\nObject::free\n```\n",
  "modified": "2022-04-13T03:04:37.331327Z",
  "published": "2020-06-24T01:51:14.570467Z",
  "references": [
    {
      "type": "REPORT",
      "url": "https://bugs.chromium.org/p/oss-fuzz/issues/detail?id=21604"
    }
  ],
  "affected": [
    {
      "package": {
        "name": "poppler",
        "ecosystem": "OSS-Fuzz",
        "purl": "pkg:generic/poppler"
      },
      "ranges": [
        {
          "type": "GIT",
          "repo": "https://anongit.freedesktop.org/git/poppler/poppler.git",
          "events": [
            {
              "introduced": "e4badf4d745b8e8f9a0a25b6c3cc97fbadbbb499"
            },
            {
              "fixed": "155f73bdd261622323491df4aebb840cde8bfee1"
            }
          ]
        }
      ],
      "ecosystem_specific": {
        "severity": "HIGH"
      },
      "database_specific": {
        "source": "https://github.com/google/oss-fuzz-vulns/blob/main/vulns/poppler/OSV-2020-111.yaml"
      }
    }
  ],
  "schema_version": "1.4.0"
}
```

## レスポンスフィールド詳細

### 基本情報
| フィールド | 型 | 説明 |
|-----------|---|------|
| id | string | 脆弱性の一意識別子 |
| summary | string | 脆弱性の概要 |
| details | string | 詳細な説明（Markdown形式） |
| modified | string | 最終更新日時（ISO 8601形式） |
| published | string | 公開日時（ISO 8601形式） |
| schema_version | string | OSVスキーマのバージョン |

### references配列
| フィールド | 型 | 説明 |
|-----------|---|------|
| type | string | 参照タイプ（REPORT, ADVISORY, FIX等） |
| url | string | 参照先URL |

### affected配列
影響を受けるパッケージの詳細情報：

#### package オブジェクト
| フィールド | 型 | 説明 |
|-----------|---|------|
| name | string | パッケージ名 |
| ecosystem | string | エコシステム |
| purl | string | Package URL |

#### ranges配列
| フィールド | 型 | 説明 |
|-----------|---|------|
| type | string | バージョン範囲のタイプ（GIT, SEMVER等） |
| repo | string | リポジトリURL（GITタイプの場合） |
| events | array | 影響範囲のイベント（introduced, fixed等） |

#### その他
| フィールド | 型 | 説明 |
|-----------|---|------|
| versions | array | 影響を受ける具体的なバージョンリスト |
| ecosystem_specific | object | エコシステム固有の情報（重要度等） |
| database_specific | object | データベース固有の情報 |

## 使用場面

### 詳細情報の取得
[POST /v1/query](./01_post-v1-query.md) や [POST /v1/querybatch](./02_post-v1-querybatch.md) で取得した脆弱性IDに対して、詳細情報を取得する際に使用します。

### ワークフロー例
1. `POST /v1/querybatch` で依存関係を一括スキャン
2. 脆弱性IDリストを取得
3. `GET /v1/vulns/{id}` で各脆弱性の詳細情報を取得
4. 重要度や修正情報を確認

## エラーレスポンス

### 404 Not Found
指定された脆弱性IDが存在しない場合：

```json
{
  "error": "Vulnerability not found"
}
```

### 400 Bad Request
無効な脆弱性ID形式の場合：

```json
{
  "error": "Invalid vulnerability ID format"
}
```

## 関連API

- [POST /v1/query](./01_post-v1-query.md) - 単一パッケージの脆弱性検索
- [POST /v1/querybatch](./02_post-v1-querybatch.md) - 複数パッケージの一括検索

## 注意事項

### キャッシュ
脆弱性情報は定期的に更新されるため、キャッシュする場合は適切な更新頻度を設定してください。

### レート制限
大量の脆弱性詳細を取得する場合は、適切な間隔を設けてリクエストを送信してください。