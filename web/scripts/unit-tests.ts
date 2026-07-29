import assert from "node:assert/strict";

import {
  articleDateInListRange,
  dateInAnalyticsRange,
  describeAnalyticsRange,
  describeArticleListRange,
  jakartaDate,
} from "../src/lib/date-ranges";
import {
  buildEmailTemplate,
  normalizeRecipientList,
  type SenderInfo,
} from "../src/lib/email-template";
import type { Article } from "../src/lib/types";

function testDateRanges() {
  const nowMs = Date.parse("2026-07-08T05:00:00.000Z"); // 12:00 WIB, 8 July 2026

  assert.equal(jakartaDate("2026-07-07T17:30:00.000Z"), "2026-07-08");

  assert.equal(
    articleDateInListRange("2026-07-06T17:00:00.000Z", "yesterday", undefined, undefined, nowMs),
    true,
    "yesterday includes 00:00 WIB yesterday",
  );
  assert.equal(
    articleDateInListRange("2026-07-07T16:59:59.000Z", "yesterday", undefined, undefined, nowMs),
    true,
    "yesterday includes 23:59 WIB yesterday",
  );
  assert.equal(
    articleDateInListRange("2026-07-07T17:00:00.000Z", "today", undefined, undefined, nowMs),
    true,
    "today includes 00:00 WIB today",
  );
  assert.equal(
    articleDateInListRange("2026-07-08T06:00:00.000Z", "today", undefined, undefined, nowMs),
    false,
    "today excludes future articles later than now",
  );
  assert.equal(
    articleDateInListRange("2026-07-06T17:00:00.000Z", "latest", undefined, undefined, nowMs),
    true,
    "latest includes yesterday 00:00 WIB through now",
  );
  assert.equal(
    articleDateInListRange("2026-07-06T16:59:59.000Z", "latest", undefined, undefined, nowMs),
    false,
    "latest excludes articles before yesterday 00:00 WIB",
  );
  assert.equal(
    articleDateInListRange("2026-07-08T06:00:00.000Z", "latest", undefined, undefined, nowMs),
    false,
    "latest excludes future articles later than now",
  );
  assert.equal(
    articleDateInListRange(
      "2026-06-30T17:00:00.000Z",
      "this-month",
      undefined,
      undefined,
      nowMs,
    ),
    true,
    "this-month includes 00:00 WIB on the first day of the month",
  );
  assert.equal(
    articleDateInListRange(
      "2026-06-30T16:59:59.000Z",
      "this-month",
      undefined,
      undefined,
      nowMs,
    ),
    false,
    "this-month excludes articles before the current Jakarta month",
  );
  assert.equal(
    articleDateInListRange(
      "2026-07-08T06:00:00.000Z",
      "last-7-days",
      undefined,
      undefined,
      nowMs,
    ),
    false,
    "last-7-days excludes future articles later than now",
  );
  assert.equal(
    describeArticleListRange("this-month", undefined, undefined, new Date(nowMs)),
    "1 Jul 2026, 00:00 WIB - 8 Jul 2026, 12:00 WIB",
    "this-month summary exposes the exact Jakarta date-time window",
  );
  assert.equal(
    articleDateInListRange("2026-07-03T03:00:00.000Z", "custom", "2026-07-03", "2026-07-05", nowMs),
    true,
    "custom range is inclusive",
  );
  assert.equal(
    dateInAnalyticsRange("2026-06-30T16:59:59.000Z", "h1-2026", nowMs),
    true,
    "H1 analytics uses Jakarta date boundaries",
  );
  assert.equal(
    dateInAnalyticsRange("2026-06-30T17:00:00.000Z", "h1-2026", nowMs),
    false,
    "H1 excludes 1 July WIB",
  );
  assert.equal(
    dateInAnalyticsRange("2026-06-30T17:00:00.000Z", "this-month", nowMs),
    true,
    "analytics this-month includes 00:00 WIB on the first day of the month",
  );
  assert.equal(
    dateInAnalyticsRange("2026-07-08T06:00:00.000Z", "this-month", nowMs),
    false,
    "analytics this-month excludes future articles later than now",
  );
  assert.equal(
    describeAnalyticsRange("last-7-days", new Date(nowMs)),
    "2 Jul 2026, 00:00 WIB - 8 Jul 2026, 12:00 WIB",
    "analytics range summary exposes the exact Jakarta date-time window",
  );
}

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: "a1",
    headline: "AstraZeneca expands access",
    headline_id: "AstraZeneca perluas akses",
    url: "https://www.example.com/news/a1",
    date: "2026-07-07T03:00:00.000Z",
    source: "Example",
    summary: "AstraZeneca expands access to treatment.",
    summary_id: "AstraZeneca memperluas akses pengobatan.",
    category: "About AstraZeneca",
    subcategory: "AZ Focus",
    sentiment: "Positive",
    keywords: "AstraZeneca, access",
    keywords_id: "AstraZeneca, akses",
    city: "Jakarta",
    province: "DKI Jakarta",
    language: "en",
    scraped_at: "2026-07-08T05:00:00.000Z",
    ...overrides,
  };
}

function testOutlookComposeEncoding() {
  const sender: SenderInfo = {
    name: "Mutiara Tsabitah",
    jobTitle: "Communication Associate",
    email: "mutiara@example.com",
  };

  assert.equal(
    normalizeRecipientList("a@example.com; b@example.com\nc@example.com"),
    "a@example.com,b@example.com,c@example.com",
  );

  const template = buildEmailTemplate([article()], sender, {
    to: "a@example.com; b@example.com",
    cc: "c@example.com\nd@example.com",
    subject: "AZ Daily Media Monitoring - Yesterday News - 7 July 2026",
    dateLabel: "Yesterday News - 7 July 2026",
  });

  assert.equal(template.to, "a@example.com,b@example.com");
  assert.equal(template.cc, "c@example.com,d@example.com");
  assert.equal(template.mailtoUrl.includes("+"), false, "mailto must not contain + for spaces");
  assert.equal(
    template.mailtoUrl.startsWith("mailto:a@example.com,b@example.com?"),
    true,
  );

  const query = template.mailtoUrl.split("?")[1] ?? "";
  const params = new URLSearchParams(query);
  assert.equal(params.get("subject"), "AZ Daily Media Monitoring - Yesterday News - 7 July 2026");
  assert.equal(params.get("cc"), "c@example.com,d@example.com");
  assert.equal(
    params.get("body"),
    "[ Paste the email digest here - press Ctrl+A then Ctrl+V to replace this text with the formatted table copied to your clipboard ]",
  );
}

testDateRanges();
testOutlookComposeEncoding();

console.log("[OK] TypeScript unit tests passed.");
