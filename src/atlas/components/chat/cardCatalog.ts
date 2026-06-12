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
      symbol: "Ticker symbol (e.g., AAPL)",
      name: "Company name",
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
      departure: "Departure city/code",
      arrival: "Arrival city/code",
      departureTime: "Departure time",
      arrivalTime: "Arrival time",
      duration: "Flight duration",
      price: "Ticket price",
      status: "Flight status (On Time, Delayed, etc.)",
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
      description: "Short synopsis",
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
    aliases: ["alert", "notification", "event"],
    description: "Status/alert card with icon, status badge, message, and optional detail fields",
    fields: {
      title: "Status title (Deploy, PR, Alert, etc.)",
      status: "Status level: success, error, warning, info, pending, running",
      message: "Status message or description",
      fields: "Optional object of key-value detail fields",
    },
  },
];

/**
 * Build the premium cards section for a system prompt.
 */
export function buildCardCatalogPrompt(): string {
  let prompt = `
## PREMIUM RICH CARDS

You can display structured data as rich visual cards in the chat UI. 
Format: <card>{"type": "...", "data": {...}}</card>

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

  prompt += `When you encounter data that fits a card type, output it as a <card> block.
The card renders inline in the chat. Use it to make data visual and scannable.
Do NOT wrap cards in markdown code fences unless the user asks for the raw JSON.`;

  return prompt;
}
