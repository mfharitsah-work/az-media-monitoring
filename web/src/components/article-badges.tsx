import { Badge } from "@/components/ui/badge";
import type {
  ArticleCategory,
  ArticleSentiment,
  ArticleSubcategory,
} from "@/lib/types";

/**
 * Color scheme:
 * - Sentiment: emerald / slate / rose
 * - Category (broad): violet for AZ, amber for Regulatory
 * - Subcategory (specific): same hue as parent category, varying intensity/tone
 *
 * Tailwind classes must be literal (no string interpolation) so the JIT keeps them.
 */

const sentimentClass: Record<ArticleSentiment, string> = {
  Positive:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  Neutral:
    "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
  Negative:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300",
};

const categoryClass: Record<ArticleCategory, string> = {
  "About AstraZeneca":
    "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300",
  "Regulatory/Policy":
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
};

const subcategoryClass: Record<ArticleSubcategory, string> = {
  // About AstraZeneca family — violet shades
  "AZ Focus":
    "border-violet-300 bg-violet-100 text-violet-800 dark:border-violet-800 dark:bg-violet-900 dark:text-violet-200",
  "AZ Mentioned":
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300",
  // Regulatory/Policy family — amber/orange/yellow shades
  "Stakeholder & Regulator":
    "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-900 dark:text-amber-200",
  "Pharma Policy":
    "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300",
  "General Health Regulation":
    "border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-300",
};

export function SentimentBadge({ value }: { value: ArticleSentiment | null }) {
  if (!value) return null;
  return (
    <Badge variant="outline" className={sentimentClass[value]}>
      {value}
    </Badge>
  );
}

export function CategoryBadge({ value }: { value: ArticleCategory | null }) {
  if (!value) return null;
  return (
    <Badge variant="outline" className={categoryClass[value]}>
      {value}
    </Badge>
  );
}

export function SubcategoryBadge({ value }: { value: ArticleSubcategory | null }) {
  if (!value) return null;
  return (
    <Badge variant="outline" className={subcategoryClass[value]}>
      {value}
    </Badge>
  );
}

/**
 * Stripe color for cards — uses subcategory for granular signal,
 * fallback to category if no subcategory present.
 */
export const subcategoryStripeClass: Record<ArticleSubcategory, string> = {
  "AZ Focus": "bg-violet-500",
  "AZ Mentioned": "bg-sky-500",
  "Stakeholder & Regulator": "bg-amber-500",
  "Pharma Policy": "bg-orange-500",
  "General Health Regulation": "bg-yellow-500",
};

export const categoryStripeClass: Record<ArticleCategory, string> = {
  "About AstraZeneca": "bg-violet-500",
  "Regulatory/Policy": "bg-amber-500",
};
