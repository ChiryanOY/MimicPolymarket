<div align="center">
  <h1>Polymarket Mimic Trading Bot</h1>
  <p><strong>하드코어 정량적 실행 노드: 계정 추상화(AA) 프록시 라우팅, 다중 지갑 동시성 및 동적 주문 집계 기능을 갖추고 있습니다.</strong></p>
  <p><em><a href="README.md">English</a> | <a href="README.zh-CN.md">中文</a> | <a href="README.ja.md">日本語</a> | <a href="README.ko.md">한국어</a> | <a href="README.es.md">Español</a></em></p>
  <p>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-ISC-blue.svg" alt="License: ISC" /></a>
    <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg" alt="Node.js Version" /></a>
    <a href="https://polymarket.com/"><img src="https://img.shields.io/badge/Market-Polymarket-6b5cff.svg" alt="Polymarket" /></a>
    <a href="https://www.mongodb.com/"><img src="https://img.shields.io/badge/Storage-MongoDB-47A248.svg" alt="MongoDB" /></a>
  </p>
</div>

## 왜 이 시스템을 구축했나요?

Polymarket의 고빈도 전장에서 최고의 트레이더("스마트 머니")는 종종 수많은 마이크로 트레이드(스나이프)를 통해 실행합니다. 맹목적인 1:1 복사는 막대한 가스 소모와 극단적인 슬리피지를 초래합니다. 또한 Polymarket의 업데이트된 API는 계정 추상화 기반 Deposit Wallet 흐름을 강제하여, 기존 EOA 호출은 `maker address not allowed` 오류로 차단됩니다.

**Polymarket Mimic Trading Bot**은 단순한 API 래퍼가 아닙니다. 상태 지속성, 주문 집계기, 동적 위험 제어 엔진, 그리고 Polymarket의 새로운 Relayer 라우팅 메커니즘과 완벽하게 호환되는 완전한 자동 실행 노드입니다.

### 핵심 아키텍처 기능

- **주문 집계 엔진**: 메모리 내 시간 창(예: 5초)을 설정하여 동일한 시장/결과에 대한 파편화된 스나이프를 가격 임계값 내에서 깨끗한 일괄 주문으로 집계하여 속도 제한을 우회하고 실행 효율성을 높입니다.
- **동적 위험 및 정밀도 확장**: 자본 비율에 따라 실행 크기를 동적으로 계산하고 거래소별 Tick Size 요구 사항을 자동으로 처리하며 엄격한 슬리피지 상한을 적용하는 세분화된 JSON 전략 매트릭스.
- **AA 프록시 라우팅(Deposit Wallet 흐름)**: `POLY_1271` 서명 프로토콜 및 Relayer 상호 작용 논리를 기본적으로 구현합니다. 엄격한 검증 메커니즘은 실행 모드, 온체인 컨트랙트 상태 및 환경 변수가 완벽하게 일치하도록 하여 자산 손실을 방지합니다.
- **상태 머신 및 복원력**: 전체 수명 주기(포지션, 주문 메타데이터, 실행 내역)가 MongoDB에 실시간으로 지속됩니다. 지수 백오프 알고리즘을 활용한 내장된 네트워크 재시도 메커니즘으로 RPC 지터를 처리합니다.

## 아키텍처 개요

<img alt="screenshot" src="./assets/image.png" />

1. **지속적 모니터링**: Polymarket Data API를 통해 대상 주소의 활동 스트림을 폴링합니다.
2. **집계 및 정리**: 시간 창 내의 고빈도 노이즈를 실행 가능한 일괄 주문으로 병합합니다.
3. **위험 제어 및 확장**: 계정 잔액 및 전략 매트릭스에 따라 실제 주문 크기를 동적으로 계산합니다.
4. **라우팅 및 검증**: `WALLET_MODE`에 따라 기본 서명 논리를 자동으로 전환하여 Relayer 또는 기본 RPC를 통해 주문을 브로드캐스트합니다.
5. **지속성**: 원활한 복구를 위해 전체 상태 수명 주기를 MongoDB에 기록합니다.

## 빠른 시작

### 전제 조건

- Node.js v18+
- MongoDB 데이터베이스([MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) 권장)
- 가스용 USDC 및 POL/MATIC이 충전된 Polygon 지갑
- Polygon RPC 엔드포인트(예: Infura, Alchemy)

### 빠른 배포

```bash
# 리포지토리 복제
git clone https://github.com/ChiryanOY/MimicPolymarket.git
cd MimicPolymarket

# 종속성 설치
npm install

# 구성 초기화
cp .env.docker.example .env

# (권장) 대화형 설정 마법사 실행
# npm run setup

# 계정에 Deposit Wallet 흐름이 필요한 경우 실행:
# npm run setup-deposit-wallet

# 빌드 및 상태 확인 실행
npm run build
npm run health-check

# 실행 엔진 가동
npm start
```

## 핵심 구성 가이드

실행 환경은 `.env` 파일에 의존합니다([`/.env.docker.example`](./.env.docker.example) 참조).

### 필수 환경 변수

- `USER_ADDRESSES`: 모니터링할 대상 지갑(쉼표로 구분).
- `TRADING_WALLET`: 실행 주소(`LEGACY`의 경우 EOA/Safe, `DEPOSIT`의 경우 파생된 Deposit Wallet).
- `WALLET_MODE`: 라우팅 모드(`LEGACY` 또는 `DEPOSIT`).
- `PRIVATE_KEY`: Owner 또는 Signer의 개인 키.
- `CLOB_HTTP_URL` / `CLOB_WS_URL`: Polymarket API 엔드포인트.
- `MONGO_URI`: MongoDB 상태 머신 연결 문자열.
- `RPC_URL` / `USDC_CONTRACT_ADDRESS`: Polygon 네트워크 구성.

### 심층 분석: 지갑 라우팅 모드

#### `LEGACY` 모드
초기 EOA 또는 Safe 다중 서명 직접 서명 호출을 위해 설계되었습니다. 엔진은 `TRADING_WALLET`이 `PRIVATE_KEY`에서 파생된 Signer와 일치하는지 엄격하게 검증합니다.

#### `DEPOSIT` 모드(새 API에 필수)
Polymarket이 `maker address not allowed, please use the deposit wallet flow`로 호출을 차단할 때 필요합니다.
1. `POLY_BUILDER_API_KEY`와 같은 Relayer 자격 증명을 구성합니다.
2. `npm run setup-deposit-wallet`을 실행하여 Deposit Wallet을 동적으로 파생시키고 이를 `TRADING_WALLET`으로 설정합니다.
3. 엔진은 시작 시 이 주소의 온체인 컨트랙트 배포 상태를 엄격하게 확인합니다.

> ⚠️ **안전 차단**: `WALLET_MODE`가 온체인 현실과 일치하지 않으면 엔진은 초기화 중에 치명적 오류(Fatal Error)를 발생시키고 자금을 보호하기 위해 중지됩니다.

### 심층 분석: 전략 매트릭스 구성

세분화된 제어는 `TRADER_STRATEGIES`를 통해 달성되며, 이는 유효한 JSON 문자열이어야 합니다.

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
기본 전략은 `PERCENTAGE` 기반 비례 확장 알고리즘을 사용합니다.

### 📖 심층 분석: 거래 및 실행 역학

정량적 실행이 효율적이면서도 매우 안전하도록 보장하기 위해 봇은 매수 및 매도에 대해 두 가지 완전히 다른 위험 제어 파이프라인을 사용합니다. 다음은 핵심 메커니즘의 분석입니다.

#### 🟢 매수 주문 메커니즘
엔진이 "스마트 머니" 매수 작업을 감지하면 엄격한 조건 확인 시퀀스를 트리거합니다.
1. **기본 크기 계산**: 구성된 `mimicSize` 백분율을 기반으로 대상 토큰 양을 계산합니다: `Trader Tokens * (mimicSize / 100)`.
2. **다중 임계값 확장**:
   - **최대 주문 크기**: 계산된 토큰 가치가 `maxOrderSizeUSD`를 초과하면 이 제한으로 엄격하게 제한됩니다.
   - **최대 포지션 크기**: 엔진은 현재 포지션 비용과 들어오는 주문 비용을 평가합니다. 이것이 `maxPositionSizeUSD`를 초과하면 주문이 남은 허용량에 맞게 조정됩니다. 허용량이 5 토큰 미만인 경우 주문이 거부됩니다.
   - **잔액 보호**: 현재 USDC 잔액을 확인하고 소규모 가격 변동이나 수수료로 인한 `INSUFFICIENT_BALANCE` 오류를 방지하기 위해 주문을 사용 가능한 자금의 `99%`로 제한합니다.
3. **슬리피지 및 지정가 주문 실행**: 트레이더의 실행 가격을 가져와 구성된 `buySlippageThreshold`를 추가합니다. 그런 다음 엄격한 **지정가 주문(Limit Order)**이 생성됩니다. 이를 통해 극단적인 시장 변동성 중에도 진입 비용이 안전 임계값을 초과하지 않습니다.

#### 🔴 매도 주문 메커니즘
매도는 일반적으로 "스마트 머니"가 이익을 실현하거나 손실을 줄이고 있음을 나타냅니다. 따라서 실행 우선순위와 유동성 확보가 가장 중요합니다. 엔진은 "클리어 및 마켓 스나이프" 전략을 채택합니다.
1. **대기 중인 매수 주문 클리어**: 매도를 실행하기 전에 엔진은 자본을 확보하고 상충되는 거래를 피하기 위해 해당 특정 자산에 대한 모든 대기 중인 BUY 주문을 적극적으로 취소합니다.
2. **동적 비례 매도**:
   - 시스템은 트레이더의 매도 크기를 과거 포지션 크기와 비교하여 실제 **매도 백분율(Sell Percentage)**을 계산합니다.
   - 그런 다음 *실제 CLOB 토큰 잔액*에 이 백분율을 곱하여 매도 금액을 결정합니다. 트레이더가 전체 포지션을 덤프하는 경우(또는 과거 포지션을 추적할 수 없는 경우) 엔진은 보유 자산의 **100% 전체 청산**을 트리거합니다.
3. **FOK(Fill-or-Kill) 실행**:
   - 엔진은 실시간 오더북을 가져와 가장 높은 구매자(Best Bid)를 찾습니다.
   - 구성된 `sellSlippageThreshold`를 빼서 안전 하한 가격을 설정합니다.
   - 주문은 **FOK(Fill-or-Kill)** 주문 유형을 사용하여 브로드캐스트됩니다. FOK는 주문이 즉시 완전히 체결되거나 완전히 취소되도록 보장하여 파편화된 부분 체결이 오더북에 매달려 있는 것을 방지합니다.
   - 유동성 이동으로 인해 FOK 거부 또는 네트워크 문제가 발생하는 경우 엔진은 지수 백오프 재시도 메커니즘(최대 `RETRY_LIMIT`까지)을 트리거하여 포지션이 청산될 때까지 유동성을 적극적으로 쫓습니다.

## Docker 컨테이너화

Bot과 MongoDB 인스턴스를 단일 명령으로 시작하여 순수한 로컬 데몬 실행을 달성할 수 있는 즉시 사용 가능한 `docker-compose.yml`을 제공합니다.

```bash
# 환경 초기화
cp .env.docker.example .env
# .env에 다음을 설정하는 것이 좋습니다: MONGO_URI='mongodb://mongodb:27017/polymarket_mimictrading'

# 서비스 시작
docker-compose up -d

# 엔진 로그 모니터링
docker-compose logs -f bot
```

## 알파 찾기(스마트 머니)

1. [Polymarket Leaderboard](https://polymarket.com/leaderboard)를 분석합니다.
2. P&L이 양수이고 승률이 55% 이상이며 최근 활동이 있는 트레이더를 필터링합니다.
3. [Predictfolio](https://predictfolio.com)를 사용하여 심층 통계를 교차 검증합니다.
4. 선택한 주소를 `USER_ADDRESSES`에 주입하고 엔진이 인계받도록 합니다.

## Star History

<a href="https://star-history.com/#ChiryanOY/MimicPolymarket&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=ChiryanOY/MimicPolymarket&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=ChiryanOY/MimicPolymarket&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=ChiryanOY/MimicPolymarket&type=Date" />
  </picture>
</a>

## 라이선스
ISC License - 자세한 내용은 [LICENSE](LICENSE)를 참조하세요.

## 감사의 말
- [Polymarket CLOB Client V2](https://github.com/Polymarket/clob-client-v2)를 기반으로 구축된 핵심 종속성.
- [Predictfolio](https://predictfolio.com)가 제공하는 데이터 분석.

---
**면책 조항:** 이 소프트웨어는 전적으로 기술 연구, 코드 학습 및 교육 목적으로 제공됩니다. 재정적 또는 투자적 조언을 구성하지 않습니다. 예측 시장은 극단적인 위험을 수반하며 자동화된 실행은 자본의 전면적인 손실을 초래할 수 있습니다. 개발자는 어떠한 재정적 손실에 대해서도 책임을 지지 않습니다. 소스 코드 논리를 완전히 이해한 후에만 자신의 위험 부담으로 이 시스템을 배포하십시오.