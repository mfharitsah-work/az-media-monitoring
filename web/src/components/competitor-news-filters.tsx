"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { DateRangePicker } from "@/components/news-filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CompetitorCompany } from "@/lib/types";

const FILTER_KEYS = ["q", "company", "date", "from", "to"] as const;

export function CompetitorNewsFilters({
  companies,
}: {
  companies: CompetitorCompany[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [q, setOptimisticQ] = useOptimistic(searchParams.get("q") ?? "");

  const hrefFromParams = (params: URLSearchParams) => {
    params.delete("page");
    return params.toString() ? `?${params.toString()}` : "?";
  };

  const setSearch = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("q", value);
    else params.delete("q");
    startTransition(() => {
      setOptimisticQ(value);
      router.replace(hrefFromParams(params), { scroll: false });
    });
  };

  const setCompany = (value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === "all") params.delete("company");
    else params.set("company", value);
    startTransition(() => {
      router.replace(hrefFromParams(params), { scroll: false });
    });
  };

  const clearFilters = () => {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of FILTER_KEYS) params.delete(key);
    startTransition(() => {
      setOptimisticQ("");
      router.replace(hrefFromParams(params), { scroll: false });
    });
  };

  const hasActiveFilters = FILTER_KEYS.some((key) => !!searchParams.get(key));

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[1fr_260px_230px]">
        <FilterField label="Search" htmlFor="competitor-search">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="competitor-search"
              type="search"
              placeholder="Headline, summary, source, or keyword..."
              value={q}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
        </FilterField>

        <FilterField label="Company">
          <Select
            value={searchParams.get("company") ?? "all"}
            onValueChange={setCompany}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Company" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All competitors</SelectItem>
              {companies.map((company) => (
                <SelectItem key={company} value={company}>
                  {company}
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
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" />
            Clear filters
          </Button>
        </div>
      )}
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
