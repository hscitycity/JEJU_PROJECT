# 나라장터 입찰/낙찰/계약 정보 MCP

[공공데이터포털 나라장터 공공데이터개방표준서비스(PubDataOpnStdService)](https://www.data.go.kr/data/15129394/openapi.do)를 MCP(Model Context Protocol) Tool/Resource로 제공하는 서버입니다.

조달청 표준 데이터셋 3종(입찰공고/낙찰/계약)을 각각의 공식 파라미터·범위 제한에 맞게 호출하고, 결과를 메모리에 저장하여 검색·타임라인·알림 규칙 평가를 제공합니다.

---

## 1. 준비

### 1.1 요구사항

- Node.js 18 이상
- 공공데이터포털에서 **나라장터 공공데이터개방표준서비스** 활용신청 후 발급받은 인증키 (Decoding 키)

### 1.2 설치

```bash
npm install
```

### 1.3 환경변수

`.env` 파일 또는 MCP 실행 환경의 `env`에 다음을 설정합니다.

```env
PUBLIC_PROCUREMENT_BASE_URL=https://apis.data.go.kr/1230000/ao/PubDataOpnStdService
PUBLIC_PROCUREMENT_SERVICE_KEY=발급받은_Decoding_서비스키
PUBLIC_PROCUREMENT_TIMEOUT_MS=15000
```

> ⚠️ 서비스키는 절대 저장소에 커밋하지 마세요. `.gitignore`로 `.env`가 차단되어 있지만 안전 차원에서 항상 Secret 관리하세요.

---

## 2. 실행

```bash
npm run start
```

stdio 기반 MCP 서버로 실행됩니다. 호스트(VS Code MCP 확장, OpenCode 등)에서 stdio 연결로 사용합니다.

---

## 3. 제공 Tool

### 3.1 `sync_procurement_data` — 데이터셋 동기화

3개 엔드포인트는 **서로 다른 파라미터와 범위 제한**을 사용합니다. `datasets` 입력으로 호출할 엔드포인트를 선택하고, 각 데이터셋이 요구하는 파라미터를 함께 전달합니다.

| 데이터셋 | 엔드포인트 | 날짜 파라미터 | 형식 | 최대 범위 |
|---|---|---|---|---|
| `bidNotice` (입찰공고) | `getDataSetOpnStdBidPblancInfo` | `fromDate` / `toDate` (내부적으로 `bidNtceBgnDt` / `bidNtceEndDt`로 매핑) | YYYYMMDDHHMM | **1개월** |
| `successfulBid` (낙찰) | `getDataSetOpnStdScsbidInfo` | `opengBgnDt` / `opengEndDt` + 필수 `bsnsDivCd` | YYYYMMDDHHMM | **1주일** |
| `contract` (계약) | `getDataSetOpnStdCntrctInfo` | `cntrctCnclsBgnDate` / `cntrctCnclsEndDate` | YYYYMMDD (8자리) | **1주일** |

`bsnsDivCd` 값: `1`=물품, `2`=외자, `3`=공사, `5`=용역.

#### 입력 스키마 (요약)

| 필드 | 타입 | 설명 |
|---|---|---|
| `datasets` | `string[]` | 동기화할 데이터셋. 기본 `["bidNotice"]`. 가능: `bidNotice`, `successfulBid`, `contract` |
| `pageNo` | integer | 페이지 번호. 기본 1 |
| `numOfRows` | integer | 페이지당 결과 수. 기본 100, 최대 1000 |
| `fromDate` / `toDate` | string | 입찰공고용 시작/종료 (YYYYMMDDHHMM) |
| `opengBgnDt` / `opengEndDt` | string | 낙찰용 개찰 시작/종료 (YYYYMMDDHHMM) |
| `bsnsDivCd` | `"1"\|"2"\|"3"\|"5"` | 낙찰 필수, 업무구분코드 |
| `cntrctCnclsBgnDate` / `cntrctCnclsEndDate` | string | 계약용 체결 시작/종료 (YYYYMMDD) |
| `insttDivCd` / `insttCd` | string | 계약용 선택 필터 (1=계약기관, 2=수요기관) |

#### 사용 예시

##### A. 입찰공고만 (가장 일반적)

```json
{
  "datasets": ["bidNotice"],
  "fromDate": "202605010000",
  "toDate": "202605300000",
  "numOfRows": 100
}
```

##### B. 낙찰 정보만 (1주일 + 업무구분 필수)

```json
{
  "datasets": ["successfulBid"],
  "opengBgnDt": "202605010000",
  "opengEndDt": "202605070000",
  "bsnsDivCd": "3",
  "numOfRows": 100
}
```

##### C. 계약 정보만 (1주일, YYYYMMDD)

```json
{
  "datasets": ["contract"],
  "cntrctCnclsBgnDate": "20260501",
  "cntrctCnclsEndDate": "20260507",
  "numOfRows": 100
}
```

##### D. 여러 데이터셋 동시 동기화

```json
{
  "datasets": ["bidNotice", "successfulBid"],
  "fromDate": "202605010000",
  "toDate": "202605300000",
  "opengBgnDt": "202605010000",
  "opengEndDt": "202605070000",
  "bsnsDivCd": "1"
}
```

#### 응답 예시

```json
{
  "message": "sync completed",
  "datasetsRequested": ["bidNotice"],
  "datasetsFetched": ["bidNotice"],
  "skipped": [],
  "fetched":  { "bidNotice": 100, "successfulBid": 0, "contract": 0 },
  "totals":   { "bidNotice": 96,  "successfulBid": 0, "contract": 0 }
}
```

- `datasetsRequested`: 요청한 데이터셋
- `datasetsFetched`: 실제로 호출된 데이터셋
- `skipped`: 필수 파라미터 누락 또는 범위 제한 위반 사유
- `fetched`: 이번 호출에서 API로 가져온 건수
- `totals`: 메모리 저장소에 누적된 건수 (noticeId/contractId 기준 dedup)

#### 범위 검증 동작

- 입찰공고가 31일을 넘으면: `bidNotice: date range exceeds 1 month limit: ... days (max 31 days)`
- 낙찰/계약이 7일을 넘으면: `successfulBid: date range exceeds 1 week limit: ... days (max 7 days)`
- 잘못된 날짜 형식: `invalid date format: <값> (expected YYYYMMDD or YYYYMMDDHHMM)`
- 시작 > 종료: `date range invalid: end (...) is before start (...)`

### 3.2 `search_notices` — 동기화된 공고 검색

| 필드 | 타입 | 설명 |
|---|---|---|
| `keyword` | string | 공고명 부분 일치 |
| `agency` | string | 발주기관명 부분 일치 |
| `fromDate` / `toDate` | string | 공고일 범위 (ISO 또는 YYYY-MM-DD) |
| `limit` | integer | 최대 200, 기본 20 |

### 3.3 `get_timeline` — 공고→낙찰→계약 타임라인

| 필드 | 타입 | 설명 |
|---|---|---|
| `noticeId` | string (필수) | `bidNtceNo` (예: `R26BK01559932`) |

해당 공고 ID로 연결된 낙찰·계약 데이터를 함께 반환합니다.

### 3.4 알림 규칙 도구

- `create_alert_rule` — 키워드/기관/최소금액 매칭 규칙 등록
  - 입력: `name`, `channel` (`console|webhook|slack|email`), `target`, 선택: `keyword`, `agency`, `minAmount`
- `list_alert_rules` — 등록된 규칙 전체 조회
- `evaluate_alerts` — 현재 저장된 공고와 규칙을 매칭해 신규 알림 이벤트 생성 (이벤트 중복 방지)

---

## 4. 제공 Resource

| URI | 설명 |
|---|---|
| `procurement://notices` | 메모리에 저장된 전체 입찰공고 |
| `procurement://alerts/rules` | 등록된 알림 규칙 전체 |
| `procurement://timeline/{noticeId}` | 특정 공고의 타임라인 |

---

## 5. MCP 호스트 연결

### 5.1 VS Code (Continue, Cline 등)

`.vscode/mcp.json`:

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "publicProcurementServiceKey",
      "description": "공공데이터포털 나라장터 서비스키 (Decoding)",
      "password": true
    }
  ],
  "servers": {
    "narajangteo": {
      "type": "stdio",
      "command": "node",
      "args": ["src/server.js"],
      "env": {
        "PUBLIC_PROCUREMENT_BASE_URL": "https://apis.data.go.kr/1230000/ao/PubDataOpnStdService",
        "PUBLIC_PROCUREMENT_SERVICE_KEY": "${input:publicProcurementServiceKey}",
        "PUBLIC_PROCUREMENT_TIMEOUT_MS": "15000"
      }
    }
  }
}
```

### 5.2 OpenCode

`~/.config/opencode/opencode.jsonc` 의 `mcp` 섹션:

```jsonc
{
  "mcp": {
    "narajangteo": {
      "type": "local",
      "command": ["node", "/absolute/path/to/naramarket-Demo/src/server.js"],
      "enabled": true,
      "environment": {
        "PUBLIC_PROCUREMENT_BASE_URL": "https://apis.data.go.kr/1230000/ao/PubDataOpnStdService",
        "PUBLIC_PROCUREMENT_SERVICE_KEY": "발급받은_서비스키",
        "PUBLIC_PROCUREMENT_TIMEOUT_MS": "15000"
      }
    }
  }
}
```

Windows 경로 예: `["cmd", "/c", "node", "C:\\path\\to\\naramarket-Demo\\src\\server.js"]`.

---

## 6. 프로젝트 구조

```
naramarket-Demo/
├── src/
│   ├── server.js     # MCP 서버 (도구/리소스/프롬프트 등록)
│   ├── g2b-api.js    # G2B API 클라이언트 (3개 엔드포인트별 메서드)
│   ├── store.js      # 메모리 저장소 + 알림 규칙
│   └── utils.js      # 공통 유틸 + parseG2BDate / validateDateRange
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

핵심 설계 원칙:
- **엔드포인트별 파라미터 분리**: 3개 API가 서로 다른 날짜 파라미터/형식/범위 제한을 가지므로 `fetchBidNotices`, `fetchSuccessfulBids`, `fetchContracts`가 각각 자체 시그니처를 가짐
- **공식 명세 준수**: 쿼리키 `ServiceKey`(대문자 S), `bidNtceBgnDt`(소문자 t)
- **사전 범위 검증**: API 호출 전 1개월/1주일 제한 위반 시 명확한 에러 반환
- **API 에러 헤더 감지**: `nkoneps.com.response.ResponseError` 및 `resultCode != 00` 케이스 처리

---

## 7. 운영 전 권장 사항

- **저장소 교체**: 현재는 인메모리(`Map`) 저장소이며, 프로세스 재시작 시 휘발됩니다. 운영용으로 PostgreSQL/SQLite/Redis로 교체하세요.
- **스케줄링**: cron/스케줄러로 5~10분 단위 sync 호출 + 마지막 동기화 시점 추적
- **재시도 정책**: 공공데이터포털 API는 일시 장애가 잦으므로 지수 백오프 재시도 권장
- **알림 채널 분리**: `evaluate_alerts`의 `console` 채널 외에 webhook/Slack/email 어댑터 구현
- **`numOfRows` 페이지네이션**: 한 번에 1000건 이상은 `pageNo`를 증가시키며 반복 호출

---

## 8. API 출처

- 공공데이터포털: https://www.data.go.kr
- 데이터셋: "나라장터 공공데이터개방표준서비스" (PubDataOpnStdService)
- 데이터 제공: 조달청 조달데이터관리팀

---

## 9. 라이선스 / 면책

- 본 코드는 예제이며, 공공데이터포털 API 이용약관·나라장터 데이터 이용약관을 준수해서 사용해야 합니다.
- 서비스키 발급/관리 책임은 사용자에게 있습니다.
