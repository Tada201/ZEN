import { lazy, Suspense } from "react";
import { CheckCircle2 } from 'lucide-react';
import { StockCard } from './premium/StockCard';
import { FlightCard } from './premium/FlightCard';
import { PackageCard } from './premium/PackageCard';
import { ProductCard } from './premium/ProductCard';
import { JobCard } from './premium/JobCard';
import { EventCard } from './premium/EventCard';
import { MovieCard } from './premium/MovieCard';
import { BookCard } from './premium/BookCard';
import { PersonCard } from './premium/PersonCard';
import { NutritionCard } from './premium/NutritionCard';
import { WeatherCard } from './premium/WeatherCard';
import { SportsCard } from './premium/SportsCard';
import { MetricCard } from './premium/MetricCard';
import { DataRecordCard } from './premium/DataRecordCard';
import { ComparisonCard } from './premium/ComparisonCard';
import { StatusCard } from './premium/StatusCard';
import { RecipeCard } from './premium/RecipeCard';
import { LinkPreviewCard } from './premium/LinkPreviewCard';
import { TimelineCard } from './premium/TimelineCard';
import { CurrencyCard } from './premium/CurrencyCard';
import { PollCard } from './premium/PollCard';
import { InvoiceCard } from './premium/InvoiceCard';
import { MapPinCard } from './premium/MapPinCard';
import { CodeSnippetCard } from './premium/CodeSnippetCard';
import { WordDefinitionCard } from './premium/WordDefinitionCard';
import { AgentStepCard } from './premium/AgentStepCard';
import { TranslationCard } from './premium/TranslationCard';
import { DocumentSummaryCard } from './premium/DocumentSummaryCard';
import { DiffCard } from './premium/DiffCard';
import { MemoryRecallCard } from './premium/MemoryRecallCard';
import { MathCard } from './premium/MathCard';
import { CitationCard } from './premium/CitationCard';
import { TerminalCard } from './premium/TerminalCard';
import { FlashcardComponent } from './premium/FlashcardComponent';
import { WorldTimeCard } from './premium/WorldTimeCard';
import { MapComponent } from './Map';
import { MessageComposer } from './MessageComposer';
import { CardMotion } from './premium/motion/CardMotion';

// ChartCard pulls in the entire Recharts library (~110 KB gzipped). Lazy-
// load it so the vendor-recharts chunk defined in vite.config.ts is only
// fetched when a chat message actually contains a chart — every other
// premium card type stays on the fast path with zero Recharts bytes.
//
// The Suspense fallback mirrors the empty-state the ChartCard itself
// renders when no data is supplied, so the layout doesn't pop on load.
const ChartCard = lazy(() =>
  import("./premium/ChartCard").then((m) => ({ default: m.ChartCard })),
);

const ChartCardFallback = () => (
  <div className="w-full rounded-2xl border border-border bg-card p-5">
    {/* Header skeleton — mirrors the ChartCard's CardHeader + title + icon row */}
    <div className="flex items-center justify-between mb-4">
      <div className="h-3 w-32 rounded bg-primary-foreground/10 animate-pulse" />
      <div className="h-4 w-4 rounded bg-primary-foreground/10 animate-pulse" />
    </div>
    {/* Chart container skeleton — h-48 matches the real ChartCard chart area */}
    <div className="h-48 w-full rounded-xl border border-border/[0.04] flex items-center justify-center">
      <span className="text-[10px] font-mono text-primary-foreground/30">
        Loading chart…
      </span>
    </div>
    {/* Foot legend skeleton — matches the ChartCard's legend strip height */}
    <div className="flex items-center justify-center gap-4 mt-3 pt-2.5 border-t border-border/[0.04]">
      <div className="h-2 w-16 rounded bg-primary-foreground/10 animate-pulse" />
      <div className="h-2 w-16 rounded bg-primary-foreground/10 animate-pulse" />
    </div>
  </div>
);

interface CardProps {
  type: string;
  data: any;
}

function PremiumCardBody({ type, data }: CardProps) {
  const t = type.toLowerCase();

  // Specialized inline layouts
  if (t === 'map') {
    return (
      <div className="w-full p-1 rounded-2xl border border-border bg-card overflow-hidden shadow-lg">
        <MapComponent
          latitude={data.latitude ?? data.lat ?? 0}
          longitude={data.longitude ?? data.lng ?? data.long ?? 0}
          zoom={data.zoom}
          label={data.label}
          className="w-full"
        />
      </div>
    );
  }

  if (t === 'composer' || t === 'message_composer') {
    return (
      <div className="w-full">
        <MessageComposer
          topic={data.topic ?? "Draft"}
          variants={data.variants || []}
        />
      </div>
    );
  }

  // Core Premium Entity Cards
  if (t === 'stock' || t === 'financial') {
    return <StockCard data={data} />;
  }

  if (t === 'flight') {
    return <FlightCard data={data} />;
  }

  if (t === 'package' || t === 'tracking') {
    return <PackageCard data={data} />;
  }

  if (t === 'product') {
    return <ProductCard data={data} />;
  }

  if (t === 'job') {
    return <JobCard data={data} />;
  }

  if (t === 'event') {
    return <EventCard data={data} />;
  }

  if (t === 'movie' || t === 'show') {
    return <MovieCard data={data} />;
  }

  if (t === 'book') {
    return <BookCard data={data} />;
  }

  if (t === 'person' || t === 'contact') {
    return <PersonCard data={data} />;
  }

  if (t === 'nutrition' || t === 'food') {
    return <NutritionCard data={data} />;
  }

  if (t === 'weather' || t === 'forecast') {
    return <WeatherCard data={data} />;
  }

  if (t === 'sports' || t === 'match' || t === 'game') {
    return <SportsCard data={data} />;
  }

  // New visualizer cards (Pass 1)
  if (t === 'recipe' || t === 'food_recipe' || t === 'cooking') {
    return <RecipeCard data={data} />;
  }

  if (t === 'link_preview' || t === 'url_preview' || t === 'unfurl') {
    return <LinkPreviewCard data={data} />;
  }

  if (t === 'timeline' || t === 'history' || t === 'events_sequence') {
    return <TimelineCard data={data} />;
  }

  if (t === 'currency' || t === 'exchange' || t === 'forex') {
    return <CurrencyCard data={data} />;
  }

  if (t === 'poll' || t === 'vote' || t === 'choice') {
    return <PollCard data={data} />;
  }

  if (t === 'invoice' || t === 'receipt' || t === 'bill') {
    return <InvoiceCard data={data} />;
  }

  if (t === 'map_pin' || t === 'location' || t === 'place') {
    return <MapPinCard data={data} />;
  }

  // New visualizer cards (Pass 2)
  if (t === 'code_snippet' || t === 'code_block' || t === 'snippet') {
    return <CodeSnippetCard data={data} />;
  }

  if (t === 'word_definition' || t === 'dictionary' || t === 'define') {
    return <WordDefinitionCard data={data} />;
  }

  if (t === 'agent_step' || t === 'trace_step' || t === 'agent_execution') {
    return <AgentStepCard data={data} />;
  }

  if (t === 'translation' || t === 'translate' || t === 'bilingual') {
    return <TranslationCard data={data} />;
  }

  if (t === 'document_summary' || t === 'file_summary' || t === 'doc_overview') {
    return <DocumentSummaryCard data={data} />;
  }

  if (t === 'diff' || t === 'code_diff' || t === 'patch') {
    return <DiffCard data={data} />;
  }

  // New visualizer cards (Pass 3)
  if (t === 'chart' || t === 'graph' || t === 'data_visualization') {
    return (
      <Suspense fallback={<ChartCardFallback />}>
        <ChartCard data={data} />
      </Suspense>
    );
  }

  if (t === 'memory_recall' || t === 'semantic_search' || t === 'past_chunks') {
    return <MemoryRecallCard data={data} />;
  }

  if (t === 'math' || t === 'equation' || t === 'formula') {
    return <MathCard data={data} />;
  }

  if (t === 'citation' || t === 'reference' || t === 'paper') {
    return <CitationCard data={data} />;
  }

  if (t === 'terminal' || t === 'shell_command' || t === 'cmd_exec') {
    return <TerminalCard data={data} />;
  }

  if (t === 'flashcard' || t === 'quiz_card' || t === 'card_flip') {
    return <FlashcardComponent data={data} />;
  }

  if (t === 'time' || t === 'clock' || t === 'world_time') {
    return <WorldTimeCard data={data} />;
  }

  // Claude-style structural cards
  if (t === 'metric' || t === 'stat' || t === 'kpi') {
    return <MetricCard data={data} />;
  }

  if (t === 'record' || t === 'datarecord' || t === 'entity') {
    return <DataRecordCard data={data} />;
  }

  if (t === 'comparison' || t === 'compare' || t === 'plans') {
    return <ComparisonCard data={data} />;
  }

  if (t === 'status' || t === 'alert' || t === 'notification' || t === 'event') {
    return <StatusCard data={data} />;
  }

  // Unknown model-generated cards stay summary-first. Raw payloads are
  // diagnostic material and must not become the default user-facing UI.
  return (
    <div className="w-full rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2 text-primary">
        <CheckCircle2 size={16} />
        <span className="text-xs font-semibold tracking-wide">{t || "Generated result"}</span>
      </div>
      <p className="text-[12px] leading-relaxed text-muted-foreground">This result is available, but does not have a dedicated preview yet.</p>
      <details className="mt-3 rounded-md bg-muted px-2 py-1.5">
        <summary className="cursor-pointer select-none text-[11px] uppercase tracking-wide text-muted-foreground">Technical details</summary>
        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">{JSON.stringify(data, null, 2)}</pre>
      </details>
    </div>
  );
}

/**
 * One motion boundary for every model-generated card. Individual cards keep
 * their own content and chrome, while entrance timing and reduced-motion
 * behavior stay centralized at the GenUI boundary.
 */
export function PremiumCard(props: CardProps) {
  return (
    <CardMotion className="w-full">
      <PremiumCardBody {...props} />
    </CardMotion>
  );
}
