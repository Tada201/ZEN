import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const premium = read("src/atlas/components/genui/PremiumCard.tsx");
const shell = read("src/atlas/components/genui/premium/CardShell.tsx");
const worldTime = read("src/atlas/components/genui/premium/WorldTimeCard.tsx");
const css = read("src/styles/index.css");
const catalog = read("src/atlas/components/chat/cardCatalog.ts");
const prompt = read("src/atlas/components/genui/prompt.ts");
const linkPreview = read("src/atlas/components/genui/premium/LinkPreviewCard.tsx");

const cardFiles = [
  "AgentStepCard.tsx",
  "BookCard.tsx",
  "ChartCard.tsx",
  "CodeSnippetCard.tsx",
  "ComparisonCard.tsx",
  "CurrencyCard.tsx",
  "DataRecordCard.tsx",
  "DiffCard.tsx",
  "DocumentSummaryCard.tsx",
  "EventCard.tsx",
  "FlightCard.tsx",
  "FlashcardComponent.tsx",
  "InvoiceCard.tsx",
  "JobCard.tsx",
  "MapPinCard.tsx",
  "MathCard.tsx",
  "MemoryRecallCard.tsx",
  "MetricCard.tsx",
  "MovieCard.tsx",
  "NutritionCard.tsx",
  "PackageCard.tsx",
  "PersonCard.tsx",
  "PollCard.tsx",
  "ProductCard.tsx",
  "RecipeCard.tsx",
  "SportsCard.tsx",
  "StatusCard.tsx",
  "StockCard.tsx",
  "TerminalCard.tsx",
  "TimelineCard.tsx",
  "TranslationCard.tsx",
  "WeatherCard.tsx",
  "WordDefinitionCard.tsx",
];

for (const file of cardFiles) {
  assert(read(`src/atlas/components/genui/premium/${file}`).includes("max-w-none"), `${file} must use the full-width card contract`);
}

assert(premium.includes('className="genui-card-host w-full min-w-0"'), "premium cards need a shared responsive host");
assert(css.includes(".genui-card-host > div > :first-child"), "the host must normalize each card surface width");
assert(css.includes("max-width: none"), "premium card surfaces must not retain inconsistent max-width caps");
assert(shell.includes("genui-card-surface"), "CardShell must expose the shared card surface hook");

assert(worldTime.includes("useId"), "world clock map IDs must be instance-scoped");
assert(worldTime.includes("grid grid-cols-1 md:grid-cols-12"), "world clock must use an actual responsive grid");
assert(worldTime.includes("min-h-[252px]"), "world clock default layout should use the compact height budget");
assert(worldTime.includes("flex flex-col justify-between"), "world clock detail panel must establish its flex layout");
assert(worldTime.includes("grid grid-cols-2 sm:grid-cols-3"), "expanded world clock overview must use a responsive grid");

assert(catalog.includes('ticker: "Ticker symbol'), "stock catalog fields must match the stock renderer");
assert(catalog.includes('departureCode: "Departure airport code"'), "flight catalog fields must match the flight renderer");
assert(catalog.includes('aliases: ["alert", "notification"]'), "status aliases must not shadow the event card");
assert(prompt.includes('buildCardCatalogPrompt({ format: "openui" })'), "OpenUI must request the non-tag card catalog mode");
assert(prompt.includes("instead of <card> blocks"), "OpenUI prompt must explicitly reject the chat-card tag syntax");
assert(linkPreview.includes("isSafeGeneratedHref"), "link previews must validate generated URLs before navigation");

console.log("GenUI card layout contract passed");
