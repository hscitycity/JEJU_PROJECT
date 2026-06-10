# 나라장터 공공조달 알림 MCP

나라장터 OpenAPI(입찰공고/낙찰/계약)를 수집해서 MCP Tool/Resource로 제공하는 예제 서버입니다.

## 1) 준비

1. Node.js 18+ 설치
2. 의존성 설치

```bash
npm install
```

3. 환경변수 설정 (`.env` 파일 또는 실행환경 변수)

```env
PUBLIC_PROCUREMENT_BASE_URL=https://apis.data.go.kr/1230000/ao/PubDataOpnStdService
PUBLIC_PROCUREMENT_SERVICE_KEY=발급받은_서비스키
PUBLIC_PROCUREMENT_TIMEOUT_MS=15000
```

> ⚠️ 서비스키는 코드/저장소에 직접 넣지 말고 반드시 Secret으로 관리하세요.

## 2) 실행

```bash
npm run start
```

stdio MCP 서버로 실행됩니다.

## 3) 제공 Tool

- `sync_procurement_data`: 입찰공고/낙찰/계약 데이터 동기화
- `search_notices`: 동기화된 공고 검색
- `get_timeline`: 특정 공고의 공고→낙찰→계약 타임라인 조회
- `create_alert_rule`: 자동알림 규칙 등록
- `list_alert_rules`: 알림 규칙 목록 조회
- `evaluate_alerts`: 규칙 기반 신규 알림 이벤트 생성(중복 방지)

## 4) 제공 Resource

- `procurement://notices`
- `procurement://alerts/rules`
- `procurement://timeline/{noticeId}`

## 5) VSCode MCP 연결 예시

`.vscode/mcp.json` 에 서버를 추가할 수 있습니다.

```json
{
  "servers": {
    "narajangteo": {
      "type": "stdio",
      "command": "node",
      "args": ["src/server.js"],
      "env": {
        "PUBLIC_PROCUREMENT_BASE_URL": "https://apis.data.go.kr/1230000/ao/PubDataOpnStdService",
        "PUBLIC_PROCUREMENT_SERVICE_KEY": "${input:publicProcurementServiceKey}"
      }
    }
  }
}
```

## 6) 운영 전 권장 사항

- 현재 예제는 메모리 저장소입니다. 운영 시 PostgreSQL/Redis로 교체하세요.
- 스케줄러(예: 5~10분) + 중복방지 키 + 재시도 정책을 붙이세요.
- 웹훅/슬랙/이메일 채널별 발송 어댑터를 분리 구현하세요.
