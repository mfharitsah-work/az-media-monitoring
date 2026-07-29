import { parseSemester, type AnalyticsRange, type DateRange } from "./types";

const JKT = "Asia/Jakarta";

/** YYYY-MM-DD from an ISO timestamp in Asia/Jakarta. */
export function jakartaDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: JKT });
}

/** Current Jakarta date as YYYY-MM-DD. */
export function todayJakarta(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: JKT });
}

/** Jakarta date N days before `now`, as YYYY-MM-DD. */
export function jakartaDateMinusDays(n: number, now: Date = new Date()): string {
  const [year, month, day] = todayJakarta(now).split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** First day of the current Jakarta month, as YYYY-MM-DD. */
export function thisMonthStartJakarta(now: Date = new Date()): string {
  return `${todayJakarta(now).slice(0, 8)}01`;
}

/**
 * List-page date window.
 *
 * Latest News = yesterday 00:00 WIB through now.
 */
export function articleDateInListRange(
  iso: string,
  range: DateRange,
  customDateFrom?: string,
  customDateTo?: string,
  nowMs = Date.now(),
): boolean {
  if (range.startsWith("h1-") || range.startsWith("h2-")) {
    return dateInAnalyticsRange(iso, range as AnalyticsRange, nowMs);
  }

  const now = new Date(nowMs);
  const articleDate = jakartaDate(iso);

  if (range === "all-time") return true;
  if (range === "latest") {
    return (
      articleDate >= jakartaDateMinusDays(1, now) &&
      articleDate <= todayJakarta(now) &&
      new Date(iso).getTime() <= nowMs
    );
  }
  if (range === "yesterday") {
    return articleDate === jakartaDateMinusDays(1, now);
  }
  if (range === "today") {
    return articleDate === todayJakarta(now) && new Date(iso).getTime() <= nowMs;
  }
  if (range === "last-7-days") {
    return (
      articleDate >= jakartaDateMinusDays(6, now) &&
      articleDate <= todayJakarta(now) &&
      new Date(iso).getTime() <= nowMs
    );
  }
  if (range === "this-month") {
    return (
      articleDate >= thisMonthStartJakarta(now) &&
      articleDate <= todayJakarta(now) &&
      new Date(iso).getTime() <= nowMs
    );
  }
  if (range === "custom") {
    if (customDateFrom && articleDate < customDateFrom) return false;
    if (customDateTo && articleDate > customDateTo) return false;
  }
  return true;
}

export function describeArticleListRange(
  range: DateRange,
  customDateFrom?: string,
  customDateTo?: string,
  now: Date = new Date(),
): string {
  if (range.startsWith("h1-") || range.startsWith("h2-")) {
    return "Semester range selected from analytics controls.";
  }

  if (range === "all-time") return "All stored articles.";

  if (range === "latest") {
    return formatDisplayWindow(jakartaDateMinusDays(1, now), "00:00", now);
  }

  if (range === "yesterday") {
    const date = jakartaDateMinusDays(1, now);
    return formatDisplayWindow(date, "00:00", date, "23:59");
  }

  if (range === "today") {
    return formatDisplayWindow(todayJakarta(now), "00:00", now);
  }

  if (range === "last-7-days") {
    return formatDisplayWindow(jakartaDateMinusDays(6, now), "00:00", now);
  }

  if (range === "this-month") {
    return formatDisplayWindow(thisMonthStartJakarta(now), "00:00", now);
  }

  const from = customDateFrom ?? customDateTo;
  const to = customDateTo ?? customDateFrom;
  if (from && to) return formatDisplayWindow(from, "00:00", to, "23:59");

  return "Custom date range selected.";
}

export function describeAnalyticsRange(
  range: AnalyticsRange,
  now: Date = new Date(),
): string {
  if (range === "last-7-days") {
    return formatDisplayWindow(jakartaDateMinusDays(6, now), "00:00", now);
  }

  if (range === "this-month") {
    return formatDisplayWindow(thisMonthStartJakarta(now), "00:00", now);
  }

  if (range === "all-time") return "All stored articles.";

  if (range.startsWith("h1-") || range.startsWith("h2-")) {
    const sem = parseSemester(range);
    if (!sem) return "Selected semester range.";
    const startMonth = sem.half === 1 ? "01-01" : "07-01";
    const endMonth = sem.half === 1 ? "06-30" : "12-31";
    return formatDisplayWindow(
      `${sem.year}-${startMonth}`,
      "00:00",
      `${sem.year}-${endMonth}`,
      "23:59",
    );
  }

  return "Selected analytics range.";
}

function formatDisplayWindow(
  startDate: string,
  startTime: string,
  end: string | Date,
  endTime?: string,
): string {
  const start = `${formatDateKey(startDate)}, ${startTime} WIB`;
  const finish =
    end instanceof Date
      ? formatDateTimeJakarta(end)
      : `${formatDateKey(end)}, ${endTime ?? "23:59"} WIB`;
  return `${start} - ${finish}`;
}

function formatDateKey(dateKey: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: JKT,
  }).format(new Date(`${dateKey}T12:00:00+07:00`));
}

function formatDateTimeJakarta(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: JKT,
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("day")} ${value("month")} ${value("year")}, ${value(
    "hour",
  )}:${value("minute")} WIB`;
}

/**
 * Analytics date window.
 *
 * Range can be "last-7-days", "this-month", "all-time", or semester keys.
 */
export function dateInAnalyticsRange(
  iso: string,
  range: AnalyticsRange,
  nowMs = Date.now(),
): boolean {
  if (range === "all-time") return true;
  if (range === "last-7-days") {
    return (
      jakartaDate(iso) >= jakartaDateMinusDays(6, new Date(nowMs)) &&
      new Date(iso).getTime() <= nowMs
    );
  }
  if (range === "this-month") {
    return (
      jakartaDate(iso) >= thisMonthStartJakarta(new Date(nowMs)) &&
      new Date(iso).getTime() <= nowMs
    );
  }

  const sem = parseSemester(range);
  if (!sem) return false;

  const d = jakartaDate(iso);
  const startMonth = sem.half === 1 ? "01-01" : "07-01";
  const endMonth = sem.half === 1 ? "06-30" : "12-31";
  return d >= `${sem.year}-${startMonth}` && d <= `${sem.year}-${endMonth}`;
}
