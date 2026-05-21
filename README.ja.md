<div align="center">
  <h1>Polymarket Mimic Trading Bot</h1> 
  <p><code>[ CONCURRENCY: MULTI-WALLET ]</code> <code>[ ENGINE: ORDER-AGGREGATION ]</code></p>
  <p><strong>産業グレードの定量的実行ノード</strong></p>
  <p><em>Account Abstraction (AA) プロキシルーティング、マルチウォレット並行処理、および動的注文集約のために設計されています。</em></p>
  <p><em><a href="README.md">English</a> | <a href="README.zh-CN.md">中文</a> | <a href="README.ja.md">日本語</a> | <a href="README.ko.md">한국어</a> | <a href="README.es.md">Español</a> | <a href="README.ru.md">Русский</a></em></p>
  <p>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-ISC-blue.svg" alt="License: ISC" /></a>
    <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg" alt="Node.js Version" /></a>
    <a href="https://polymarket.com/"><img src="https://img.shields.io/badge/Market-Polymarket-6b5cff.svg" alt="Polymarket" /></a>
    <a href="https://www.mongodb.com/"><img src="https://img.shields.io/badge/Storage-MongoDB-47A248.svg" alt="MongoDB" /></a>
  </p>
</div>

## なぜこのシステムを構築したのか？

Polymarketの高頻度な戦場において、トップトレーダー（「スマートマネー」）はしばしば多数のマイクロトレード（スナイプ）を通じて実行します。盲目的に1:1でコピーすると、大量のガス消耗と極端なスリッページが発生します。さらに、Polymarketの更新されたAPIは、Account AbstractionベースのDeposit Walletフローを強制しており、従来のEOA呼び出しは `maker address not allowed` エラーでブロックされます。

**Polymarket Mimic Trading Bot** は単なるAPIラッパーではありません。状態の永続化、注文集約器、動的リスクコントロールエンジン、およびPolymarketの新しいRelayerルーティングメカニズムとの完全な互換性を備えた、本格的な自動実行ノードです。

### コアアーキテクチャの機能

- **注文集約エンジン**: メモリ内に時間枠（例：5秒）を確立し、価格しきい値内の同一市場/結果に関する断片化されたスナイプをクリーンなバッチ注文に集約し、レート制限を回避して実行効率を向上させます。
- **動的リスクと精度のスケーリング**: 資金比率に基づいて実行サイズを動的に計算し、取引所固有のTick Size要件を自動的に処理し、厳格なスリッページ上限を適用する、きめ細かいJSON戦略マトリックス。
- **AAプロキシルーティング（Deposit Walletフロー）**: `POLY_1271` 署名プロトコルとRelayerインタラクションロジックをネイティブに実装。厳格な検証メカニズムにより、実行モード、オンチェーンコントラクト状態、および環境変数が完全に一致し、資産の損失を防ぎます。
- **ステートマシンと回復力**: ライフサイクル全体（ポジション、注文メタデータ、実行履歴）はリアルタイムでMongoDBに永続化されます。RPCのジッターを処理するために、Exponential Backoffアルゴリズムを利用した組み込みのネットワーク再試行メカニズム。

## アーキテクチャの概要

<img alt="screenshot" src="./assets/image.png" />

1. **継続的モニタリング**: Polymarket Data APIを介してターゲットアドレスのアクティビティストリームをポーリングします。
2. **集約とクレンジング**: 時間枠内の高頻度ノイズを実行可能なバッチ注文にマージします。
3. **リスクコントロールとスケーリング**: アカウント残高と戦略マトリックスに基づいて、実際の注文サイズを動的に計算します。
4. **ルーティングと検証**: `WALLET_MODE` に基づいて基盤となる署名ロジックを自動的に切り替え、RelayerまたはネイティブRPCを介して注文をブロードキャストします。
5. **永続化**: シームレスな回復のために、状態のライフサイクル全体をMongoDBに記録します。

## クイックスタート

### 前提条件

- Node.js v18+
- MongoDBデータベース（[MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) を推奨）
- USDCおよびGas用のPOL/MATICが入金されたPolygonウォレット
- Polygon RPCエンドポイント（Infura、Alchemyなど）

### 迅速なデプロイ

```bash
# リポジトリのクローン
git clone https://github.com/ChiryanOY/MimicPolymarket.git
cd MimicPolymarket

# 依存関係のインストール
npm install

# 構成の初期化
cp .env.docker.example .env

# （推奨）対話型セットアップウィザードを実行
# npm run setup

# アカウントにDeposit Walletフローが必要な場合は、以下を実行：
# npm run setup-deposit-wallet

# ビルドとヘルスチェックの実行
npm run build
npm run health-check

# 実行エンジンの起動
npm start
```

## コア構成ガイド

実行環境は `.env` ファイルに依存しています（[`/.env.docker.example`](./.env.docker.example) を参照）。

### 必須の環境変数

- `USER_ADDRESSES`: 監視するターゲットウォレット（カンマ区切り）。
- `TRADING_WALLET`: 実行アドレス（`LEGACY` の場合はEOA/Safe、`DEPOSIT` の場合は派生したDeposit Wallet）。
- `WALLET_MODE`: ルーティングモード（`LEGACY` または `DEPOSIT`）。
- `PRIVATE_KEY`: OwnerまたはSignerの秘密鍵。
- `CLOB_HTTP_URL` / `CLOB_WS_URL`: Polymarket APIエンドポイント。
- `MONGO_URI`: MongoDBステートマシン接続文字列。
- `RPC_URL` / `USDC_CONTRACT_ADDRESS`: Polygonネットワーク構成。

### 詳細: ウォレットルーティングモード

#### `LEGACY` モード
初期のEOAまたはSafeマルチシグ直接署名呼び出し用に設計されています。エンジンは、`TRADING_WALLET` が `PRIVATE_KEY` から派生したSignerと一致するかどうかを厳密に検証します。

#### `DEPOSIT` モード（新しいAPIに必須）
Polymarketが `maker address not allowed, please use the deposit wallet flow` というエラーで呼び出しを傍受した場合に必要です。
1. `POLY_BUILDER_API_KEY` などのRelayer認証情報を設定します。
2. `npm run setup-deposit-wallet` を実行してDeposit Walletを動的に派生させ、それを `TRADING_WALLET` として設定します。
3. エンジンは起動時にこのアドレスのオンチェーンコントラクトデプロイメントステータスを厳密に検証します。

> ⚠️ **安全インターセプション**: `WALLET_MODE` がオンチェーンの現実と一致しない場合、エンジンは初期化中に致命的なエラー（Fatal Error）をスローし、資金を保護するために停止します。

### 詳細: 戦略マトリックス構成

きめ細かい制御は `TRADER_STRATEGIES` を通じて実現され、有効なJSON文字列である必要があります。

```json
[
  {
    "address": "0xabc...",
    "mimicSize": 1.0,
    "maxOrderSizeUSD": 500,
    "maxPositionSizeUSD": 2000,
    "tradeAggregationEnabled": true,
    "tradeAggregationWindowSeconds": 5
  }
]
```
デフォルトの戦略は、`PERCENTAGE` に基づく比例スケーリングアルゴリズムを利用します。

### 📖 詳細: 取引と実行のメカニズム

定量的な実行が効率的かつ高度に安全であることを保証するために、ボットは売買に2つの全く異なるリスクコントロールパイプラインを採用しています。コアメカニズムの内訳は次のとおりです。

#### 🟢 買い注文のメカニズム
エンジンが「スマートマネー」の買い操作を検出すると、厳格な条件チェックのシーケンスをトリガーします。
1. **基本サイズの計算**: 設定された `mimicSize` のパーセンテージに基づいてターゲットトークン量を計算します：`Trader Tokens * (mimicSize / 100)`。
2. **マルチしきい値スケーリング**:
   - **最大注文サイズ**: 計算されたトークン値が `maxOrderSizeUSD` を超える場合、この制限に厳密に制限されます。
   - **最大ポジションサイズ**: エンジンは現在のポジションコストと入力注文コストを評価します。これが `maxPositionSizeUSD` を超える場合、注文は残りの許容額に収まるようにトリミングされます。許容額が5トークン未満の場合、注文は拒否されます。
   - **残高保護**: 現在のUSDC残高を確認し、わずかな価格変動や手数料による `INSUFFICIENT_BALANCE` エラーを防ぐために、注文を利用可能な資金の `99%` に制限します。
3. **スリッページと指値注文の実行**: トレーダーの実行価格を取得し、設定された `buySlippageThreshold` を追加します。その後、厳密な **指値注文 (Limit Order)** が生成されます。これにより、極端な市場のボラティリティの間でも、エントリーコストが安全のしきい値を超えることは決してありません。

#### 🔴 売り注文のメカニズム
売りは通常、「スマートマネー」が利益確定または損切りを行っていることを示します。したがって、実行の優先順位と流動性の獲得が最優先事項です。エンジンは「クリア＆マーケットスナイプ」戦略を採用しています。
1. **保留中の買い注文のクリア**: 売りを実行する前に、エンジンはその特定の資産に対する保留中のすべてのBUY注文をアクティブにキャンセルし、資金を解放して競合する取引を回避します。
2. **動的比例売り**:
   - システムは、トレーダーの売りサイズを履歴ポジションサイズと比較して、実際の **売りパーセンテージ (Sell Percentage)** を計算します。
   - 次に、*実際のCLOBトークン残高* にこのパーセンテージを掛けて、売り額を決定します。トレーダーがポジション全体をダンプした場合（または履歴ポジションが追跡できない場合）、エンジンは保有資産の **100%完全清算** をトリガーします。
3. **FOK（Fill-or-Kill）の実行**:
   - エンジンはリアルタイムのオーダーブックを取得して、最も高い買い手（Best Bid）を見つけます。
   - 設定された `sellSlippageThreshold` を引いて、安全なフロア価格を確立します。
   - 注文は **FOK（Fill-or-Kill）** 注文タイプを使用してブロードキャストされます。FOKは、注文がすぐに完全に満たされるか、完全にキャンセルされることを保証し、断片化された部分的な約定がオーダーブックにぶら下がるのを防ぎます。
   - 流動性のシフトによりFOKの拒否またはネットワークの問題が発生した場合、エンジンは指数バックオフ再試行メカニズム（最大 `RETRY_LIMIT` まで）をトリガーし、ポジションがクリアされるまで流動性を積極的に追いかけます。

## Docker コンテナ化

BotとMongoDBインスタンスの両方を1つのコマンドでスピンアップし、純粋なローカルデーモン実行を実現する、すぐに使える `docker-compose.yml` を提供しています。

```bash
# 環境の初期化
cp .env.docker.example .env
# .env で次のように設定することをお勧めします: MONGO_URI='mongodb://mongodb:27017/polymarket_mimictrading'

# サービスの開始
docker-compose up -d

# エンジンログの監視
docker-compose logs -f bot
```

## アルファ（スマートマネー）の探求

1. [Polymarket Leaderboard](https://polymarket.com/leaderboard) を分析します。
2. P&Lがプラス、勝率が55%以上、および最近のアクティビティがあるトレーダーをフィルタリングします。
3. [Predictfolio](https://predictfolio.com) を使用して、詳細な統計情報を相互検証します。
4. 選択したアドレスを `USER_ADDRESSES` に挿入し、エンジンに引き継ぎます。

## Star History

<a href="https://star-history.com/#ChiryanOY/MimicPolymarket&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=ChiryanOY/MimicPolymarket&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=ChiryanOY/MimicPolymarket&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=ChiryanOY/MimicPolymarket&type=Date" />
  </picture>
</a>

## ライセンス
ISC License - 詳細は [LICENSE](LICENSE) を参照してください。

## 謝辞
- [Polymarket CLOB Client V2](https://github.com/Polymarket/clob-client-v2) 上に構築されたコア依存関係。
- [Predictfolio](https://predictfolio.com) を搭載したデータ分析。

---
**免責事項:** このソフトウェアは、技術的な調査、コードの学習、および教育目的でのみ提供されています。財務的または投資的なアドバイスを構成するものではありません。予測市場には極端なリスクが伴い、自動実行により資本が完全に失われる可能性があります。開発者は財務上の損失について一切の責任を負いません。ソースコードのロジックを完全に理解した上で、自己責任でこのシステムをデプロイしてください。