# GET /v1experimental/importfindings

## 概要
**実験版API** - OSV.dev のデータ品質基準を満たさず、インポートに失敗したレコードの情報を取得するAPIです。
主にOSVレコード提供者（ホームデータベース運営者）向けの機能です。

## ⚠️ 実験版API
このAPIエンドポイントは実験版です。
- 仕様が変更される可能性があります
- フィードバックを歓迎します：[GitHub Issues](https://github.com/google/osv.dev/issues/new)

## エンドポイント
```
GET https://api.osv.dev/v1experimental/importfindings/{source}
```

## 目的
OSVレコード提供者が、自身が公開したレコードのうち [OSV.dev の品質基準](https://google.github.io/osv.dev/data_quality.html) を満たさず、インポートされなかったレコードを機械的に確認できるようにすることです。

## パラメータ

### パスパラメータ
| パラメータ | 型 | 必須 | 説明 |
|-----------|---|------|------|
| source | string | ○ | データソース名（source.yamlのname値と同じ） |

### ケースセンシティブ
APIリクエストは大文字小文字を区別します。
- 例: `ghsa` (正) ではなく `GHSA` (誤)

### データソース確認方法
`source` パラメータの有効な値は [source.yaml](https://github.com/google/osv.dev/blob/master/source.yaml) の `name` フィールドで確認できます。

## リクエスト例

```bash
curl "https://api.osv.dev/v1experimental/importfindings/example"
```

## レスポンス形式

### 200 OK
```json
{
  "invalid_records": [
    {
      "bug_id": "EX-1234",
      "source": "example", 
      "findings": [
        "IMPORT_FINDING_TYPE_INVALID_JSON"
      ],
      "first_seen": "2024-12-19T15:18:00.945105Z",
      "last_attempt": "2024-12-19T15:18:00.945105Z"
    }
  ]
}
```

## レスポンスフィールド詳細

### invalid_records配列
| フィールド | 型 | 説明 |
|-----------|---|------|
| bug_id | string | 失敗したレコードのID |
| source | string | データソース名 |
| findings | array | インポート失敗の理由リスト |
| first_seen | string | 最初に失敗が検出された日時（ISO 8601形式） |
| last_attempt | string | 最後にインポートを試行した日時（ISO 8601形式） |

### インポート失敗タイプ例
- `IMPORT_FINDING_TYPE_INVALID_JSON` - 無効なJSON形式
- `IMPORT_FINDING_TYPE_MISSING_FIELD` - 必須フィールドの欠落
- `IMPORT_FINDING_TYPE_INVALID_SCHEMA` - スキーマ違反
- その他の品質基準違反

## 対象ユーザー

### 主要対象
- OSVレコード提供者
- ホームデータベース運営者
- OSV.dev にデータを提供している組織

### 使用場面
- データ品質の監視
- インポート失敗の原因調査
- レコード修正の優先順位付け

## データ品質基準

OSV.dev のデータ品質基準の詳細は以下を参照してください：
- [Properties of a High Quality OSV Record](https://google.github.io/osv.dev/data_quality.html)

## エラーレスポンス

### 404 Not Found
指定されたソースが存在しない場合：

```json
{
  "error": "Source not found"
}
```

### 400 Bad Request
無効なソース名形式の場合：

```json
{
  "error": "Invalid source name format"
}
```

## フィードバック

このAPIは実験版のため、以下の情報をフィードバックとして歓迎します：
- 使用時の課題や問題点
- 機能改善の提案
- 使い勝手に関するコメント
- その他の改善アイデア

フィードバックは [GitHub Issues](https://github.com/google/osv.dev/issues/new) にお寄せください。

## 関連リンク

- [OSV.dev データ品質基準](https://google.github.io/osv.dev/data_quality.html)
- [source.yaml](https://github.com/google/osv.dev/blob/master/source.yaml)
- [OSV Schema](https://ossf.github.io/osv-schema/)
- [GitHub Issues](https://github.com/google/osv.dev/issues)

## 注意事項

### 実験版の制限
- 将来的に仕様が変更される可能性があります
- 本番環境での重要な用途では使用を控えることを推奨します
- 定期的にドキュメントの更新を確認してください

### アクセス頻度
データ品質監視目的での使用のため、過度に頻繁なアクセスは避けてください。