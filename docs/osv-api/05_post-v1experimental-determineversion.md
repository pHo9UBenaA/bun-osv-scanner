# POST /v1experimental/determineversion

## 概要
**実験版API** - C/C++ライブラリのソースコードハッシュを元に、最も近いアップストリームライブラリとバージョンを特定するAPIです。

## ⚠️ 実験版API
このAPIエンドポイントは実験版です。
- 仕様が変更される可能性があります
- フィードバックを歓迎します：[GitHub Issues](https://github.com/google/osv.dev/issues/new)

## エンドポイント
```
POST https://api.osv.dev/v1experimental/determineversion
```

## 目的
C/C++エコシステムには集中化されたパッケージマネージャーが存在しないため、パッケージとバージョンの特定が困難です。
このAPIは、ソースコードのハッシュ値を使用してライブラリのバージョンを特定し、その後の脆弱性検索を可能にします。

## 対応ライブラリ
現在対応しているのは [OSS-Fuzz](https://google.github.io/oss-fuzz/) プロジェクトに統合されているC/C++プロジェクトのみです。

### 対応状況の確認方法

1. **全対応パッケージリスト**: [https://storage.googleapis.com/osv-indexer-configs](https://storage.googleapis.com/osv-indexer-configs)

2. **特定パッケージの確認**:
   ```
   https://storage.googleapis.com/osv-indexer-configs/generated/{package-name}.yaml
   ```
   例: [protobuf.yaml](https://storage.googleapis.com/osv-indexer-configs/generated/protobuf.yaml)

3. **gsutil での一括取得**:
   ```bash
   gsutil -m cp -r gs://osv-indexer-configs/ .
   ```

## パラメータ

### リクエストボディ
```json
{
  "name": "string",
  "file_hashes": [
    {
      "hash": "base64エンコードされたMD5ハッシュ",
      "file_path": "string"
    }
  ]
}
```

| パラメータ | 型 | 必須 | 説明 |
|-----------|---|------|------|
| name | string | - | パッケージ検索のヒントとなる名前（オプション） |
| file_hashes | array | ○ | ライブラリファイルのMD5ハッシュ配列 |

### file_hashes配列
| フィールド | 型 | 必須 | 説明 |
|-----------|---|------|------|
| hash | string | ○ | MD5ハッシュのbase64エンコード |
| file_path | string | ○ | ライブラリルートからの相対パス |

### 対象ファイル拡張子
以下の拡張子のファイルを対象とします：
- `.c`
- `.cc` 
- `.h`
- `.hh`
- `.cpp`
- `.hpp`

## 推奨ツール使用

### indexer-api-caller
手動でのAPI呼び出しの前に、公式ツール [indexer-api-caller](https://github.com/google/osv.dev/tree/master/tools/indexer-api-caller) の使用を推奨します。

#### 使用方法
```bash
# リポジトリのクローン
git clone https://github.com/google/osv.dev.git
cd osv.dev/tools/indexer-api-caller

# 単一ライブラリの解析
go run . -lib path/to/library

# 複数ライブラリディレクトリの解析
go run . -dir /path/to/libs/dir
```

## 手動API呼び出し

### ファイルハッシュの生成
```bash
# MD5ハッシュの計算とbase64エンコード例
md5sum file.cpp | cut -d' ' -f1 | xxd -r -p | base64
```

### リクエスト例
```bash
curl -d '{
  "name": "protobuf",
  "file_hashes": [
    {
      "hash": "base64エンコードされたMD5ハッシュ",
      "file_path": "src/google/protobuf/message.cc"
    },
    {
      "hash": "別のbase64エンコードされたMD5ハッシュ", 
      "file_path": "src/google/protobuf/descriptor.cc"
    }
  ]
}' "https://api.osv.dev/v1experimental/determineversion"
```

## レスポンス形式

### 200 OK
```json
{
  "matches": [
    {
      "score": 1.0,
      "repo_info": {
        "type": "GIT",
        "address": "https://github.com/protocolbuffers/protobuf.git",
        "tag": "v4.22.2",
        "version": "4.22.2"
      },
      "minimum_file_matches": "617"
    },
    {
      "score": 0.97730956239870337,
      "repo_info": {
        "type": "GIT", 
        "address": "https://github.com/protocolbuffers/protobuf.git",
        "tag": "v4.22.1",
        "version": "4.22.1"
      },
      "minimum_file_matches": "575",
      "estimated_diff_files": "14"
    }
  ]
}
```

## レスポンスフィールド詳細

### matches配列
マッチ度の高い順にソートされたライブラリバージョンのリスト

| フィールド | 型 | 説明 |
|-----------|---|------|
| score | number | マッチ度スコア（0.0〜1.0） |
| repo_info | object | リポジトリ情報 |
| minimum_file_matches | string | 完全一致したファイル数 |
| estimated_diff_files | string | 推定差分ファイル数（オプション） |

### repo_info オブジェクト
| フィールド | 型 | 説明 |
|-----------|---|------|
| type | string | リポジトリタイプ（例: GIT） |
| address | string | リポジトリアドレス |
| tag | string | Gitタグ |
| version | string | ライブラリバージョン |

## レスポンス解釈

### スコアの意味
- `1.0`: 完全一致
- `0.9以上`: 非常に高い一致率
- `0.8以上`: 高い一致率
- `0.7以下`: 注意が必要

### 推奨アプローチ
1. **高スコアマッチの使用**: スコア0.9以上のマッチを優先的に使用
2. **複数バージョンの検証**: プロジェクトの要件に応じて上位数件を検証
3. **一括脆弱性検索**: [POST /v1/querybatch](./02_post-v1-querybatch.md) で複数バージョンを一括検索

## ワークフロー例

### 1. バージョン特定
```bash
# C/C++ライブラリのバージョンを特定
go run indexer-api-caller -lib /path/to/library
```

### 2. 脆弱性検索
特定されたバージョンで脆弱性を検索：
```bash
curl -d '{
  "queries": [
    {
      "package": {"name": "protobuf", "ecosystem": "OSS-Fuzz"},
      "version": "4.22.2"
    },
    {
      "package": {"name": "protobuf", "ecosystem": "OSS-Fuzz"}, 
      "version": "4.22.1"
    }
  ]
}' "https://api.osv.dev/v1/querybatch"
```

## 制限事項

### 対応ライブラリ
OSS-Fuzz統合プロジェクトのみ対応。すべてのC/C++パッケージが含まれているわけではありません。

### ファイルサイズ制限
大量のファイルハッシュを送信する場合、リクエストサイズ制限に注意してください。

### 精度
- 完全一致（score=1.0）以外では推定結果となります
- カスタム修正が加えられたライブラリでは精度が低下する可能性があります

## エラーレスポンス

### 400 Bad Request
```json
{
  "error": "Invalid file hash format"
}
```

### 404 Not Found
```json
{
  "error": "No matching libraries found"
}
```

## 関連API

- [POST /v1/query](./01_post-v1-query.md) - 特定されたバージョンでの脆弱性検索
- [POST /v1/querybatch](./02_post-v1-querybatch.md) - 複数バージョンの一括脆弱性検索

## フィードバック

実験版APIのため、以下のフィードバックを歓迎します：
- 精度に関する問題
- 対応ライブラリの拡充要望
- 使い勝手の改善提案

フィードバックは [GitHub Issues](https://github.com/google/osv.dev/issues/new) へお寄せください。