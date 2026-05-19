import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ThumbsUp, ThumbsDown, Minus, Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SentimentBadge } from "@/components/article-badges";

export const metadata: Metadata = {
  title: "Sentiment Methodology",
  description:
    "How sentiment is determined for each article — rules, examples, and the AI model behind it.",
};

export default function SentimentMethodologyPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to home
      </Link>

      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Sentiment Methodology</h1>
        <p className="text-muted-foreground">
          Every article gets one of three sentiment labels &mdash;{" "}
          <SentimentBadge value="Positive" /> <SentimentBadge value="Neutral" />{" "}
          <SentimentBadge value="Negative" /> &mdash; from{" "}
          <span className="font-medium">AstraZeneca&rsquo;s point of view</span>. Here is
          how that decision is made.
        </p>
      </header>

      {/* How it works */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            How sentiment is determined
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed">
          <p>
            After an article body is scraped, it is sent to an LLM (
            <Badge variant="secondary" className="font-mono text-xs">
              openai/gpt-oss-120b
            </Badge>{" "}
            via{" "}
            <a
              href="https://groq.com"
              className="text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Groq Cloud
            </a>
            ) with a structured prompt that includes the headline, body, and explicit
            classification rules. The model returns a strict JSON object validated
            against a schema &mdash; if it doesn&rsquo;t fit one of the three labels,
            the call is rejected and retried.
          </p>
          <p>
            Sentiment is read from AstraZeneca&rsquo;s perspective, not the article
            author&rsquo;s. A neutral news report announcing a successful AZ trial is{" "}
            <SentimentBadge value="Positive" /> for AZ even though the article tone is
            factual.
          </p>
        </CardContent>
      </Card>

      {/* Rules */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Classification rules</h2>

        <RuleCard
          icon={<ThumbsUp className="h-5 w-5 text-emerald-600" />}
          label="Positive"
          tone="emerald"
          rules={[
            "New partnerships, MoUs, or collaborations involving AZ",
            "Drug approvals, registrations, or formulary inclusions for AZ products",
            "AZ achievements, growth, awards, recognitions",
            "Successful clinical trials or research breakthroughs",
            "Strategic investments by AZ in Indonesia",
          ]}
          example="AstraZeneca dan Kemenkes perkuat kerja sama tangani penyakit tidak menular"
        />

        <RuleCard
          icon={<Minus className="h-5 w-5 text-slate-600" />}
          label="Neutral"
          tone="slate"
          rules={[
            "Factual updates without clear positive or negative framing",
            "Industry/market reports mentioning AZ as a data point",
            "General regulatory news where AZ isn't the subject",
            "Default for Regulatory and edge-case classifications",
          ]}
          example="BPOM terbitkan peraturan baru pengelolaan obat di ritel modern"
        />

        <RuleCard
          icon={<ThumbsDown className="h-5 w-5 text-rose-600" />}
          label="Negative"
          tone="rose"
          rules={[
            "Trial failures, product recalls, or efficacy concerns for AZ",
            "Controversies, hoaxes, or public criticism toward AZ",
            "Regulatory issues, license revocations, or compliance findings",
            "Adverse event reports involving AZ products",
            "Competitor winning a direct comparison against AZ",
          ]}
          example="AstraZeneca gagal uji coba obat kanker payudara"
        />
      </section>

      {/* Net sentiment formula */}
      <Card>
        <CardHeader>
          <CardTitle>Net Sentiment calculation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed">
          <p>
            The <span className="font-semibold">Net Sentiment</span> number shown on
            the homepage is computed as:
          </p>
          <pre className="rounded-md bg-muted p-4 font-mono text-xs">
            net_sentiment = positive_count − negative_count
          </pre>
          <p>
            Positive values (green) mean more positive than negative coverage in the
            period; negative values (red) mean the opposite. Neutral articles are
            excluded from the formula so a high volume of neutral news doesn&rsquo;t
            mask the underlying tone.
          </p>
          <p className="text-muted-foreground">
            The <span className="font-mono">+N today</span> indicator on the landing
            page shows today&rsquo;s contribution alone &mdash; useful for spotting
            sudden shifts before they reshape the cumulative number.
          </p>
        </CardContent>
      </Card>

      {/* Limitations */}
      <Card>
        <CardHeader>
          <CardTitle>Limitations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-relaxed text-muted-foreground">
          <p>
            &bull; Sentiment is generated by an LLM and may misclassify nuanced
            articles. Spot-check critical signals before acting.
          </p>
          <p>
            &bull; Articles with very short bodies (paywalled, behind login walls)
            fall back to a rule-based scoring with lower accuracy.
          </p>
          <p>
            &bull; Sarcasm, irony, and implicit framing are hard for the model;
            obvious tones perform best.
          </p>
        </CardContent>
      </Card>
    </article>
  );
}

function RuleCard({
  icon,
  label,
  tone,
  rules,
  example,
}: {
  icon: React.ReactNode;
  label: string;
  tone: "emerald" | "slate" | "rose";
  rules: string[];
  example: string;
}) {
  const borderClass = {
    emerald: "border-l-emerald-500",
    slate: "border-l-slate-400",
    rose: "border-l-rose-500",
  }[tone];

  return (
    <Card className={`overflow-hidden border-l-4 ${borderClass}`}>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2 font-semibold">
          {icon}
          {label}
        </div>
        <ul className="space-y-1 text-sm text-muted-foreground">
          {rules.map((r) => (
            <li key={r} className="flex gap-2">
              <span className="text-foreground/40">&bull;</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
        <div className="rounded-md bg-muted/50 p-3 text-xs">
          <span className="font-medium text-muted-foreground">Example: </span>
          <span className="italic">&ldquo;{example}&rdquo;</span>
        </div>
      </CardContent>
    </Card>
  );
}
