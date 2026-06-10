const DATE_DIGITS = /\D/g;

export function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === null || value === undefined) {
    return [];
  }
  return [value];
}export function firstNonEmpty(obj, keys, fallback = null) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return fallback;
}

export function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  const digits = raw.replace(DATE_DIGITS, "");
  if (!digits) {
    return null;
  }

  if (digits.length === 8) {
    const yyyy = digits.slice(0, 4);
    const mm = digits.slice(4, 6);
    const dd = digits.slice(6, 8);
    return `${yyyy}-${mm}-${dd}T00:00:00+09:00`;
  }

  if (digits.length === 12 || digits.length === 14) {
    const yyyy = digits.slice(0, 4);
    const mm = digits.slice(4, 6);
    const dd = digits.slice(6, 8);
    const hh = digits.slice(8, 10);
    const mi = digits.slice(10, 12);
    const ss = digits.length === 14 ? digits.slice(12, 14) : "00";
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+09:00`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

export function containsIgnoreCase(haystack, needle) {
  if (!needle) {
    return true;
  }
  if (!haystack) {
    return false;
  }
  return String(haystack).toLowerCase().includes(String(needle).toLowerCase());
}

export function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

/**
 * Parse YYYYMMDD(HHMM)? into UTC Date.
 * Accepts 8-digit (YYYYMMDD) or 12-digit (YYYYMMDDHHMM) strings.
 * Returns null on invalid input.
 */
export function parseG2BDate(value) {
  if (value === null || value === undefined) return null;
  const digits = String(value).replace(DATE_DIGITS, "");
  if (digits.length !== 8 && digits.length !== 12) return null;

  const yyyy = Number(digits.slice(0, 4));
  const mm = Number(digits.slice(4, 6));
  const dd = Number(digits.slice(6, 8));
  const hh = digits.length === 12 ? Number(digits.slice(8, 10)) : 0;
  const mi = digits.length === 12 ? Number(digits.slice(10, 12)) : 0;

  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || hh > 23 || mi > 59) return null;
  const date = new Date(Date.UTC(yyyy, mm - 1, dd, hh, mi, 0));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/**
 * Validate date range constraint per G2B API spec.
 * @param {string} bgn - start date (YYYYMMDD or YYYYMMDDHHMM)
 * @param {string} end - end date (same format as bgn)
 * @param {"month"|"week"} limit - "month" (input bid) or "week" (success/contract)
 * @returns {string|null} error message, or null if valid
 */
export function validateDateRange(bgn, end, limit) {
  const bgnDate = parseG2BDate(bgn);
  const endDate = parseG2BDate(end);
  if (!bgnDate) return `invalid date format: ${bgn} (expected YYYYMMDD or YYYYMMDDHHMM)`;
  if (!endDate) return `invalid date format: ${end} (expected YYYYMMDD or YYYYMMDDHHMM)`;
  if (endDate.getTime() < bgnDate.getTime()) {
    return `date range invalid: end (${end}) is before start (${bgn})`;
  }
  const diffMs = endDate.getTime() - bgnDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (limit === "month") {
    // G2B spec: bid notice 최대 1개월(31일까지 허용)
    if (diffDays > 31) {
      return `date range exceeds 1 month limit: ${diffDays.toFixed(1)} days (max 31 days)`;
    }
  } else if (limit === "week") {
    // G2B spec: 낙찰/계약 최대 1주일(7일까지 허용)
    if (diffDays > 7) {
      return `date range exceeds 1 week limit: ${diffDays.toFixed(1)} days (max 7 days)`;
    }
  }
  return null;
}
