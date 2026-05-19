"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CATEGORY_OPTIONS = [
  { value: "all", label: "All categories" },
  { value: "About AstraZeneca", label: "About AstraZeneca" },
  { value: "Regulatory/Policy", label: "Regulatory/Policy" },
] as const;

const SUBCATEGORY_OPTIONS = [
  { value: "all", label: "All subcategories" },
  { value: "AZ Focus", label: "AZ Focus" },
  { value: "AZ Mentioned", label: "AZ Mentioned" },
  { value: "Stakeholder & Regulator", label: "Stakeholder & Regulator" },
  { value: "Pharma Policy", label: "Pharma Policy" },
  { value: "General Health Regulation", label: "General Health Regulation" },
] as const;

const SENTIMENT_OPTIONS = [
  { value: "all", label: "All sentiments" },
  { value: "Positive", label: "Positive" },
  { value: "Neutral", label: "Neutral" },
  { value: "Negative", label: "Negative" },
] as const;

/**
 * Filter bar for All News page. State fully in URL searchParams so the
 * page is the source of truth and links are shareable.
 *
 * Pattern: each input change → router.replace with new params. Server
 * Component re-renders with new data. useTransition keeps UI responsive.
 */
export function NewsFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === "" || value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    // Reset offset whenever filters change
    if (key !== "offset") params.delete("offset");
    startTransition(() => {
      router.replace(`?${params.toString()}`, { scroll: false });
    });
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]">
      <FilterField label="Search" htmlFor="news-search">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="news-search"
            type="search"
            placeholder="Headline, summary, or keyword..."
            defaultValue={searchParams.get("q") ?? ""}
            onChange={(e) => setParam("q", e.target.value)}
            className="pl-9"
          />
        </div>
      </FilterField>

      <FilterField label="Category">
        <Select
          defaultValue={searchParams.get("category") ?? "all"}
          onValueChange={(v) => setParam("category", v)}
        >
          <SelectTrigger className="w-[200px]">
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

      <FilterField label="Subcategory">
        <Select
          defaultValue={searchParams.get("subcategory") ?? "all"}
          onValueChange={(v) => setParam("subcategory", v)}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Subcategory" />
          </SelectTrigger>
          <SelectContent>
            {SUBCATEGORY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterField>

      <FilterField label="Sentiment">
        <Select
          defaultValue={searchParams.get("sentiment") ?? "all"}
          onValueChange={(v) => setParam("sentiment", v)}
        >
          <SelectTrigger className="w-[160px]">
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

      <FilterField label="Date" htmlFor="news-date">
        <Input
          id="news-date"
          type="date"
          defaultValue={searchParams.get("date") ?? ""}
          onChange={(e) => setParam("date", e.target.value)}
          className="w-[170px]"
          title="Specific date — overrides range tab when set"
        />
      </FilterField>
    </div>
  );
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
  { value: "today", label: "Today" },
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
