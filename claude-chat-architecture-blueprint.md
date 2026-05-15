# Claude Chat Window — Full Architecture Blueprint

> **Version:** 1.1 (updated — all capabilities included)
> **Scope:** End-to-end system design for all chat window capabilities  
> **Purpose:** Reference blueprint from user input to rendered output

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Layer 1 — Input Layer](#2-layer-1--input-layer)
3. [Layer 2 — Model & Reasoning](#3-layer-2--model--reasoning)
4. [Layer 3 — Tool Orchestration](#4-layer-3--tool-orchestration)
5. [Layer 4 — Output Capabilities](#5-layer-4--output-capabilities)
   - 5.1 [Diagrams & Visualizations](#51-diagrams--visualizations)
   - 5.2 [Interactive Widgets](#52-interactive-widgets)
   - 5.3 [Generative & SVG Art](#53-generative--svg-art)
   - 5.4 [Charts & Data](#54-charts--data)
   - 5.5 [Downloadable Files](#55-downloadable-files)
   - 5.6 [Live Data & Real-time](#56-live-data--real-time)
   - 5.7 [Message Composition](#57-message-composition)
   - 5.8 [Clarification Widgets](#58-clarification-widgets)
6. [Layer 5 — External Integrations](#6-layer-5--external-integrations)
7. [Layer 6 — Code Execution & File I/O](#7-layer-6--code-execution--file-io)
8. [Layer 7 — Persistent Storage](#8-layer-7--persistent-storage)
9. [Layer 8 — Rendering Pipeline](#9-layer-8--rendering-pipeline)
10. [Cross-Cutting Concerns](#10-cross-cutting-concerns)
11. [Capability Matrix](#11-capability-matrix)
12. [Design Principles](#12-design-principles)
13. [Glossary](#13-glossary)

---

## 1. System Overview

The Claude chat window is a multi-layer system that accepts rich user input, processes it through an AI reasoning engine, routes tasks to specialized tools, and streams a composed response — combining prose, inline visuals, interactive widgets, live data, code execution results, and downloadable files — back into a single chat turn.

```
┌──────────────────────────────────────────────────────────────┐
│                           USER                               │
│            (types, uploads, clicks, speaks)                  │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                      INPUT LAYER                             │
│    Text · Files · URLs · History · System Prompt            │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                 MODEL & REASONING LAYER                      │
│          Claude Sonnet / Opus — plans, decides               │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                   TOOL ORCHESTRATION                         │
│       Routes to correct tool(s) — may call several          │
└──┬──────────┬──────────┬──────────┬──────────┬──────────┬───┘
   │          │          │          │          │          │
   ▼          ▼          ▼          ▼          ▼          ▼
Visualizer File Gen  Web Search Live Data Connectors Bash/Code
   │          │          │          │          │          │
   └──────────┴──────────┴──────────┴──────────┴──────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                   RENDERING PIPELINE                         │
│      Streamed inline — text + widgets + files together       │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    CHAT WINDOW (UI)                          │
│             User sees the composed response                  │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Layer 1 — Input Layer

Everything the user can send into a conversation turn.

### 2.1 Text Input

| Type | Description |
|---|---|
| Free-form message | Natural language question, instruction, or request |
| System prompt | Operator-set context injected before the conversation |
| Conversation history | All prior turns passed as context on each request |
| Inline code | Code blocks, snippets, or pseudocode |

### 2.2 File Uploads

| Format | How Claude processes it |
|---|---|
| `.pdf` | Extracted as text (native) or rasterized pages for visual inspection |
| `.png / .jpg / .webp` | Passed as base64 image, Claude sees it natively |
| `.docx` | Read via python-docx to extract text, tables, structure |
| `.xlsx / .csv` | Read via openpyxl / pandas for tabular data |
| `.txt / .md / .html` | Read as plain text, appears directly in context |
| `.pptx` | Parsed slide-by-slide for content extraction |
| `.json` | Parsed as structured data |
| Archives (`.zip`) | Extracted and processed file by file |
| eBooks (`.epub`) | Extracted as text chapters |

### 2.3 File Reading & Analysis (Standalone Capability)

Uploaded files are accessible on the Linux container at `/mnt/user-data/uploads/`. Claude can:

- **Read** text files directly into context
- **Extract** text and tables from PDFs (text-native or scanned via rasterization)
- **Parse** Excel/CSV files as structured data for analysis or transformation
- **Inspect** Word documents for content, formatting, and tables
- **Analyze** images natively (describe, extract text, compare)
- **Process** multiple files in sequence and synthesize results

```
File reading workflow:
  1. Check if file content already in context (images, PDFs, markdown)
  2. If not → access /mnt/user-data/uploads/{filename}
  3. Use appropriate tool: python-docx, openpyxl, pdfplumber, etc.
  4. Extract relevant content
  5. Reason over extracted content and respond
```

### 2.4 URLs & References

- User pastes a URL → Claude uses `web_fetch` to retrieve the full page content
- User references a past conversation → memory system surfaces relevant context
- User mentions a connected app → Claude routes to the appropriate MCP connector

### 2.5 Input Constraints

- Maximum context window: model-dependent (Sonnet 4.6 supports 200k tokens)
- File size limit per upload: enforced at the platform level
- Image inputs: up to 20 images per turn, each max 5MB

---

## 3. Layer 2 — Model & Reasoning

### 3.1 Model Selection

| Model | Tier | Best for |
|---|---|---|
| Claude Sonnet 4.6 | Default / Balanced | Everyday tasks, interactive responses |
| Claude Opus 4.6 | Premium | Complex reasoning, ambitious visuals, long documents |
| Claude Haiku 4.5 | Fast / Lightweight | Quick answers, simple lookups |

### 3.2 Reasoning Process

The model processes the input and determines:

1. **Intent classification** — Is this a question, a creation task, a data lookup, a coding task, a research task?
2. **Output type decision** — Should the response be prose, a diagram, a file, a widget, or a combination?
3. **Tool selection** — Which tools (if any) are needed? In what order?
4. **Routing priority** — MCP tools → first-party widgets → Visualizer → Artifacts → bash → prose

### 3.3 Planning Heuristics

```
IF request needs current info              → web_search first
IF request needs deep multi-step research  → Research mode (many tool calls)
IF request names a connected service       → call that MCP tool
IF request asks for a visual concept       → Visualizer (SVG/HTML)
IF request asks for a file/download        → file generation tools
IF request needs code execution            → bash_tool on Linux container
IF request asks to compose a message       → message_compose_v1
IF request is ambiguous, needs clarity     → ask_user_input_v0
IF request is conversational/factual       → prose response only
IF multiple tools needed                   → orchestrate in sequence
```

### 3.4 Memory & Context

- **Short-term:** Full conversation history in context window
- **Long-term (opt-in):** Memory system stores distilled facts across sessions; surfaced as "memories" at conversation start
- **No memory by default:** Each conversation starts fresh unless memory is enabled by the user in Settings

### 3.5 Deep Research Mode

For queries that require comprehensive investigation across many sources, Claude can operate in a deep research mode:

- Executes 10–30+ tool calls across web search, web fetch, and data sources
- Plans a research strategy before beginning
- Synthesizes findings across multiple documents and sources
- Produces a structured report with citations
- Triggered by: "research X in depth", "give me a comprehensive report on", or when a topic clearly requires many sources
- Suggested proactively when a query would require 20+ tool calls

---

## 4. Layer 3 — Tool Orchestration

The model may call multiple tools in a single turn, composing their outputs together.

### 4.1 Tool Priority Order

```
1. Named MCP connector (user explicitly said "use X")
2. Connected MCP tool that category-matches the request
3. First-party widget (weather, sports, maps, recipes, message compose)
4. Visualizer (inline SVG/HTML diagrams and charts)
5. File generation (docx, pdf, pptx, xlsx)
6. Web search / web fetch
7. Bash / code execution (for computation, file processing)
8. Prose-only response (no tools)
```

### 4.2 Multi-Tool Orchestration

A single response can compose outputs from several tools:

```
Example: "Find me coffee shops near me and show me a map with ratings chart"

Turn execution:
  1. places_search("coffee shops near user location")
  2. places_map_display(results)
  3. visualize:show_widget (bar chart of ratings)
  4. Prose summary woven between the widgets
```

```
Example: "Analyse the data in my uploaded spreadsheet and create a report PDF"

Turn execution:
  1. bash_tool → read /mnt/user-data/uploads/data.xlsx with pandas
  2. bash_tool → compute statistics, detect patterns
  3. visualize:show_widget → inline chart of key findings
  4. bash_tool → generate PDF report with reportlab
  5. present_files → user downloads the PDF
```

### 4.3 Tool Registry (Complete)

| Tool | Category | Triggered by |
|---|---|---|
| `visualize:show_widget` | Visuals | Diagrams, charts, art, UI mockups, games, calculators |
| `create_file` + `present_files` | Files | "Create a file", "download", "save as" |
| `bash_tool` | Execution | Code running, data analysis, file processing, installs |
| `str_replace` | Execution | Editing existing files on the container |
| `view` | Execution | Reading files and directories on the container |
| `web_search` | Information | Current events, unknown entities, live data |
| `web_fetch` | Information | Specific URLs, documentation, full article content |
| `image_search` | Visuals | Visual context for places, products, people, concepts |
| `weather_fetch` | Live data | Weather queries with location |
| `fetch_sports_data` | Live data | Scores, standings, game stats |
| `places_search` | Live data | Restaurant, attraction, business search |
| `places_map_display` | Live data | Map rendering with markers and itineraries |
| `recipe_display_v0` | Structured | Recipe requests with adjustable servings and timers |
| `message_compose_v1` | Structured | Email, Slack, text message drafting with variants |
| `ask_user_input_v0` | Interactive | Clarification questions as clickable choice widgets |
| `search_mcp_registry` | Discovery | Finding available MCP connectors for a task |
| `suggest_connectors` | Discovery | Showing the user relevant connectors to enable |
| MCP connectors | Integrations | Gmail, Google Calendar, Asana, Salesforce, Figma, etc. |
| Anthropic API (in widget) | AI-powered | Claude-in-Claude artifact apps |

---

## 5. Layer 4 — Output Capabilities

Everything that can render inside or be produced from the chat window.

---

### 5.1 Diagrams & Visualizations

All rendered as SVG via `visualize:show_widget`. Dark-mode adaptive, clickable nodes, streaming-safe.

#### Flowcharts

- **Use case:** Sequential processes, decision trees, pipelines, approval workflows
- **Implementation:** SVG with directional arrows, colored node groups, `c-{ramp}` color classes
- **Interactivity:** Clickable nodes call `sendPrompt()` to drill deeper
- **Example triggers:** "Walk me through the process", "What are the steps", "What happens when I submit"

#### Structural / Architecture Diagrams

- **Use case:** System architecture, nested containers, component hierarchies, VPCs, networks
- **Implementation:** Nested SVG rects with distinct color ramps per tier
- **Rules:** Max 3 nesting levels, 20px minimum padding inside containers, distinct ramps per tier
- **Example triggers:** "What's the architecture", "Draw the system", "How is this organised"

#### Illustrative / Intuition Diagrams

- **Use case:** Abstract concepts, physical cross-sections, mechanism explanations
- **Implementation:** Freeform SVG paths, shapes, and spatial metaphors
- **Optionally interactive:** HTML version with sliders, toggles, animated states
- **Example triggers:** "How does X actually work", "Explain X visually", "Give me an intuition for"

#### ERD / Class Diagrams

- **Use case:** Database schemas, entity relationships, class hierarchies
- **Implementation:** Mermaid.js `erDiagram` or `classDiagram` rendered in HTML widget
- **Example triggers:** "Draw the database schema", "Show me the ERD", "Data model for X"

#### Geographic Choropleth Maps

- **Use case:** Data mapped to geographic regions
- **Implementation:** D3.js + TopoJSON from jsdelivr CDN
- **Sources:** US states (`us-atlas`), world countries (`world-atlas`), country subdivisions (`datamaps`)
- **Example triggers:** "Map of X by state", "World map showing Y per country"

---

### 5.2 Interactive Widgets

Rendered as HTML via `visualize:show_widget`. Full JavaScript executes after streaming completes.

#### Calculators & Explainers

- Sliders, toggles, number inputs with live readouts
- Good for: finance, physics, math, algorithm step-throughs
- State lives in JS variables — no localStorage

#### Step-through Explainers (Steppers)

- Multi-stage interactive panels with progress indicators (● ○ ○)
- Used for cyclic or sequential processes: event loops, Krebs cycle, sorting algorithms
- Each panel owns its own content — no ring diagrams
- Next/Prev navigation, wrap-around for cyclic flows

#### Mini Games

- Simple playable experiences rendered entirely in the chat window
- Canvas-based or DOM-based interaction
- Examples: word puzzles, trivia, logic games, simple arcade
- State maintained in JS variables for the session

#### UI Mockups & Wireframes

- App screens, dashboards, settings pages, data tables, modals, forms
- Rendered as functional HTML prototypes using the claude.ai design system
- CSS variables match the host UI for a seamless look

#### AI-Powered Widgets (Claude in Claude)

- The widget HTML calls `https://api.anthropic.com/v1/messages` directly
- Enables full AI chatbots, smart search tools, content generators inside the chat
- Supports multi-turn conversation history, web search, and MCP servers
- Model used: always `claude-sonnet-4-20250514`, `max_tokens: 1000`

```javascript
// Widget API call pattern
const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    messages: conversationHistory,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    mcp_servers: [
      { type: "url", url: "https://gmail.mcp.claude.com/mcp", name: "gmail" }
    ]
  })
});
```

**Parsing widget responses:**

```javascript
const textBlocks = data.content
  .filter(b => b.type === "text").map(b => b.text).join("\n");
const toolResults = data.content
  .filter(b => b.type === "mcp_tool_result")
  .map(b => b.content?.[0]?.text || "").join("\n");
```

---

### 5.3 Generative & SVG Art

Claude can produce original visual artwork directly in the chat window as SVG or HTML Canvas via `visualize:show_widget`.

#### Types of generative art

| Type | Description | Example triggers |
|---|---|---|
| Geometric / abstract | Mathematical patterns, tessellations, fractals | "Draw me something geometric", "Create an abstract pattern" |
| Illustrative scenes | Simplified landscape, object, or scene | "Draw a minimalist cityscape", "Illustrate a forest" |
| Animated art | CSS keyframe animations, looping motion | "Make something animated and calming" |
| Data-driven art | Visuals generated from input data | "Turn this data into art" |
| Generative / algorithmic | Procedural patterns using JS math | "Make a generative art piece" |

#### Art safety rules

- No real identifiable people, celebrities, or public figures
- No copyrighted characters or branded IP (Disney, Marvel, etc.)
- No graphic violence, sexual content, or disturbing imagery
- Physical-realism scenes use hardcoded hex colors (not CSS theme variables)

---

### 5.4 Charts & Data

Rendered via Chart.js inside `visualize:show_widget`.

| Chart type | Best for |
|---|---|
| Bar (vertical) | Category comparisons, rankings |
| Bar (horizontal) | Long category labels, many items |
| Line | Trends over time, continuous data |
| Pie / Donut | Part-to-whole proportions (≤6 segments) |
| Scatter | Correlation, two-variable distribution |
| Bubble | Three-variable relationships |

**Chart implementation rules:**

- Canvas wrapped in `<div>` with explicit height, `position: relative`
- `responsive: true`, `maintainAspectRatio: false` always set
- Wrapper div height: at least `(number_of_bars × 40) + 80px` for horizontal bars
- Custom HTML legends only — never Chart.js default legends
- All displayed numbers rounded via `Math.round()` or `.toFixed(n)`
- Negative values formatted as `-$5M` not `$-5M`
- Dark mode: hardcoded hex (CSS variables cannot resolve on canvas)

---

### 5.5 Downloadable Files

Generated on the Linux container at `/home/claude/`, validated, moved to `/mnt/user-data/outputs/`, and shared via `present_files`.

| Format | Library | Triggered by |
|---|---|---|
| `.docx` | python-docx | "Word doc", "report", ".docx", formal deliverable |
| `.pdf` | reportlab / fpdf2 | "PDF", explicit PDF request |
| `.pptx` | python-pptx | "Presentation", "slides", "deck", ".pptx" |
| `.xlsx` | openpyxl | "Spreadsheet", "Excel", ".xlsx", tabular data |
| `.html` | Direct creation | Web pages, interactive HTML documents |
| `.md` | Direct creation | Markdown documents, README, notes |
| Code files | Direct creation | `.py`, `.js`, `.ts`, `.sql`, `.sh`, etc. |
| `.csv` | pandas / direct | Data exports, structured table output |
| Images | Pillow / cairosvg | Rendered charts, SVG-to-PNG conversion |

**File generation workflow:**

```
1. Read relevant SKILL.md for file type
   → /mnt/skills/public/docx/SKILL.md
   → /mnt/skills/public/pptx/SKILL.md
   → /mnt/skills/public/pdf/SKILL.md
   → /mnt/skills/public/xlsx/SKILL.md
2. pip install required libraries (--break-system-packages)
3. Generate file in /home/claude/ (working directory)
4. Validate output (open file, check structure, check page count)
5. cp /home/claude/filename /mnt/user-data/outputs/filename
6. present_files(["/mnt/user-data/outputs/filename"])
   → User sees download card in chat window
```

**Trigger words for file output:**
`"save"`, `"download"`, `"file I can keep"`, `"shareable version"`, `"Word doc"`, `"PDF"`, `"PowerPoint"`, `"Excel"`, `"spreadsheet"`, or any extension: `.docx`, `.pdf`, `.pptx`, `.xlsx`

---

### 5.6 Live Data & Real-time

#### Weather

- Tool: `weather_fetch`
- Inputs: latitude, longitude, location name
- Output: current conditions, temperature, forecast widget rendered inline
- Units: Fahrenheit (US), Celsius (international)

#### Sports

- Tool: `fetch_sports_data`
- Modes: `scores`, `standings`, `game_stats` (requires `game_id` from scores)
- Leagues: NFL, NBA, NHL, MLB, WNBA, EPL, Champions League, MLS, La Liga, Serie A, Bundesliga, Ligue 1, NCAA FB/MB/WB, tennis, golf, NASCAR, cricket, MMA
- Workflow: `scores` → extract `game_id` → `game_stats` → respond

#### Places & Maps

- Search: `places_search` — Google Places API, multi-query in one call, deduplication
- Display: `places_map_display` — two modes:
  - **Markers:** Simple location pins with notes
  - **Itinerary:** Day-by-day trip with routing, arrival times, travel mode
- Travel modes: driving, walking, transit, bicycling
- Includes: ratings, hours, photos, insider notes

#### Recipes

- Tool: `recipe_display_v0`
- Features: adjustable servings (all ingredient amounts scale proportionally), step timers, cooking mode
- Triggered by any recipe or cooking instruction request

#### Web Search & Fetch

- `web_search`: 1–6 word queries, returns top 10 results with snippets and sentence indices
- `web_fetch`: retrieves full page content from a specific URL
- Copyright rules applied: quotes under 15 words, one per source, default to paraphrasing
- Scale: 1 call for simple facts, 5–10 for research, 20+ → suggest Research mode

---

### 5.7 Message Composition

Tool: `message_compose_v1`

Claude drafts messages with strategic intent — generating different approaches that lead to genuinely different outcomes, not just tone variations.

#### Supported message kinds

| Kind | Output | Button |
|---|---|---|
| `email` | Subject line + body | "Open in Mail" |
| `textMessage` | SMS-style short text | "Open in Messages" |
| `other` | Slack, LinkedIn, etc. | "Copy" |

#### Variant strategy

For high-stakes or ambiguous situations, Claude generates 2–3 labeled variants:

```
Example: Asking your manager for a raise

Variant A: "Build the case first"
  → Focuses on delivered impact, proposes a meeting
Variant B: "Direct ask with anchor"
  → States desired number upfront, backs with evidence
Variant C: "Open the conversation"
  → Frames as career discussion, less confrontational
```

#### Situation types handled

Disagreements, negotiations, follow-ups, bad news delivery, requests, boundary-setting, apologies, declines, feedback, cold outreach, responding to criticism, delegating, celebrating, clarifying misunderstandings.

#### Triggered by

"Write an email to...", "Draft a message to...", "How should I respond to...", "Help me tell X that...", "Follow up with..."

---

### 5.8 Clarification Widgets

Tool: `ask_user_input_v0`

Instead of asking questions in prose, Claude renders clickable interactive choice widgets directly in the chat when it needs to clarify intent or gather preferences.

#### Widget types

| Type | Description | When to use |
|---|---|---|
| `single_select` | Pick exactly one option | Mutually exclusive choices |
| `multi_select` | Pick one or more | Multiple preferences allowed |
| `rank_priorities` | Drag-and-drop ordering | Ranking or prioritization |

#### Rules

- 1–3 questions per widget call, 2–4 options per question
- Options are short labels — open-ended questions remain as prose
- Collects all needed information upfront rather than one question at a time
- Used for bounded choices only — never for open-ended inputs like names or descriptions

---

## 6. Layer 5 — External Integrations

### 6.1 MCP Connectors

Model Context Protocol servers expose external services as tools Claude can call natively.

**Priority rule:** If a connected MCP server category-matches the request, use it. If the user names a server explicitly, always use that server.

| MCP Server | Category | Common tasks |
|---|---|---|
| Gmail | Email | Read, search, draft, send emails |
| Google Calendar | Scheduling | View events, create meetings, check availability |
| Asana | Project management | Tasks, projects, assignments, sprints |
| Atlassian (Jira / Confluence) | Issue tracking | Bugs, tickets, docs, sprints |
| Salesforce | CRM | Contacts, opportunities, accounts |
| Slack | Messaging | Search messages, read channels |
| Monday | Boards | Project boards, workflow tracking |
| Figma | Design | Generate diagrams, design assets |
| Canva | Graphics | Marketing visuals, social assets |
| Box | File storage | Search and retrieve documents |
| Google Drive | Docs & files | Search, fetch, read documents |
| Notion | Docs & databases | Pages, databases, linked content |
| Shopify | eCommerce | Products, orders, storefront data |
| ElevenLabs | Audio | Voice synthesis, audio generation |

**MCP discovery workflow:**

```
User: "Can you check my Asana tasks?"
  1. search_mcp_registry(["asana", "tasks"])
  2. If connected → call Asana MCP tool directly
  3. If not connected → suggest_connectors(uuids=[asana_uuid])
     → User sees "Connect Asana" button in chat
```

**MCP call pattern (in widgets):**

```javascript
mcp_servers: [
  { type: "url", url: "https://gmail.mcp.claude.com/mcp", name: "gmail-mcp" },
  { type: "url", url: "https://gcal.mcp.claude.com/mcp", name: "gcal-mcp" }
]
```

**Parsing MCP tool responses:**

```javascript
const toolResults = data.content
  .filter(item => item.type === "mcp_tool_result")
  .map(item => item.content?.[0]?.text || "")
  .join("\n");

const textResponse = data.content
  .filter(item => item.type === "text")
  .map(item => item.text)
  .join("\n");

const toolCalls = data.content
  .filter(item => item.type === "mcp_tool_use")
  .map(item => ({ name: item.name, input: item.input }));
```

### 6.2 Image Search

- Tool: `image_search`
- Min 3 images per call, max 4–5, placed inline between prose blocks
- Used proactively when visuals genuinely aid understanding
- Good for: places, animals, food, products, concepts, history, exercises

**Safety restrictions — never search for:**
- Graphic violence, weapons in use, accident or crime scenes
- Sexual or intimate content
- Copyrighted IP (Disney, Marvel, licensed sports content, TV/film stills)
- Real celebrities or fashion photography
- Famous artworks or iconic photographs (gallery context is fine, the work itself is not)

### 6.3 Anthropic API (Claude-in-Claude)

Widget artifacts can call the Anthropic API directly:

```
Widget AI lifecycle:
  1. User types into widget input or clicks a button
  2. Widget builds conversation history array
  3. Calls /v1/messages with model + messages + optional tools/MCP
  4. Parses response: text blocks + mcp_tool_result blocks
  5. Updates widget UI with AI response
  6. Appends exchange to history for next turn
  7. All state in JS variables (no localStorage — not supported)
```

**Supported in-widget capabilities:**
- `web_search_20250305` — live web search results inside the widget
- Any connected MCP server URL
- Structured JSON output via system prompt
- Multi-turn conversation with full history replay
- File inputs: base64 PDF or image passed in the messages array

---

## 7. Layer 6 — Code Execution & File I/O

Claude has access to a full Ubuntu 24 Linux container with bash execution.

### 7.1 What Code Execution Enables

| Capability | How |
|---|---|
| Run Python scripts | `bash_tool` — executes arbitrary Python |
| Install packages | `pip install X --break-system-packages` |
| Process uploaded files | Access `/mnt/user-data/uploads/` |
| Generate output files | Write to `/home/claude/`, copy to `/mnt/user-data/outputs/` |
| Perform data analysis | pandas, numpy, scipy, matplotlib, seaborn |
| Validate outputs | Open generated files and check structure before sharing |
| Edit files precisely | `str_replace` tool for targeted file modifications |
| Read files and dirs | `view` tool — text files with line numbers, directories |

### 7.2 Directory Structure

```
/mnt/user-data/uploads/     ← User-uploaded files (read-only)
/home/claude/               ← Working directory (read/write, not visible to user)
/mnt/user-data/outputs/     ← Final outputs (user can download from here)
/mnt/skills/public/         ← Skill documentation files (read-only)
/mnt/skills/user/           ← User-provided custom skills (read-only)
```

### 7.3 Network Access

- Egress disabled by default on the container network
- If a domain is blocked, the proxy returns `x-deny-reason` header
- Claude informs the user if a network request fails and suggests checking Settings

### 7.4 Skill System

Skills are SKILL.md files containing best practices for specific output types. Claude reads the relevant skill before starting any file generation task.

| Skill | Path | Used for |
|---|---|---|
| `docx` | `/mnt/skills/public/docx/SKILL.md` | Word document generation |
| `pdf` | `/mnt/skills/public/pdf/SKILL.md` | PDF creation and manipulation |
| `pptx` | `/mnt/skills/public/pptx/SKILL.md` | PowerPoint slide deck creation |
| `xlsx` | `/mnt/skills/public/xlsx/SKILL.md` | Excel spreadsheet generation |
| `pdf-reading` | `/mnt/skills/public/pdf-reading/SKILL.md` | PDF content extraction strategies |
| `file-reading` | `/mnt/skills/public/file-reading/SKILL.md` | General file reading routing |
| `frontend-design` | `/mnt/skills/public/frontend-design/SKILL.md` | High-quality UI/web output |
| `product-self-knowledge` | `/mnt/skills/public/product-self-knowledge/SKILL.md` | Anthropic product facts |

---

## 8. Layer 7 — Persistent Storage

Widgets can read and write data that persists across sessions using `window.storage`.

### 8.1 Storage API

```javascript
await window.storage.get(key, shared?)       // → { key, value, shared } | null
await window.storage.set(key, value, shared?) // → { key, value, shared } | null
await window.storage.delete(key, shared?)    // → { key, deleted, shared } | null
await window.storage.list(prefix?, shared?)  // → { keys, prefix?, shared } | null
```

### 8.2 Data Scope

| Scope | Parameter | Visibility |
|---|---|---|
| Personal | `shared: false` (default) | Only current user |
| Shared | `shared: true` | All users of that artifact |

> Always inform users when shared storage is in use — their data will be visible to others.

### 8.3 Key Design

- Hierarchical keys under 200 chars: `table:record_id` (e.g. `todos:todo_001`)
- No whitespace, path separators (`/ \`), or quotes in keys
- Batch related data into single keys to minimize sequential storage calls
- Last-write-wins for concurrent updates

### 8.4 What Persistent Storage Enables

| Use case | Example |
|---|---|
| Personal journal | Entries persist across sessions |
| Habit tracker | Daily check-ins accumulate over weeks |
| Shared leaderboard | Multiple users contribute scores to one board |
| Progress tracker | Multi-step workflows resume where left off |
| Saved preferences | Widget remembers user settings (theme, units, defaults) |
| Collaborative tools | Multiple users interact with the same shared dataset |

### 8.5 Error Handling Pattern

```javascript
// Reading a key that may not exist
try {
  const result = await window.storage.get('my-key');
  const data = JSON.parse(result.value);
} catch (error) {
  // Key doesn't exist yet — initialize with defaults
}

// Writing
try {
  const result = await window.storage.set('my-key', JSON.stringify(data));
  if (!result) console.error('Storage write failed');
} catch (error) {
  console.error('Storage error:', error);
}
```

### 8.6 Limitations

- Text/JSON only — no binary file storage
- Values under 5MB per key
- Requests are rate-limited — batch related data together
- No cross-artifact storage access

---

## 9. Layer 8 — Rendering Pipeline

### 9.1 Streaming Architecture

Responses stream token-by-token. The pipeline composes multiple content types in one pass:

```
Model output stream
  │
  ├─ Text tokens          → rendered as markdown prose
  ├─ Tool call (inline)   → tool executes, result injected at that position
  ├─ SVG content          → rendered in a framed widget card
  ├─ HTML content         → rendered in sandboxed iframe, height auto-fits
  ├─ Image results        → inline images between prose blocks
  ├─ File reference       → download card via present_files
  ├─ Map widget           → interactive map card
  ├─ Weather widget       → forecast card
  ├─ Recipe widget        → interactive recipe with serving controls
  ├─ Message widget       → draft card with Open in Mail / Copy button
  └─ Choice widget        → clickable option buttons
```

### 9.2 Widget Rendering Rules

| Rule | Rationale |
|---|---|
| No `localStorage` / `sessionStorage` | Not supported in sandbox — use `window.storage` instead |
| No `position: fixed` | Iframe auto-sizes to content; fixed elements collapse it |
| No DOCTYPE, `<html>`, `<head>`, `<body>` | Widget is a content fragment, not a full document |
| CSS variables for all colors | Auto-adapts to light and dark mode |
| CDN allowlist only | CSP blocks all other origins |
| Scripts after streaming | Load libraries via `<script src>`, execute after DOM is ready |
| No tabs or `display:none` | Hidden content doesn't stream — use JS-driven steppers post-load |
| No nested scrolling | Widgets auto-fit height to content |

**Allowed CDN origins (CSP-enforced):**

```
cdnjs.cloudflare.com
esm.sh
cdn.jsdelivr.net
unpkg.com
```

### 9.3 SVG Rendering Rules

| Rule | Value |
|---|---|
| ViewBox width | Always `680` — load-bearing, never change |
| ViewBox height | `max_y_of_last_element + 40px buffer` |
| Safe drawing area | x: 40–640, y: 40 to (H–40) |
| Font sizes | 14px labels (`class="th"/"t"`), 12px subtitles (`class="ts"`) |
| Stroke width | 0.5px for all borders and connector lines |
| Text wrapping | Never auto — explicit `<tspan dy="1.2em">` for line breaks |
| Dark mode | `c-{ramp}` classes only — never hardcode hex in SVG |
| Arrow marker | Always include `<defs>` with standard arrow marker |
| Fill on connectors | Connector `<path>` elements always need `fill="none"` |
| Text anchoring | All `<text>` inside boxes use `dominant-baseline="central"` |

### 9.4 File Output Pipeline

```
Request detected as file output
  │
  ├─ 1. visualize:read_me → load relevant SKILL.md
  ├─ 2. bash_tool → pip install required libraries
  ├─ 3. bash_tool → write file to /home/claude/output.ext
  ├─ 4. bash_tool → validate file (open, check pages/sheets/slides)
  ├─ 5. bash_tool → cp /home/claude/output.ext /mnt/user-data/outputs/
  └─ 6. present_files(["/mnt/user-data/outputs/output.ext"])
         → Download card appears in chat window
```

### 9.5 Response Composition Order

```
[Intro prose]
[Tool call 1 → widget / chart / map renders here]
[Bridge prose]
[Tool call 2 → second widget renders here]
[Closing prose]
[File download card (if applicable)]
[Clarification widget (if needed)]
```

Visualizer calls always appear between text blocks — never mid-paragraph, never back-to-back without prose in between.

---

## 10. Cross-Cutting Concerns

### 10.1 Dark Mode

All visual output must work in both light and dark mode:

- SVG: use `c-{ramp}` classes (auto-adaptive), `class="t"/"ts"/"th"` for all text
- HTML: use CSS variables (`--color-text-primary`, `--color-background-secondary`, etc.) — never hardcode hex
- Charts (Chart.js): hardcoded hex only (canvas cannot resolve CSS variables)
- Physical/realism scenes: hardcoded hex + explicit `@media (prefers-color-scheme: dark)` override

### 10.2 Copyright Compliance

- All web source quotes: strictly under 15 words, maximum one quote per source
- Default always to paraphrasing — quotes are the rare exception
- Never reproduce song lyrics, poems, haikus, or article paragraphs verbatim
- Never reconstruct article structure, headers, or narrative flow
- No copyrighted characters, branded IP, or licensed imagery in generated visuals

### 10.3 Safety & Content Policy

- No weapons, explosives, CBRN materials, malware, or harmful instructions
- No sexual content or any content involving minors — special caution always applied
- No real named public figures in persuasive, fictional, or attributed-quote content
- Image search: never fetch graphic violence, sexual content, copyrighted IP, or celebrities

### 10.4 Privacy

- No user data sent to third parties beyond what the user explicitly connects
- MCP connectors only active if user has connected them in Settings
- Image search never includes real names when searching from images
- Shared widget storage: always inform users their data will be visible to others

### 10.5 Accessibility

- All SVG text: minimum 12px font size
- No information conveyed by color alone — labels always accompany color coding
- Interactive controls use semantic HTML elements
- Animations wrapped in `@media (prefers-reduced-motion: no-preference)`
- SVG clickable nodes include `cursor: pointer` and hover affordance

### 10.6 Financial & Legal

- Financial and legal information presented factually without confident recommendations
- Users reminded Claude is not a lawyer or financial advisor
- No specific investment, legal, or medical advice

---

## 11. Capability Matrix

| Capability | Inline render | Downloadable | Tool required | Live/real-time |
|---|---|---|---|---|
| Flowchart diagram | ✅ | ❌ | Visualizer | ❌ |
| Architecture diagram | ✅ | ❌ | Visualizer | ❌ |
| Illustrative diagram | ✅ | ❌ | Visualizer | ❌ |
| ERD / class diagram | ✅ | ❌ | Visualizer | ❌ |
| Bar / line / pie chart | ✅ | ❌ | Visualizer | ❌ |
| Choropleth map | ✅ | ❌ | Visualizer | ❌ |
| Generative / SVG art | ✅ | ❌ | Visualizer | ❌ |
| Interactive calculator | ✅ | ❌ | Visualizer | ❌ |
| Step-through stepper | ✅ | ❌ | Visualizer | ❌ |
| Mini game | ✅ | ❌ | Visualizer | ❌ |
| UI mockup / wireframe | ✅ | ❌ | Visualizer | ❌ |
| AI-powered widget | ✅ | ❌ | Visualizer + API | ✅ |
| Persistent storage widget | ✅ | ❌ | Visualizer + storage | ❌ |
| Word document (.docx) | ❌ | ✅ | bash + python-docx | ❌ |
| PDF | ❌ | ✅ | bash + reportlab | ❌ |
| PowerPoint (.pptx) | ❌ | ✅ | bash + python-pptx | ❌ |
| Excel (.xlsx) | ❌ | ✅ | bash + openpyxl | ❌ |
| Code file | ❌ | ✅ | create_file | ❌ |
| CSV export | ❌ | ✅ | bash + pandas | ❌ |
| Weather widget | ✅ | ❌ | weather_fetch | ✅ |
| Sports scores | ✅ | ❌ | fetch_sports_data | ✅ |
| Place search + map | ✅ | ❌ | places_search + map | ✅ |
| Recipe widget | ✅ | ❌ | recipe_display_v0 | ❌ |
| Message compose | ✅ | ❌ | message_compose_v1 | ❌ |
| Clarification widget | ✅ | ❌ | ask_user_input_v0 | ❌ |
| Web search results | ✅ (prose) | ❌ | web_search | ✅ |
| Image search | ✅ | ❌ | image_search | ✅ |
| File reading & analysis | ✅ (prose) | optional | bash + libs | ❌ |
| Code execution (Python) | ✅ (output) | optional | bash_tool | ❌ |
| Deep research | ✅ (report) | optional | web_search × N | ✅ |
| Gmail / Calendar | ✅ (prose) | ❌ | MCP connector | ✅ |
| Asana / Jira | ✅ (prose) | ❌ | MCP connector | ✅ |
| Salesforce / HubSpot | ✅ (prose) | ❌ | MCP connector | ✅ |
| Figma / Canva | ✅ | ❌ | MCP connector | ✅ |

---

## 12. Design Principles

### 12.1 Seamless

Widgets match the claude.ai design system — same font, same spacing, same color variables. No jarring embed frames or foreign aesthetics.

### 12.2 Flat

No gradients, mesh backgrounds, drop shadows, blur, or glow. Clean flat surfaces. The visual language is editorial, not decorative.

### 12.3 Minimal tooling

Use tools only when they genuinely add value. Match the output format to what the user actually needs, not what is most impressive.

### 12.4 Compose, don't replace

Multiple tools contribute to one response. A map + a chart + a summary is one coherent response, not three separate interactions.

### 12.5 Stream-first

Structure output so useful content appears early. Styles before content, content before scripts. Never `display: none` during streaming.

### 12.6 Accessible by default

Dark mode mandatory. Animation opt-in via `prefers-reduced-motion`. Text never below 12px. Color never the sole carrier of information.

### 12.7 Honest about limitations

If a tool call fails, report it. If a network request is blocked, say so. If information may be outdated, search before answering. If a topic needs more research than is practical, suggest the Research feature.

---

## 13. Glossary

| Term | Definition |
|---|---|
| Artifact | A persistent, downloadable file created by Claude (docx, pdf, pptx, xlsx, code, etc.) |
| Visualizer | The `visualize:show_widget` tool that renders inline SVG/HTML directly in chat |
| Widget | An inline interactive HTML element rendered in the chat window |
| Stepper | A multi-panel interactive explainer with Next/Prev navigation for cyclic or sequential processes |
| MCP | Model Context Protocol — open standard for connecting external services to Claude as tools |
| MCP server | A URL-addressable service exposing tools Claude can call (Gmail, Jira, Figma, etc.) |
| `sendPrompt()` | Global JS function in widgets that sends a message to chat as if typed by the user |
| `window.storage` | Persistent key-value storage API available inside widget artifacts across sessions |
| `c-{ramp}` | SVG color classes (e.g. `c-purple`, `c-teal`) that auto-handle light/dark mode |
| Streaming | Token-by-token output delivery — responses appear progressively as Claude generates them |
| Context window | Total token budget for a conversation including all history, files, and tool results |
| Skill | A SKILL.md file at `/mnt/skills/public/` with best practices for a specific output type |
| Tool orchestration | Selecting, sequencing, and combining multiple tool calls within a single response turn |
| Live data | Information fetched at response time (weather, sports, maps, web search) |
| Claude-in-Claude | An artifact widget that calls the Anthropic API to embed AI inside a chat widget |
| `present_files` | The tool that makes a generated file visible and downloadable in the chat UI |
| Deep Research | A high-call-count mode where Claude plans and executes multi-step research across many sources |
| Message compose | `message_compose_v1` — renders strategic multi-variant message drafts in chat |
| Clarification widget | `ask_user_input_v0` — renders clickable choice options for gathering user preferences |
| Persistent storage | Session-spanning key-value store in widgets via `window.storage` — personal or shared scope |
| File reading | Claude accessing and extracting content from user-uploaded files on the Linux container |
| Bash execution | Running commands and scripts on the Ubuntu 24 container via `bash_tool` |
| Generative art | Original SVG or canvas-based artwork created procedurally or algorithmically |

---

*End of blueprint — Claude Chat Window Architecture v1.1*

*All capabilities included: diagrams · charts · generative art · interactive widgets ·*
*step-through steppers · AI-powered widgets · persistent storage · message composition ·*
*clarification widgets · file generation · file reading & analysis · code execution ·*
*live data · deep research · image search · MCP connectors · full rendering pipeline*
