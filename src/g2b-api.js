import { firstNonEmpty, normalizeDate, toArray, toNumber } from "./utils.js";

const ENDPOINTS = {
  bidNotice: "/getDataSetOpnStdBidPblancInfo",
  successfulBid: "/getDataSetOpnStdScsbidInfo",
  contract: "/getDataSetOpnStdCntrctInfo"
};

export class G2BApiClient {
  constructor({ baseUrl, serviceKey, timeoutMs = 15000 }) {
    if (!baseUrl) {
      throw new Error("PUBLIC_PROCUREMENT_BASE_URL is required");
    }
    if (!serviceKey) {
      throw new Error("PUBLIC_PROCUREMENT_SERVICE_KEY is required");
    }

    this.baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    this.serviceKey = serviceKey;
    this.timeoutMs = timeoutMs;
  }

  /**
   * 입찰공고정보 조회 (PubDataOpnStdService.getDataSetOpnStdBidPblancInfo)
   * Required: bidNtceBgnDt, bidNtceEndDt (YYYYMMDDHHMM, max 1 month range)
   */
  async fetchBidNotices({ pageNo = 1, numOfRows = 100, bidNtceBgnDt, bidNtceEndDt } = {}) {
    const items = await this.#fetchEndpoint(ENDPOINTS.bidNotice, {
      pageNo,
      numOfRows,
      bidNtceBgnDt,
      bidNtceEndDt
    });
    return items.map((item) => normalizeBidNotice(item));
  }

  /**
   * 낙찰정보 조회 (PubDataOpnStdService.getDataSetOpnStdScsbidInfo)
   * Required: bsnsDivCd, opengBgnDt, opengEndDt (YYYYMMDDHHMM, max 1 week range)
   * bsnsDivCd: 1=물품, 2=외자, 3=공사, 5=용역
   */
  async fetchSuccessfulBids({ pageNo = 1, numOfRows = 100, bsnsDivCd, opengBgnDt, opengEndDt } = {}) {
    const items = await this.#fetchEndpoint(ENDPOINTS.successfulBid, {
      pageNo,
      numOfRows,
      bsnsDivCd,
      opengBgnDt,
      opengEndDt
    });
    return items.map((item) => normalizeSuccessfulBid(item));
  }

  /**
   * 계약정보 조회 (PubDataOpnStdService.getDataSetOpnStdCntrctInfo)
   * Required: cntrctCnclsBgnDate, cntrctCnclsEndDate (YYYYMMDD, max 1 week range)
   */
  async fetchContracts({
    pageNo = 1,
    numOfRows = 100,
    cntrctCnclsBgnDate,
    cntrctCnclsEndDate,
    insttDivCd,
    insttCd
  } = {}) {
    const items = await this.#fetchEndpoint(ENDPOINTS.contract, {
      pageNo,
      numOfRows,
      cntrctCnclsBgnDate,
      cntrctCnclsEndDate,
      insttDivCd,
      insttCd
    });
    return items.map((item) => normalizeContract(item));
  }

  async #fetchEndpoint(path, params) {
    const url = new URL(`${this.baseUrl}${path}`);
    const merged = {
      type: "json",
      ...params,
      ServiceKey: this.serviceKey
    };

    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== null && String(value) !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });
      const text = await response.text();

      if (!response.ok) {
        throw new Error(`G2B API error: ${response.status} ${response.statusText}`);
      }

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("Expected JSON response. Verify API encoding/type parameter and service key.");
      }

      const errorHeader = parsed?.["nkoneps.com.response.ResponseError"]?.header;
      if (errorHeader) {
        throw new Error(
          `G2B API error: resultCode=${errorHeader.resultCode}, resultMsg=${errorHeader.resultMsg}`
        );
      }

      const header = parsed?.response?.header;
      if (header && header.resultCode && header.resultCode !== "00") {
        throw new Error(`G2B API error: resultCode=${header.resultCode}, resultMsg=${header.resultMsg}`);
      }

      const body = parsed?.response?.body ?? parsed?.body ?? parsed;
      const rawItems = body?.items?.item ?? body?.items ?? [];
      return toArray(rawItems);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function normalizeBidNotice(item) {
  return {
    dataset: "bidNotice",
    noticeId: firstNonEmpty(item, ["bidNtceNo", "ntceNo", "pblancNo", "noticeNo"]),
    noticeName: firstNonEmpty(item, ["bidNtceNm", "ntceNm", "noticeTitle", "bsnsDivNm"]),
    agencyName: firstNonEmpty(item, ["dminsttNm", "dmndInsttNm", "ntceInsttNm"]),
    bidPublishedAt: normalizeDate(firstNonEmpty(item, ["bidNtceDate", "bidNtceDt", "ntceDt", "pblancDt"])),
    bidOpeningAt: normalizeDate(firstNonEmpty(item, ["opengDate", "opengDt", "bidwinnrDcsnDt"])),
    amount: toNumber(firstNonEmpty(item, ["asignBdgtAmt", "presmptPrce", "totPrce"])),
    status: firstNonEmpty(item, ["bidNtceSttusNm", "sttusNm", "progrsSttus"]),
    raw: item
  };
}

function normalizeSuccessfulBid(item) {
  return {
    dataset: "successfulBid",
    noticeId: firstNonEmpty(item, ["bidNtceNo", "ntceNo", "pblancNo", "noticeNo"]),
    successfulBidId: firstNonEmpty(item, ["scsbidNo", "bidwinnrNo", "bfSpecRgstNo"]),
    winnerName: firstNonEmpty(item, [
      "fnlSucsfCorpNm",
      "bidprcCorpNm",
      "bidwinnrNm",
      "cntrctEntrpsNm",
      "sbidCorpNm"
    ]),
    agencyName: firstNonEmpty(item, ["dminsttNm", "dmndInsttNm", "ntceInsttNm"]),
    bidOpeningAt: normalizeDate(firstNonEmpty(item, ["opengDate", "opengDt", "bidwinnrDcsnDt"])),
    successfulBidAt: normalizeDate(firstNonEmpty(item, ["fnlSucsfDate", "scsbidDt", "bidwinnrDcsnDt"])),
    amount: toNumber(firstNonEmpty(item, ["fnlSucsfAmt", "bidprcAmt", "scsbidAmt", "bidwinnrAmt", "totPrce"])),
    raw: item
  };
}

function normalizeContract(item) {
  return {
    dataset: "contract",
    noticeId: firstNonEmpty(item, ["bidNtceNo", "ntceNo", "pblancNo", "noticeNo"]),
    contractId: firstNonEmpty(item, ["cntrctNo", "untyCntrctNo", "cntrctRefNo"]),
    contractorName: firstNonEmpty(item, ["rprsntCorpNm", "cntrctEntrpsNm", "entrpsNm", "bidwinnrNm"]),
    agencyName: firstNonEmpty(item, ["cntrctInsttNm", "dminsttNm", "dmndInsttNm"]),
    contractSignedAt: normalizeDate(firstNonEmpty(item, ["cntrctCnclsDate", "cntrctDate", "cntrctDt"])),
    amount: toNumber(firstNonEmpty(item, ["cntrctAmt", "ttalCntrctAmt", "totPrce", "cntrctPrce"])),
    raw: item
  };
}
