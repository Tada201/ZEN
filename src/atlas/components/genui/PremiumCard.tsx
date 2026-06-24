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
import { ChartCard } from './premium/ChartCard';
import { MemoryRecallCard } from './premium/MemoryRecallCard';
import { MathCard } from './premium/MathCard';
import { CitationCard } from './premium/CitationCard';
import { TerminalCard } from './premium/TerminalCard';
import { FlashcardComponent } from './premium/FlashcardComponent';
import { MapComponent } from './Map';
import { MessageComposer } from './MessageComposer';

interface CardProps {
  type: string;
  data: any;
}

export function PremiumCard({ type, data }: CardProps) {
  const t = type.toLowerCase();

  // Specialized inline layouts
  if (t === 'map') {
    return (
      <div className="w-full max-w-sm p-1 rounded-2xl border border-white/[0.08] bg-black/40 backdrop-blur-md overflow-hidden shadow-lg">
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
      <div className="w-full max-w-md">
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
    return <ChartCard data={data} />;
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

  // Fallback visual display for raw custom cards
  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/40 backdrop-blur-md p-4 max-w-sm">
      <div className="flex items-center gap-2 mb-2 text-primary">
        <CheckCircle2 size={16} />
        <span className="text-xs font-black uppercase tracking-wider font-mono">{t} Visualizer</span>
      </div>
      <pre className="text-[10px] font-mono text-white/60 bg-white/5 p-2.5 rounded border border-white/[0.04] overflow-x-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
