/**
 * Card Catalog — tells the LLM what premium card types are available.
 * 
 * Card types render as rich visual cards in the chat UI.
 * The LLM outputs them as `<card>JSON</card>` blocks or inside ```openui fences.
 */

export interface CardTypeSchema {
  type: string;
  aliases: string[];
  description: string;
  fields: Record<string, string>;
}

export const CARD_CATALOG: CardTypeSchema[] = [
  {
    type: "weather",
    aliases: ["forecast"],
    description: "Current weather conditions and forecast",
    fields: {
      location: "City or location name",
      temperature: "Current temperature in degrees",
      condition: "Weather condition (Sunny, Cloudy, Rain, etc.)",
      humidity: "Humidity percentage (number)",
      windSpeed: "Wind speed with units",
      feels_like: "Feels-like temperature",
      high: "Today's high temperature",
      low: "Today's low temperature",
      icon: "Weather emoji (☀️ 🌧️ ⛅ etc.)",
      forecast: "Optional array of {day, icon, high, low} for next 5 days",
    },
  },
  {
    type: "stock",
    aliases: ["financial"],
    description: "Stock or financial instrument quote",
    fields: {
      ticker: "Ticker symbol (e.g., AAPL)",
      companyName: "Company name",
      price: "Current price",
      change: "Price change amount",
      changePercent: "Price change percentage",
      currency: "Currency code (USD, EUR, etc.)",
    },
  },
  {
    type: "sports",
    aliases: ["match", "game"],
    description: "Live or finished sports match score",
    fields: {
      homeTeam: "Home team name",
      awayTeam: "Away team name",
      homeScore: "Home team score (number)",
      awayScore: "Away team score (number)",
      status: "Match status (Live, Final, Scheduled)",
      league: "League or tournament name",
      venue: "Stadium or location",
      time: "Kickoff/start time",
      period: "Current period (Q1, Half, etc.)",
      players: "Optional array of key player names",
    },
  },
  {
    type: "flight",
    aliases: [],
    description: "Flight itinerary card",
    fields: {
      airline: "Airline name",
      flightNumber: "Flight number",
      departureCode: "Departure airport code",
      departureCity: "Departure city",
      arrivalCode: "Arrival airport code",
      arrivalCity: "Arrival city",
      departureTime: "Departure time",
      arrivalTime: "Arrival time",
      duration: "Flight duration",
      status: "Flight status (On Time, Delayed, etc.)",
      gate: "Optional gate",
      seat: "Optional seat",
      terminal: "Optional terminal",
    },
  },
  {
    type: "product",
    aliases: [],
    description: "Product display card",
    fields: {
      name: "Product name",
      price: "Price with currency",
      rating: "Rating out of 5 (number)",
      description: "Short product description",
      image: "Optional product image URL",
      brand: "Brand name",
    },
  },
  {
    type: "event",
    aliases: [],
    description: "Event or concert card",
    fields: {
      name: "Event name",
      month: "3-letter month (JAN, FEB, etc.)",
      day: "Day of month",
      venue: "Venue name",
      time: "Event time",
      price: "Ticket price or 'Free'",
    },
  },
  {
    type: "movie",
    aliases: ["show"],
    description: "Movie or TV show card",
    fields: {
      title: "Title",
      year: "Release year",
      rating: "Rating (PG, R, etc.) or score",
      genre: "Genre",
      runtime: "Runtime (e.g., 2h 15m)",
      synopsis: "Short synopsis",
      genres: "Optional array of genre strings",
    },
  },
  {
    type: "book",
    aliases: [],
    description: "Book display card",
    fields: {
      title: "Book title",
      author: "Author name",
      rating: "Rating out of 5 or Goodreads score",
      description: "Short synopsis",
      pages: "Page count",
      genre: "Genre",
    },
  },
  {
    type: "person",
    aliases: ["contact"],
    description: "Person or contact profile card",
    fields: {
      name: "Full name",
      role: "Job title or role",
      company: "Company or organization",
      email: "Email address",
      phone: "Phone number",
      location: "Location",
    },
  },
  {
    type: "nutrition",
    aliases: ["food"],
    description: "Nutrition facts card",
    fields: {
      name: "Food item name",
      calories: "Calories (number)",
      protein: "Protein in grams",
      carbs: "Carbohydrates in grams",
      fat: "Fat in grams",
      servingSize: "Serving size description",
    },
  },
  {
    type: "package",
    aliases: ["tracking"],
    description: "Package tracking card",
    fields: {
      carrier: "Carrier name (UPS, FedEx, etc.)",
      trackingNumber: "Tracking number",
      status: "Status (In Transit, Delivered, etc.)",
      origin: "Origin location",
      destination: "Destination location",
      estimatedDelivery: "Estimated delivery date",
    },
  },
  {
    type: "job",
    aliases: [],
    description: "Job listing card",
    fields: {
      title: "Job title",
      company: "Company name",
      location: "Location (city or Remote)",
      salary: "Salary range",
      type: "Job type (Full-time, Contract, etc.)",
      description: "Short description",
    },
  },
  {
    type: "metric",
    aliases: ["stat", "kpi"],
    description: "Big number metric card with label, value, and trend indicator",
    fields: {
      label: "Metric name (Revenue, Users, etc.)",
      value: "The big number to display",
      trend: "Percentage or change indicator (e.g., +12% or -3%)",
      subtitle: "Optional subtext",
    },
  },
  {
    type: "record",
    aliases: ["datarecord", "entity"],
    description: "Data record card for contacts, receipts, products — shows avatar + key-value fields",
    fields: {
      title: "Record name or title",
      subtitle: "Role, category, or secondary label",
      avatar: "Optional image URL for the record avatar",
      fields: "Object of key-value pairs to display in a table",
    },
  },
  {
    type: "comparison",
    aliases: ["compare", "plans"],
    description: "Side-by-side comparison card with feature lists and recommended highlight",
    fields: {
      title: "Comparison title (e.g., 'Pricing Plans')",
      items: "Array of {name, price?, features: string[], recommended?: boolean}",
    },
  },
  {
    type: "status",
    aliases: ["alert", "notification"],
    description: "Status/alert card with icon, status badge, message, and optional detail fields",
    fields: {
      title: "Status title (Deploy, PR, Alert, etc.)",
      status: "Status level: success, error, warning, info, pending, running",
      message: "Status message or description",
      fields: "Optional object of key-value detail fields",
    },
  },
  {
    type: "recipe",
    aliases: ["food_recipe", "cooking"],
    description: "Recipe display card with preparation times, ingredients, and steps",
    fields: {
      name: "Dish name",
      cuisine: "Cuisine type",
      prepTime: "Prep time (e.g., 15 min)",
      cookTime: "Cook time (e.g., 30 min)",
      servings: "Number of servings",
      difficulty: "Easy / Medium / Hard",
      ingredients: "Array of {amount, unit, item} objects",
      steps: "Array of step strings",
      tags: "Optional array of strings (Vegan, Gluten-free, etc.)",
    },
  },
  {
    type: "link_preview",
    aliases: ["url_preview", "unfurl"],
    description: "Rich metadata preview of a URL/link citation",
    fields: {
      url: "Full URL",
      title: "Page title",
      description: "Meta description or excerpt",
      domain: "Bare domain (e.g., arxiv.org)",
      favicon: "Optional favicon URL",
      image: "Optional OG image URL",
      publishedAt: "Optional publish date",
    },
  },
  {
    type: "timeline",
    aliases: ["history", "events_sequence"],
    description: "Chronological vertical timeline list",
    fields: {
      title: "Timeline title",
      events: "Array of {date, label, description?, status?: 'done'|'active'|'upcoming'}",
    },
  },
  {
    type: "currency",
    aliases: ["exchange", "forex"],
    description: "Currency exchange rate and conversion result",
    fields: {
      from: "Source currency code (USD)",
      to: "Target currency code (VND)",
      amount: "Input amount (number)",
      result: "Converted amount (number)",
      rate: "Exchange rate",
      updatedAt: "Rate timestamp",
    },
  },
  {
    type: "poll",
    aliases: ["vote", "choice"],
    description: "Interactive choice selection poll",
    fields: {
      question: "The question being asked",
      options: "Array of {id, label, description?}",
      allowMultiple: "Boolean — multi-select or single",
      context: "Optional helper text below question",
    },
  },
  {
    type: "invoice",
    aliases: ["receipt", "bill"],
    description: "Invoice or receipt detail layout",
    fields: {
      vendor: "Vendor/merchant name",
      invoiceNumber: "Invoice or receipt ID",
      date: "Issue date",
      lineItems: "Array of {description, qty, unitPrice, total}",
      subtotal: "Subtotal before tax",
      tax: "Tax amount",
      total: "Grand total",
      currency: "Currency code",
      status: "Paid / Unpaid / Overdue",
    },
  },
  {
    type: "map_pin",
    aliases: ["location", "place"],
    description: "Location map card showing address, coordinates, and details",
    fields: {
      name: "Place name",
      address: "Full address string",
      lat: "Latitude (number)",
      lng: "Longitude (number)",
      category: "Place type (Restaurant, Hospital, etc.)",
      rating: "Optional rating out of 5",
      hours: "Optional opening hours string",
      phone: "Optional phone number",
    },
  },
  {
    type: "code_snippet",
    aliases: ["code_block", "snippet"],
    description: "Formatted code block with language and line counts",
    fields: {
      language: "Language identifier (python, rust, tsx, etc.)",
      filename: "Optional filename (e.g., main.rs)",
      code: "The code string",
      description: "Optional one-line explanation",
      lineCount: "Number of lines (number)",
    },
  },
  {
    type: "word_definition",
    aliases: ["dictionary", "define"],
    description: "Dictionary entry showing definitions, parts of speech, and pronunciations",
    fields: {
      word: "The word",
      phonetic: "IPA pronunciation (e.g., /ˈsɪləbəl/)",
      language: "Language code (en, vi, fr, etc.)",
      entries: "Array of {pos, definition, examples: string[]}",
      etymology: "Optional origin string",
      synonyms: "Optional array of synonym strings",
    },
  },
  {
    type: "agent_step",
    aliases: ["trace_step", "agent_execution"],
    description: "Single step/tool execution block in an agent's reasoning loop",
    fields: {
      stepNumber: "Step index (number)",
      totalSteps: "Total planned steps or null if unknown",
      tool: "Tool name (web_search, read_file, query_db, etc.)",
      input: "Tool input summary string",
      output: "Tool output summary string",
      status: "running | done | error",
      duration: "Optional elapsed ms (number)",
      reasoning: "Optional brief agent reasoning",
    },
  },
  {
    type: "translation",
    aliases: ["translate", "bilingual"],
    description: "Translation card comparing source text and translated target text",
    fields: {
      sourceText: "Original text",
      sourceLang: "Source language name",
      targetText: "Translated text",
      targetLang: "Target language name",
      romanization: "Optional romanized form (pinyin, romaji, etc.)",
      alternatives: "Optional array of alternate translation strings",
      confidence: "Optional confidence level: high | medium | low",
    },
  },
  {
    type: "document_summary",
    aliases: ["file_summary", "doc_overview"],
    description: "Overview of a document with file details and key takeaways",
    fields: {
      filename: "File name with extension",
      fileType: "MIME or format label (PDF, DOCX, etc.)",
      fileSize: "Size string (e.g., 2.4 MB)",
      wordCount: "Word count (number)",
      language: "Detected language",
      summary: "2-3 sentence summary string",
      keyPoints: "Array of key point strings (3-6)",
      sentiment: "Optional: positive | neutral | negative",
    },
  },
  {
    type: "diff",
    aliases: ["code_diff", "patch"],
    description: "Visual code difference viewer displaying added, removed, and context lines",
    fields: {
      filename: "File being diffed",
      language: "Language for syntax hint",
      hunks: "Array of {lines: {type: 'add'|'remove'|'context', content: string}[]}",
      additions: "Total lines added (number)",
      deletions: "Total lines removed (number)",
      description: "Optional description of the change",
    },
  },
  {
    type: "chart",
    aliases: ["graph", "data_visualization"],
    description: "Visual chart layout representing numerical dataset segments",
    fields: {
      title: "Chart title",
      chartType: "bar | line | pie | area | scatter",
      labels: "Array of label strings (x-axis or segments)",
      datasets: "Array of {label, data: number[], color?}",
      xLabel: "Optional x-axis label",
      yLabel: "Optional y-axis label",
      unit: "Optional unit suffix (%, $, ms, etc.)",
    },
  },
  {
    type: "memory_recall",
    aliases: ["semantic_search", "past_chunks"],
    description: "Semantic search retrieval card summarizing past chat contexts",
    fields: {
      query: "The semantic query that triggered retrieval",
      chunks: "Array of {text, source, timestamp, similarity: number}",
      totalRetrieved: "Number of chunks pulled",
      usedInContext: "Boolean — whether this was injected into the prompt",
    },
  },
  {
    type: "math",
    aliases: ["equation", "formula"],
    description: "Mathematical expression layout with LaTeX supports and step summaries",
    fields: {
      expression: "The original expression or problem",
      result: "Final answer",
      latex: "LaTeX string of the expression",
      steps: "Array of {description, expression, latex?}",
      domain: "Optional: algebra, calculus, statistics, etc.",
    },
  },
  {
    type: "citation",
    aliases: ["reference", "paper"],
    description: "Academic literature or reference citation details",
    fields: {
      title: "Paper or article title",
      authors: "Array of author name strings",
      year: "Publication year (number)",
      journal: "Journal or conference name",
      doi: "DOI string",
      url: "Full URL",
      abstract: "Short excerpt or abstract",
      citationKey: "Optional short key (e.g., lecun2015deep)",
    },
  },
  {
    type: "terminal",
    aliases: ["shell_command", "cmd_exec"],
    description: "Shell command execution trace highlighting logs and exit codes",
    fields: {
      shell: "Shell type (bash, zsh, powershell, etc.)",
      cwd: "Working directory path",
      command: "The command that was run",
      output: "stdout string",
      stderr: "Optional stderr string",
      exitCode: "Exit code (number — 0 = success)",
      duration: "Optional execution time string",
    },
  },
  {
    type: "flashcard",
    aliases: ["quiz_card", "card_flip"],
    description: "Interactive learning card displaying a front prompt and collapsible/flip back answer",
    fields: {
      front: "Question or prompt",
      back: "Answer or explanation",
      topic: "Subject or topic label",
      difficulty: "easy | medium | hard",
      deck: "Optional deck name this belongs to",
      hint: "Optional hint string",
    },
  },
  {
    type: "world_time",
    aliases: ["time", "clock"],
    description: "World time clocks selector that visualizes day/night cycles, timezone offsets, and projects coordinates onto a 2D world map with sonar pulses.",
    fields: {
      title: "Title of the card (e.g. 'Global Time Comparison')",
      clocks: "Array of clocks: { country: string, city: string, time: string (e.g., '10:30 AM' or '22:15'), timezone: string (e.g., 'EDT (UTC-4)'), latitude: number (-90 to 90), longitude: number (-180 to 180) }"
    }
  }
];

/**
 * Build the premium cards section for a system prompt.
 */
export function buildCardCatalogPrompt(options: { format?: "tags" | "openui" } = {}): string {
  const format = options.format || "tags";
  const outputGuidance = format === "openui"
    ? "The following cards are design references for compact, scannable information architecture. In OpenUI canvas output, do not emit `<card>` tags; use the OpenUI primitives and the single `root` assignment contract."
    : "Format: <card>{\"type\": \"...\", \"data\": {...}}</card>";
  let prompt = `
## PREMIUM RICH CARDS

You can display structured data as rich visual cards in the chat UI.
${outputGuidance}

Available card types:

`;
  for (const card of CARD_CATALOG) {
    const aliases = card.aliases.length > 0 ? ` (also: ${card.aliases.join(", ")})` : "";
    prompt += `### ${card.type}${aliases}\n`;
    prompt += `${card.description}\n`;
    prompt += "Fields:\n";
    for (const [field, desc] of Object.entries(card.fields)) {
      prompt += `- ${field}: ${desc}\n`;
    }
    prompt += "\n";
  }

  prompt += format === "openui"
    ? `Use these field names and density conventions when composing an equivalent OpenUI surface. Prefer full-width responsive composition, concise labels, and progressive disclosure for long content.`
    : `When you encounter data that fits a card type, output it as a <card> block.
The card renders inline in the chat. Use it to make data visual and scannable.
Do NOT wrap cards in markdown code fences unless the user asks for the raw JSON.`;

  return prompt;
}
