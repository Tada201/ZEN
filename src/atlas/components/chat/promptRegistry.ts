/**
 * Dynamic Prompt Registry
 * 
 * Each prompt can be injected into the conversation at will — 
 * either by the user selecting it in the chat UI or by the LLM 
 * recognizing the need and suggesting it.
 */
export interface PromptDefinition {
  id: string;
  name: string;
  description: string;
  /** The prompt text injected into the context. */
  content: string;
  /** How this prompt is injected. */
  mode: "system" | "prepend";
  /** Visual grouping category. */
  category: "code" | "review" | "explain" | "generate" | "fix" | "convert" | "voice";
  /** Visual icon (emoji or icon name). */
  icon: string;
  /** Tags for quick filter/search. */
  tags: string[];
}

export const PROMPT_REGISTRY: PromptDefinition[] = [
  {
    id: "explain-code",
    name: "Explain Code",
    description: "Get a detailed explanation of code line by line",
    mode: "prepend",
    category: "explain",
    icon: "💬",
    tags: ["explain", "code", "understand", "what"],
    content: `You are explaining code to a developer. Follow these rules:
- Start with a one-sentence high-level summary of what this code does.
- Walk through each function/block explaining its purpose in plain English.
- Point out any edge cases, performance concerns, or potential bugs.
- Use concrete examples to illustrate complex logic.`,
  },
  {
    id: "review-code",
    name: "Code Review",
    description: "Get a thorough code review with suggestions",
    mode: "prepend",
    category: "review",
    icon: "🔍",
    tags: ["review", "code", "check", "audit"],
    content: `You are performing a code review. Follow these rules:
- List potential bugs, security issues, and performance problems.
- Suggest improvements with before/after code examples.
- Check for adherence to best practices and idioms.
- Rate the code on a scale of 1-10 for readability, performance, and correctness.
- Be constructive and specific — never vague.`,
  },
  {
    id: "fix-bug",
    name: "Fix Bug",
    description: "Debug and fix an issue in the code",
    mode: "prepend",
    category: "fix",
    icon: "🐛",
    tags: ["fix", "debug", "bug", "error", "broken"],
    content: `You are debugging a problem. Follow these rules:
- First, state your hypothesis about the root cause.
- Explain the fix step by step with exact code changes.
- Show the diff of what needs to change.
- Mention any tests that should be added to prevent regression.
- If there are multiple possible causes, list them all and the most likely one.`,
  },
  {
    id: "refactor",
    name: "Refactor",
    description: "Improve code structure without changing behavior",
    mode: "prepend",
    category: "code",
    icon: "♻️",
    tags: ["refactor", "improve", "clean", "structure"],
    content: `You are refactoring code. Follow these rules:
- Preserve all existing behavior — no functional changes.
- Improve naming, reduce duplication, extract reusable functions.
- Apply design patterns where appropriate (name the pattern).
- Break large functions into smaller, focused ones.
- Show the refactored code with explanations of what changed and why.`,
  },
  {
    id: "generate-tests",
    name: "Generate Tests",
    description: "Write comprehensive unit tests for the code",
    mode: "prepend",
    category: "generate",
    icon: "🧪",
    tags: ["test", "unit", "coverage", "jest", "vitest"],
    content: `You are writing unit tests. Follow these rules:
- Write tests using the project's existing test framework and conventions.
- Cover: happy path, edge cases, error handling, and boundary conditions.
- Use descriptive test names that explain the scenario.
- Include setup/teardown where needed.
- Mock external dependencies appropriately.
- Aim for full branch coverage.`,
  },
  {
    id: "add-types",
    name: "Add Types",
    description: "Add TypeScript types and interfaces",
    mode: "prepend",
    category: "code",
    icon: "📐",
    tags: ["types", "typescript", "interface", "type"],
    content: `You are adding TypeScript types. Follow these rules:
- Create clear, reusable interfaces and type aliases.
- Use discriminated unions for state machines.
- Avoid 'any' — use 'unknown' and narrow with type guards.
- Export types that are used across modules.
- Add JSDoc comments for public types.
- Follow the project's existing type naming conventions.`,
  },
  {
    id: "document-code",
    name: "Document Code",
    description: "Add comprehensive documentation and comments",
    mode: "prepend",
    category: "explain",
    icon: "📝",
    tags: ["docs", "document", "comment", "jsdoc"],
    content: `You are documenting code. Follow these rules:
- Add JSDoc/TSDoc comments to all public functions and types.
- Write a module-level description at the top of the file.
- Explain WHY, not just WHAT — document the intent behind decisions.
- Add inline comments for complex or non-obvious logic.
- Generate a README section if asked for project-level docs.`,
  },
  {
    id: "convert-language",
    name: "Convert Language",
    description: "Convert code from one language to another",
    mode: "prepend",
    category: "convert",
    icon: "🔄",
    tags: ["convert", "translate", "language", "port"],
    content: `You are converting code between languages. Follow these rules:
- Preserve the exact behavior and logic of the original.
- Use idiomatic patterns for the target language.
- Note any language-specific differences (memory model, error handling, etc.).
- Show the converted code in full.
- Mention any libraries or packages needed in the target language.`,
  },
  {
    id: "voice-concise",
    name: "Voice Concise",
    description: "Optimize response for voice mode TTS",
    mode: "system",
    category: "voice",
    icon: "🎙️",
    tags: ["voice", "speak", "tts", "concise"],
    content: `You are responding in voice mode. Your text will be read aloud by TTS.
- Keep responses to 1-3 short sentences.
- Never output code, markdown, tables, JSON, or XML.
- Use natural spoken language — no bullet points or formatting.
- If code changes are needed, say "I'll apply the changes" and explain verbally.`,
  },
  {
    id: "explain-concept",
    name: "Explain Concept",
    description: "Explain a technical concept simply",
    mode: "prepend",
    category: "explain",
    icon: "🎓",
    tags: ["explain", "concept", "learn", "tutorial"],
    content: `You are explaining a technical concept. Follow these rules:
- Start with a one-sentence ELI5 (explain like I'm 5).
- Then provide a more detailed explanation with concrete examples.
- Compare to familiar analogies.
- Mention when you would (and wouldn't) use this in practice.
- If there are common misconceptions, address them directly.`,
  },
] as const;

/** Lookup a prompt by ID. */
export function getPrompt(id: string): PromptDefinition | undefined {
  return PROMPT_REGISTRY.find((p) => p.id === id);
}

/** Get prompts grouped by category. */
export function getPromptsByCategory(): Map<string, PromptDefinition[]> {
  const grouped = new Map<string, PromptDefinition[]>();
  for (const prompt of PROMPT_REGISTRY) {
    const list = grouped.get(prompt.category) || [];
    list.push(prompt);
    grouped.set(prompt.category, list);
  }
  return grouped;
}

/** Search prompts by name, description, or tags. */
export function searchPrompts(query: string): PromptDefinition[] {
  const q = query.toLowerCase();
  return PROMPT_REGISTRY.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags.some((t) => t.includes(q))
  );
}
