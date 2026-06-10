import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { G2BApiClient } from "./g2b-api.js";
import { ProcurementStore } from "./store.js";
import { validateDateRange } from "./utils.js";

const env = {
  baseUrl: process.env.PUBLIC_PROCUREMENT_BASE_URL,
  serviceKey: process.env.PUBLIC_PROCUREMENT_SERVICE_KEY,
  timeoutMs: Number(process.env.PUBLIC_PROCUREMENT_TIMEOUT_MS ?? 15000)
};

let apiClient;
const store = new ProcurementStore();

function getApiClient() {
  if (!apiClient) {
    apiClient = new G2BApiClient(env);
  }
  return apiClient;
}

const server = new Server(
  {
    name: "narajangteo-alert-mcp",
    version: "0.1.0"
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {}
    }
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "sync_procurement_data",
        description:
          "나라장터 공개 데이터셋(입찰공고/낙찰/계약)을 동기화합니다. 각 API는 서로 다른 파라미터/범위 제한이 있습니다. fromDate/toDate는 입찰공고용(YYYYMMDDHHMM, 최대 1개월). 낙찰/계약은 별도 파라미터 필요.",
        inputSchema: {
          type: "object",
          properties: {
            fromDate: {
              type: "string",
              description: "입찰공고 시작일시 (YYYYMMDDHHMM, 최대 1개월 범위). bidNtceBgnDt로 전달됨."
            },
            toDate: {
              type: "string",
              description: "입찰공고 종료일시 (YYYYMMDDHHMM, 최대 1개월 범위). bidNtceEndDt로 전달됨."
            },
            pageNo: { type: "integer", minimum: 1, default: 1 },
            numOfRows: { type: "integer", minimum: 1, maximum: 1000, default: 100 },
            datasets: {
              type: "array",
              items: { type: "string", enum: ["bidNotice", "successfulBid", "contract"] },
              description: "동기화할 데이터셋 선택 (기본: bidNotice만). 낙찰/계약은 별도 파라미터 필요.",
              default: ["bidNotice"]
            },
            opengBgnDt: {
              type: "string",
              description: "[낙찰용] 개찰 시작일시 (YYYYMMDDHHMM, 최대 1주일)"
            },
            opengEndDt: {
              type: "string",
              description: "[낙찰용] 개찰 종료일시 (YYYYMMDDHHMM, 최대 1주일)"
            },
            bsnsDivCd: {
              type: "string",
              description: "[낙찰용 필수] 업무구분코드 (1=물품, 2=외자, 3=공사, 5=용역)",
              enum: ["1", "2", "3", "5"]
            },
            cntrctCnclsBgnDate: {
              type: "string",
              description: "[계약용] 계약체결 시작일자 (YYYYMMDD, 최대 1주일)"
            },
            cntrctCnclsEndDate: {
              type: "string",
              description: "[계약용] 계약체결 종료일자 (YYYYMMDD, 최대 1주일)"
            },
            insttDivCd: {
              type: "string",
              description: "[계약용 선택] 기관구분값 (1=계약기관, 2=수요기관)"
            },
            insttCd: {
              type: "string",
              description: "[계약용 선택] 기관코드 (insttDivCd와 함께 사용)"
            }
          }
        }
      },
      {
        name: "search_notices",
        description: "동기화된 입찰공고 데이터를 키워드/기관/기간으로 검색합니다.",
        inputSchema: {
          type: "object",
          properties: {
            keyword: { type: "string" },
            agency: { type: "string" },
            fromDate: { type: "string" },
            toDate: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: 200, default: 20 }
          }
        }
      },
      {
        name: "get_timeline",
        description: "특정 공고 ID 기준으로 공고/낙찰/계약 타임라인을 반환합니다.",
        inputSchema: {
          type: "object",
          required: ["noticeId"],
          properties: {
            noticeId: { type: "string" }
          }
        }
      },
      {
        name: "create_alert_rule",
        description: "공고 자동알림 규칙을 생성합니다.",
        inputSchema: {
          type: "object",
          required: ["name", "channel", "target"],
          properties: {
            name: { type: "string" },
            keyword: { type: "string" },
            agency: { type: "string" },
            minAmount: { type: "number" },
            channel: {
              type: "string",
              enum: ["console", "webhook", "slack", "email"]
            },
            target: { type: "string", description: "채널 대상(webhook URL/slack 채널/email 등)" }
          }
        }
      },
      {
        name: "list_alert_rules",
        description: "생성된 알림 규칙 목록을 조회합니다.",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "evaluate_alerts",
        description: "현재 동기화 데이터와 규칙을 매칭하여 신규 알림 이벤트를 생성합니다(중복 방지).",
        inputSchema: {
          type: "object",
          properties: {}
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = request.params.arguments ?? {};

  if (request.params.name === "sync_procurement_data") {
    const pageNo = args.pageNo ?? 1;
    const numOfRows = args.numOfRows ?? 100;
    const datasets = Array.isArray(args.datasets) && args.datasets.length > 0
      ? args.datasets
      : ["bidNotice"];

    let client;
    try {
      client = getApiClient();
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `sync failed: ${error instanceof Error ? error.message : "unknown error"}`
          }
        ]
      };
    }

    const tasks = [];
    const labels = [];
    const errors = [];

    if (datasets.includes("bidNotice")) {
      if (!args.fromDate || !args.toDate) {
        errors.push("bidNotice: fromDate/toDate are required (YYYYMMDDHHMM, max 1 month range)");
      } else {
        const rangeError = validateDateRange(args.fromDate, args.toDate, "month");
        if (rangeError) {
          errors.push(`bidNotice: ${rangeError}`);
        } else {
          labels.push("bidNotice");
          tasks.push(
            client.fetchBidNotices({
              pageNo,
              numOfRows,
              bidNtceBgnDt: args.fromDate,
              bidNtceEndDt: args.toDate
            })
          );
        }
      }
    }

    if (datasets.includes("successfulBid")) {
      if (!args.opengBgnDt || !args.opengEndDt || !args.bsnsDivCd) {
        errors.push(
          "successfulBid: opengBgnDt, opengEndDt (YYYYMMDDHHMM, max 1 week) and bsnsDivCd (1/2/3/5) are required"
        );
      } else {
        const rangeError = validateDateRange(args.opengBgnDt, args.opengEndDt, "week");
        if (rangeError) {
          errors.push(`successfulBid: ${rangeError}`);
        } else {
          labels.push("successfulBid");
          tasks.push(
            client.fetchSuccessfulBids({
              pageNo,
              numOfRows,
              bsnsDivCd: args.bsnsDivCd,
              opengBgnDt: args.opengBgnDt,
              opengEndDt: args.opengEndDt
            })
          );
        }
      }
    }

    if (datasets.includes("contract")) {
      if (!args.cntrctCnclsBgnDate || !args.cntrctCnclsEndDate) {
        errors.push(
          "contract: cntrctCnclsBgnDate, cntrctCnclsEndDate (YYYYMMDD, max 1 week) are required"
        );
      } else {
        const rangeError = validateDateRange(
          args.cntrctCnclsBgnDate,
          args.cntrctCnclsEndDate,
          "week"
        );
        if (rangeError) {
          errors.push(`contract: ${rangeError}`);
        } else {
          labels.push("contract");
          tasks.push(
            client.fetchContracts({
              pageNo,
              numOfRows,
              cntrctCnclsBgnDate: args.cntrctCnclsBgnDate,
              cntrctCnclsEndDate: args.cntrctCnclsEndDate,
              insttDivCd: args.insttDivCd,
              insttCd: args.insttCd
            })
          );
        }
      }
    }

    if (tasks.length === 0) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `sync failed: no valid dataset request. ${errors.join("; ")}`
          }
        ]
      };
    }

    let results;
    try {
      results = await Promise.all(tasks);
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `sync failed: ${error instanceof Error ? error.message : "unknown error"}`
          }
        ]
      };
    }

    const fetched = { bidNotice: 0, successfulBid: 0, contract: 0 };
    labels.forEach((label, idx) => {
      const items = results[idx] ?? [];
      fetched[label] = items.length;
      if (label === "bidNotice") store.upsertBidNotices(items);
      else if (label === "successfulBid") store.upsertSuccessfulBids(items);
      else if (label === "contract") store.upsertContracts(items);
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              message: "sync completed",
              datasetsRequested: datasets,
              datasetsFetched: labels,
              skipped: errors,
              fetched,
              totals: {
                bidNotice: store.bidNoticeMap.size,
                successfulBid: store.successfulBidMap.size,
                contract: store.contractMap.size
              }
            },
            null,
            2
          )
        }
      ]
    };
  }

  if (request.params.name === "search_notices") {
    const items = store.listBidNotices(args);
    return {
      content: [{ type: "text", text: JSON.stringify(items, null, 2) }]
    };
  }

  if (request.params.name === "get_timeline") {
    const timeline = store.getTimeline(args.noticeId);
    if (!timeline) {
      return {
        content: [{ type: "text", text: `No timeline found for noticeId=${args.noticeId}` }],
        isError: true
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(timeline, null, 2) }]
    };
  }

  if (request.params.name === "create_alert_rule") {
    const rule = store.createAlertRule(args);
    return {
      content: [{ type: "text", text: JSON.stringify(rule, null, 2) }]
    };
  }

  if (request.params.name === "list_alert_rules") {
    return {
      content: [{ type: "text", text: JSON.stringify(store.listAlertRules(), null, 2) }]
    };
  }

  if (request.params.name === "evaluate_alerts") {
    const events = store.evaluateAlertEvents();
    return {
      content: [{ type: "text", text: JSON.stringify(events, null, 2) }]
    };
  }

  return {
    isError: true,
    content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }]
  };
});

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "procurement://notices",
        name: "입찰공고 목록",
        mimeType: "application/json",
        description: "현재 저장된 입찰공고 전체 목록"
      },
      {
        uri: "procurement://alerts/rules",
        name: "알림 규칙 목록",
        mimeType: "application/json",
        description: "현재 등록된 알림 규칙"
      }
    ]
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri === "procurement://notices") {
    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: "application/json",
          text: JSON.stringify([...store.bidNoticeMap.values()], null, 2)
        }
      ]
    };
  }

  if (request.params.uri === "procurement://alerts/rules") {
    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: "application/json",
          text: JSON.stringify(store.listAlertRules(), null, 2)
        }
      ]
    };
  }

  if (request.params.uri.startsWith("procurement://timeline/")) {
    const noticeId = request.params.uri.replace("procurement://timeline/", "");
    const timeline = store.getTimeline(noticeId);
    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: "application/json",
          text: JSON.stringify(timeline ?? { message: "not found", noticeId }, null, 2)
        }
      ]
    };
  }

  return {
    contents: [
      {
        uri: request.params.uri,
        mimeType: "application/json",
        text: JSON.stringify({ message: "unsupported resource" })
      }
    ]
  };
});

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "daily_bid_summary",
        description: "오늘 신규 공고/개찰/계약 요약 생성 프롬프트",
        arguments: [
          { name: "date", description: "기준일(YYYY-MM-DD)", required: false },
          { name: "agency", description: "기관명 필터", required: false }
        ]
      }
    ]
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name !== "daily_bid_summary") {
    return {
      description: "unknown prompt",
      messages: [{ role: "user", content: { type: "text", text: "Unknown prompt name" } }]
    };
  }

  const date = request.params.arguments?.date ?? new Date().toISOString().slice(0, 10);
  const agency = request.params.arguments?.agency;

  return {
    description: "나라장터 일일 요약",
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `기준일 ${date}의 공공조달 데이터를 요약해줘. ${agency ? `기관 필터: ${agency}.` : ""}\n1) 신규 입찰공고\n2) 개찰/낙찰 현황\n3) 계약 체결 현황\n4) 주목할 리스크(금액 큰 건, 마감 임박)`
        }
      }
    ]
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});
