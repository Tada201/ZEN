let openUISystemPromptPromise: Promise<string> | null = null;

export function preloadOpenUISystemPrompt(): Promise<string> {
  if (!openUISystemPromptPromise) {
    openUISystemPromptPromise = import("./prompt").then((module) => module.buildOpenUISystemPrompt());
  }

  return openUISystemPromptPromise;
}

export function resetOpenUISystemPromptPreloadForTests() {
  openUISystemPromptPromise = null;
}
