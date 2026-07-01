"use client";

import { useEffect, useMemo, useState } from "react";
import { Mail, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildEmailTemplate,
  normalizeRecipientList,
  RECIPIENT_CC,
  RECIPIENT_TO,
  type SenderInfo,
} from "@/lib/email-template";
import type { Article, DigestDateRange } from "@/lib/types";

const SENDER_STORAGE_KEY = "az-digest-sender";
const RECIPIENT_STORAGE_KEY = "az-digest-recipients";
const EMPTY_SENDER: SenderInfo = { name: "", jobTitle: "", email: "" };
const DEFAULT_RANGES: DigestDateRange[] = ["yesterday"];

interface RecipientDraft {
  to: string;
  cc: string;
}

type ArticleGroups = Record<DigestDateRange, Article[]>;

const DIGEST_OPTIONS: {
  value: DigestDateRange;
  label: string;
  description: (today: Date) => string;
}[] = [
  {
    value: "yesterday",
    label: "Yesterday news",
    description: (today) =>
      `${formatDate(addDays(today, -1))}, 00:00-23:59 WIB`,
  },
  {
    value: "today",
    label: "Today news",
    description: (today) => `${formatDate(today)}, 00:00-now WIB`,
  },
  {
    value: "latest",
    label: "Yesterday + today",
    description: (today) =>
      `${formatDate(addDays(today, -1))} 00:00 - ${formatDate(today)} now WIB`,
  },
];

/**
 * Tombol untuk menyusun email digest harian.
 *
 * Flow: copy rich HTML digest ke clipboard, lalu buka Outlook via mailto.
 * Body mailto hanya instruksi singkat karena HTML table harus masuk lewat paste.
 */
export function EmailDigestButton({
  articleGroups,
}: {
  articleGroups: ArticleGroups;
}) {
  const today = useMemo(() => todayInJakarta(), []);
  const [open, setOpen] = useState(false);
  const [sender, setSender] = useState<SenderInfo>(readStoredSender);
  const [recipients, setRecipients] =
    useState<RecipientDraft>(readStoredRecipients);
  const [selectedRanges, setSelectedRanges] =
    useState<DigestDateRange[]>(DEFAULT_RANGES);
  const [subjectOverride, setSubjectOverride] = useState<string | null>(null);

  const selectedArticles = useMemo(
    () => collectArticles(articleGroups, selectedRanges),
    [articleGroups, selectedRanges],
  );
  const dateLabel = useMemo(
    () => digestDateLabel(selectedRanges, today),
    [selectedRanges, today],
  );
  const subject = subjectOverride ?? defaultSubject(selectedRanges, today);
  const template = buildEmailTemplate(selectedArticles, sender, {
    to: recipients.to,
    cc: recipients.cc,
    subject,
    dateLabel,
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const updateSender = (patch: Partial<SenderInfo>) => {
    const next = { ...sender, ...patch };
    setSender(next);
    try {
      localStorage.setItem(SENDER_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore localStorage quota errors.
    }
  };

  const updateRecipients = (patch: Partial<RecipientDraft>) => {
    const next = { ...recipients, ...patch };
    setRecipients(next);
    try {
      localStorage.setItem(RECIPIENT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore localStorage quota errors.
    }
  };

  const toggleRange = (range: DigestDateRange) => {
    setSelectedRanges((current) => {
      if (current.includes(range)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== range);
      }
      return [...current, range];
    });
  };

  const pasteToOutlook = async () => {
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([template.html], { type: "text/html" }),
            "text/plain": new Blob([template.body], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(template.body);
      }
    } catch {
      // Clipboard can be blocked by browser policy; still open Outlook.
    }
    window.location.href = template.mailtoUrl;
    setOpen(false);
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <Mail className="h-4 w-4" />
        Compose Digest Email
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Compose digest email"
        >
          <div
            className="my-auto w-full max-w-3xl rounded-lg border bg-background shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between rounded-t-lg px-5 py-3"
              style={{ backgroundColor: "var(--brand-mulberry)" }}
            >
              <h2 className="flex items-center gap-2 font-semibold text-white">
                <Mail className="h-4 w-4" />
                Compose Daily Digest Email
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded p-1 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <ol className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                <li>
                  <strong className="text-foreground">1.</strong> Klik{" "}
                  <strong className="text-foreground">Paste to Outlook</strong>.
                </li>
                <li>
                  <strong className="text-foreground">2.</strong> Di body email Outlook:
                  tekan <strong className="text-foreground">Ctrl+A</strong> lalu{" "}
                  <strong className="text-foreground">Ctrl+V</strong>.
                </li>
              </ol>

              <div className="grid gap-3 sm:grid-cols-2">
                <EmailField
                  label="To"
                  value={recipients.to}
                  placeholder={RECIPIENT_TO}
                  onChange={(v) => updateRecipients({ to: v })}
                />
                <EmailField
                  label="CC"
                  value={recipients.cc}
                  placeholder={`${RECIPIENT_CC}; another@astrazeneca.com`}
                  multiline
                  onChange={(v) => updateRecipients({ cc: v })}
                />
                <div className="sm:col-span-2">
                  <EmailField
                    label="Subject"
                    value={subject}
                    placeholder={defaultSubject(selectedRanges, today)}
                    onChange={(v) => {
                      setSubjectOverride(v);
                    }}
                  />
                </div>
              </div>

              <div className="space-y-2 rounded-md border p-3">
                <span className="block text-xs font-medium text-muted-foreground">
                  News period
                </span>
                <div className="grid gap-2 sm:grid-cols-3">
                  {DIGEST_OPTIONS.map((option) => {
                    const checked = selectedRanges.includes(option.value);
                    return (
                      <label
                        key={option.value}
                        className={`rounded-md border p-3 text-sm transition-colors ${
                          checked ? "border-primary bg-accent" : "hover:bg-muted/60"
                        }`}
                      >
                        <span className="flex items-center gap-2 font-medium">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleRange(option.value)}
                            className="size-4 accent-[var(--brand-mulberry)]"
                          />
                          {option.label}
                        </span>
                        {checked && (
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {option.description(today)}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <SenderField
                  label="Your Name"
                  value={sender.name}
                  placeholder="Mutiara Tsabitah"
                  onChange={(v) => updateSender({ name: v })}
                />
                <SenderField
                  label="Job Title"
                  value={sender.jobTitle}
                  placeholder="Communication Associate"
                  onChange={(v) => updateSender({ jobTitle: v })}
                />
                <SenderField
                  label="Your Email"
                  value={sender.email}
                  placeholder="you@astrazeneca.com"
                  onChange={(v) => updateSender({ email: v })}
                />
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Preview ({selectedArticles.length} article
                  {selectedArticles.length === 1 ? "" : "s"}, {dateLabel})
                </span>
                <div
                  className="max-h-72 overflow-auto rounded-md border bg-white p-3"
                  dangerouslySetInnerHTML={{ __html: template.html }}
                />
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={pasteToOutlook} className="gap-2">
                  <Send className="h-4 w-4" />
                  Paste to Outlook
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function collectArticles(
  groups: ArticleGroups,
  selectedRanges: DigestDateRange[],
): Article[] {
  const byId = new Map<string, Article>();
  for (const range of selectedRanges) {
    for (const article of groups[range]) {
      if (!byId.has(article.id)) byId.set(article.id, article);
    }
  }
  return [...byId.values()].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

function readStoredSender(): SenderInfo {
  if (typeof window === "undefined") return EMPTY_SENDER;
  try {
    const saved = window.localStorage.getItem(SENDER_STORAGE_KEY);
    return saved ? { ...EMPTY_SENDER, ...JSON.parse(saved) } : EMPTY_SENDER;
  } catch {
    return EMPTY_SENDER;
  }
}

function readStoredRecipients(): RecipientDraft {
  const fallback = { to: RECIPIENT_TO, cc: RECIPIENT_CC };
  if (typeof window === "undefined") return fallback;
  try {
    const saved = window.localStorage.getItem(RECIPIENT_STORAGE_KEY);
    return saved ? { ...fallback, ...JSON.parse(saved) } : fallback;
  } catch {
    return fallback;
  }
}

function defaultSubject(ranges: DigestDateRange[], today: Date): string {
  return `AZ Daily Media Monitoring - ${digestDateLabel(ranges, today)}`;
}

function digestDateLabel(ranges: DigestDateRange[], today: Date): string {
  if (ranges.length === 1) {
    if (ranges[0] === "yesterday") {
      return `Yesterday News - ${formatDate(addDays(today, -1))}`;
    }
    if (ranges[0] === "today") {
      return `Today News - ${formatDate(today)}`;
    }
    return `Latest News - ${formatDate(addDays(today, -1))} to ${formatDate(today)}`;
  }

  const sorted = [...ranges].sort();
  return `Selected News (${sorted.join(", ")}) - ${formatDate(addDays(today, -1))} to ${formatDate(today)}`;
}

function todayInJakarta(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts();
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return new Date(value("year"), value("month") - 1, value("day"));
}

function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function EmailField({
  label,
  value,
  placeholder,
  multiline,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  multiline?: boolean;
  onChange: (v: string) => void;
}) {
  const normalized = label === "CC" ? normalizeRecipientList(value) : value.trim();
  return (
    <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
      <span className="block">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          placeholder={placeholder}
          rows={2}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-16 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
        />
      ) : (
        <Input
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {label === "CC" && normalized && (
        <span className="block truncate text-[11px] font-normal text-muted-foreground">
          {normalized}
        </span>
      )}
    </label>
  );
}

function SenderField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
      <span className="block">{label}</span>
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
