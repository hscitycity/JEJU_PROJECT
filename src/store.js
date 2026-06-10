import { containsIgnoreCase } from "./utils.js";

export class ProcurementStore {
  constructor() {
    this.bidNoticeMap = new Map();
    this.successfulBidMap = new Map();
    this.contractMap = new Map();
    this.alertRuleMap = new Map();
    this.alertEventMap = new Map();
  }

  upsertBidNotices(items) {
    for (const item of items) {
      const key = item.noticeId ?? this.#fallbackKey(item.raw);
      this.bidNoticeMap.set(key, item);
    }
  }

  upsertSuccessfulBids(items) {
    for (const item of items) {
      const key = `${item.noticeId ?? "unknown"}:${item.successfulBidId ?? this.#fallbackKey(item.raw)}`;
      this.successfulBidMap.set(key, item);
    }
  }

  upsertContracts(items) {
    for (const item of items) {
      const key = `${item.noticeId ?? "unknown"}:${item.contractId ?? this.#fallbackKey(item.raw)}`;
      this.contractMap.set(key, item);
    }
  }

  listBidNotices({ keyword, agency, fromDate, toDate, limit = 20 } = {}) {
    const rows = [...this.bidNoticeMap.values()].filter((row) => {
      if (keyword && !containsIgnoreCase(row.noticeName, keyword) && !containsIgnoreCase(row.noticeId, keyword)) {
        return false;
      }
      if (agency && !containsIgnoreCase(row.agencyName, agency)) {
        return false;
      }
      if (fromDate && row.bidPublishedAt && row.bidPublishedAt < fromDate) {
        return false;
      }
      if (toDate && row.bidPublishedAt && row.bidPublishedAt > toDate) {
        return false;
      }
      return true;
    });

    return rows.slice(0, Math.max(1, Math.min(limit, 200)));
  }

  getTimeline(noticeId) {
    const notice = [...this.bidNoticeMap.values()].find((row) => row.noticeId === noticeId);
    if (!notice) {
      return null;
    }

    const successfulBids = [...this.successfulBidMap.values()].filter((row) => row.noticeId === noticeId);
    const contracts = [...this.contractMap.values()].filter((row) => row.noticeId === noticeId);

    return {
      notice,
      successfulBids,
      contracts
    };
  }

  createAlertRule(rule) {
    const id = `rule_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const row = { id, createdAt: new Date().toISOString(), ...rule };
    this.alertRuleMap.set(id, row);
    return row;
  }

  listAlertRules() {
    return [...this.alertRuleMap.values()];
  }

  evaluateAlertEvents() {
    const events = [];
    for (const rule of this.alertRuleMap.values()) {
      for (const notice of this.bidNoticeMap.values()) {
        if (rule.keyword && !containsIgnoreCase(notice.noticeName, rule.keyword) && !containsIgnoreCase(notice.noticeId, rule.keyword)) {
          continue;
        }
        if (rule.agency && !containsIgnoreCase(notice.agencyName, rule.agency)) {
          continue;
        }
        if (rule.minAmount && (!notice.amount || notice.amount < Number(rule.minAmount))) {
          continue;
        }

        const dedupeKey = `${rule.id}:${notice.noticeId}`;
        if (this.alertEventMap.has(dedupeKey)) {
          continue;
        }

        const event = {
          dedupeKey,
          ruleId: rule.id,
          channel: rule.channel,
          target: rule.target,
          noticeId: notice.noticeId,
          noticeName: notice.noticeName,
          agencyName: notice.agencyName,
          createdAt: new Date().toISOString()
        };

        this.alertEventMap.set(dedupeKey, event);
        events.push(event);
      }
    }

    return events;
  }

  #fallbackKey(raw) {
    return JSON.stringify(raw);
  }
}
