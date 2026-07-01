"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, Search, X } from "lucide-react";
import { DayPicker, type DateRange as PickerDateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArticleCategorySchema,
  SUBCATEGORIES_BY_CATEGORY,
  type ArticleCategory,
} from "@/lib/types";

/**
 * Category options — di-derive dari Zod schema agar selalu sinkron dengan types.ts.
 */
const CATEGORY_OPTIONS = [
  { value: "all", label: "All categories" },
  ...ArticleCategorySchema.options.map((c) => ({ value: c, label: c })),
] as const;

const SENTIMENT_OPTIONS = [
  { value: "all", label: "All sentiments" },
  { value: "Positive", label: "Positive" },
  { value: "Neutral", label: "Neutral" },
  { value: "Negative", label: "Negative" },
] as const;

function isCategory(s: string | null): s is ArticleCategory {
  return s !== null && (ArticleCategorySchema.options as readonly string[]).includes(s);
}

/** Param yang dianggap "filter" (range tab tidak termasuk — itu periode). */
const FILTER_KEYS = [
  "q",
  "category",
  "subcategory",
  "sentiment",
  "date",
  "from",
  "to",
] as const;

/**
 * Filter bar untuk All News page. State sepenuhnya di URL searchParams.
 *
 * Inputs CONTROLLED (value dari searchParams) supaya tombol "Clear filters"
 * benar-benar mereset tampilan input — bukan cuma URL. Search pakai local
 * state agar ketikan responsif, di-sync balik dari URL saat navigasi
 * eksternal (mis. klik Clear).
 */
export function NewsFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [q, setOptimisticQ] = useOptimistic(searchParams.get("q") ?? "");

  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === "" || value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.delete("page"); // reset pagination saat filter berubah
    startTransition(() => {
      router.replace(`?${params.toString()}`, { scroll: false });
    });
  };

  const clearFilters = () => {
    // Buang semua filter, pertahankan tab range (periode bukan filter).
    const params = new URLSearchParams();
    const range = searchParams.get("range");
    if (range) params.set("range", range);
    startTransition(() => {
      setOptimisticQ("");
      router.replace(params.toString() ? `?${params.toString()}` : "?", {
        scroll: false,
      });
    });
  };

  const setSearch = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("q", value);
    } else {
      params.delete("q");
    }
    params.delete("page");
    startTransition(() => {
      setOptimisticQ(value);
      router.replace(`?${params.toString()}`, { scroll: false });
    });
  };

  const hasActiveFilters = FILTER_KEYS.some((k) => !!searchParams.get(k));

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]">
        <FilterField label="Search" htmlFor="news-search">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="news-search"
              type="search"
              placeholder="Headline, summary, or keyword..."
              value={q}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </FilterField>

        <FilterField label="Category">
          <Select
            value={searchParams.get("category") ?? "all"}
            onValueChange={(v) => {
              // Update category + clear subcategory dalam SATU navigation.
              // Dua panggilan setParam berturut-turut akan saling override
              // karena keduanya baca snapshot searchParams yang sama.
              const params = new URLSearchParams(searchParams.toString());
              if (!v || v === "all") {
                params.delete("category");
              } else {
                params.set("category", v);
              }
              params.delete("subcategory");
              params.delete("page");
              startTransition(() => {
                router.replace(`?${params.toString()}`, { scroll: false });
              });
            }}
          >
            <SelectTrigger className="w-full lg:w-[190px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        {/* Subcategory cascading: hanya muncul kalau kategori yg dipilih
            punya subkategori. Crisis & Disruption standalone → dropdown
            ini di-hide. */}
        {(() => {
          const selectedCat = searchParams.get("category");
          if (!isCategory(selectedCat)) return null;
          const subs = SUBCATEGORIES_BY_CATEGORY[selectedCat];
          if (subs.length === 0) return null;
          return (
            <FilterField label="Subcategory">
              <Select
                value={searchParams.get("subcategory") ?? "all"}
                onValueChange={(v) => setParam("subcategory", v)}
              >
                <SelectTrigger className="w-full lg:w-[210px]">
                  <SelectValue placeholder="Subcategory" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{`All ${selectedCat} subcategories`}</SelectItem>
                  {subs.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
          );
        })()}

        <FilterField label="Sentiment">
          <Select
            value={searchParams.get("sentiment") ?? "all"}
            onValueChange={(v) => setParam("sentiment", v)}
          >
            <SelectTrigger className="w-full lg:w-[150px]">
              <SelectValue placeholder="Sentiment" />
            </SelectTrigger>
            <SelectContent>
              {SENTIMENT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Date range" htmlFor="news-date-range">
          <DateRangePicker />
        </FilterField>
      </div>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearFilters}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <X className="h-3.5 w-3.5" />
          Clear filters
        </button>
      )}
    </div>
  );
}

function DateRangePicker() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PickerDateRange | undefined>(() =>
    rangeFromParams(searchParams),
  );

  const appliedRange = rangeFromParams(searchParams);
  const today = todayInJakarta();

  const applyRange = () => {
    if (!draft?.from) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("from", toIsoDate(draft.from));
    params.set("to", toIsoDate(draft.to ?? draft.from));
    params.delete("date");
    params.delete("range");
    params.delete("page");
    setOpen(false);
    startTransition(() => {
      router.replace(`?${params.toString()}`, { scroll: false });
    });
  };

  const clearRange = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("from");
    params.delete("to");
    params.delete("date");
    params.delete("page");
    setDraft(undefined);
    setOpen(false);
    startTransition(() => {
      router.replace(params.toString() ? `?${params.toString()}` : "?", {
        scroll: false,
      });
    });
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setDraft(appliedRange);
        setOpen(nextOpen);
      }}
    >
      <PopoverTrigger
        id="news-date-range"
        className="flex h-8 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 lg:w-[230px]"
      >
        <CalendarRange className="size-4 shrink-0 text-muted-foreground" />
        <span className={appliedRange?.from ? "truncate" : "truncate text-muted-foreground"}>
          {formatRange(appliedRange)}
        </span>
      </PopoverTrigger>

      <PopoverContent className="w-[min(calc(100vw-2rem),22rem)] p-3">
        <div className="mb-3 grid grid-cols-3 gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDraft({ from: today, to: today })}
          >
            Today
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setDraft({ from: addDays(today, -29), to: today })
            }
          >
            Last 30 days
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setDraft({
                from: new Date(today.getFullYear(), today.getMonth(), 1),
                to: today,
              })
            }
          >
            This month
          </Button>
        </div>

        <DayPicker
          mode="range"
          selected={draft}
          onSelect={setDraft}
          defaultMonth={draft?.from ?? today}
          disabled={{ after: today }}
          navLayout="around"
          className="news-date-range-calendar mx-auto"
        />

        <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {formatRange(draft)}
          </span>
          <div className="flex shrink-0 gap-2">
            {(appliedRange?.from || draft?.from) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearRange}
              >
                Clear
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              disabled={!draft?.from}
              onClick={applyRange}
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function rangeFromParams(
  searchParams: Pick<URLSearchParams, "get">,
): PickerDateRange | undefined {
  const legacy = parseIsoDate(searchParams.get("date"));
  const requestedFrom = parseIsoDate(searchParams.get("from"));
  const requestedTo = parseIsoDate(searchParams.get("to"));
  const first = requestedFrom ?? requestedTo ?? legacy;
  const second = requestedTo ?? requestedFrom ?? legacy;

  if (!first || !second) return undefined;
  return first <= second
    ? { from: first, to: second }
    : { from: second, to: first };
}

function parseIsoDate(value: string | null): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }
  return date;
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function formatRange(range: PickerDateRange | undefined): string {
  if (!range?.from) return "Select dates";

  const from = formatDate(range.from);
  if (!range.to || toIsoDate(range.from) === toIsoDate(range.to)) return from;
  return `${from} – ${formatDate(range.to)}`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function FilterField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-xs font-medium text-muted-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const RANGE_TABS = [
  { value: "latest", label: "Latest News" },
  { value: "last-7-days", label: "Last 7 days" },
  { value: "all-time", label: "All Time" },
] as const;

export function RangeTabs({ activeRange }: { activeRange: string }) {
  return (
    <div className="inline-flex rounded-md border bg-muted p-1">
      {RANGE_TABS.map((tab) => {
        const isActive = activeRange === tab.value;
        return (
          <Link
            key={tab.value}
            href={`?range=${tab.value}`}
            className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
