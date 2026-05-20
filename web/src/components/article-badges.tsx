import { Badge } from "@/components/ui/badge";
import {
  CATEGORY_STRIPE,
  CATEGORY_SWATCH,
  SENTIMENT_SWATCH,
  SUBCATEGORY_STRIPE,
  SUBCATEGORY_SWATCH,
  type Swatch,
} from "@/lib/brand";
import type {
  ArticleCategory,
  ArticleSentiment,
  ArticleSubcategory,
} from "@/lib/types";

/**
 * Solid brand badges — warna dari single source of truth (lib/brand.ts).
 * Style via inline `style` prop supaya hex brand exact (tidak lewat Tailwind scale).
 */

function SolidBadge({ swatch, label }: { swatch: Swatch; label: string }) {
  return (
    <Badge
      variant="default"
      className="border-transparent"
      style={{ backgroundColor: swatch.bg, color: swatch.fg }}
    >
      {label}
    </Badge>
  );
}

export function SentimentBadge({ value }: { value: ArticleSentiment | null }) {
  if (!value) return null;
  return <SolidBadge swatch={SENTIMENT_SWATCH[value]} label={value} />;
}

export function CategoryBadge({ value }: { value: ArticleCategory | null }) {
  if (!value) return null;
  return <SolidBadge swatch={CATEGORY_SWATCH[value]} label={value} />;
}

export function SubcategoryBadge({ value }: { value: ArticleSubcategory | null }) {
  if (!value) return null;
  return <SolidBadge swatch={SUBCATEGORY_SWATCH[value]} label={value} />;
}

/**
 * Stripe color resolver untuk kartu — pakai subcategory (granular),
 * fallback ke category, fallback netral. Return hex untuk inline style.
 */
export function stripeColor(
  subcategory: ArticleSubcategory | null,
  category: ArticleCategory | null,
): string {
  if (subcategory) return SUBCATEGORY_STRIPE[subcategory];
  if (category) return CATEGORY_STRIPE[category];
  return "#cbd5e1"; // slate-300 fallback
}
