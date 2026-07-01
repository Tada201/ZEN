import { FullScreen } from "@openuidev/react-ui";
import { openAIReadableStreamAdapter } from "@openuidev/react-headless";
import { extendedLibrary } from "./genui";
import { openuiLibrary, openuiPromptOptions } from "@openuidev/react-ui/genui-lib";
import { useUIStore } from "@/lib/stores/useUIStore";
import { listenAppEvent } from "@/api/events";
import { chatApi } from "@/api";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { useChat } from "@/atlas/hooks/useChat";

interface OpenUICanvasProps {
  selectedModelId: string | null;
  selectedProvider: string | null;
}

export function OpenUICanvas({ selectedModelId, selectedProvider }: OpenUICanvasProps) {
  const { currentSessionId, handleCreateSession } = useChat();

  const handleOpenSettings = () => {
    const store = useUIStore.getState();
    store.setActiveSettingsTab("providers");
    store.setSettingsOpen(true);
  };

  // If no model is selected or list is empty, show the premium warning screen
  if (!selectedModelId || selectedModelId === "No Model") {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background p-6 text-center select-none">
        <div className="w-12 h-12 rounded-2xl bg-card border border-border/5 flex items-center justify-center mb-4">
          <Sparkles className="w-5 h-5 text-muted-foreground" />
        </div>
        <h3 className="text-sm font-bold text-primary-foreground uppercase tracking-wider mb-1">
          No Model Selected
        </h3>
        <p className="text-xs text-muted-foreground max-w-sm mb-4">
          Please configure and select an active inference model in settings to initialize the Generative UI canvas.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-4 bg-card/5 text-muted-foreground hover:bg-card/10 hover:text-primary-foreground rounded-lg border border-border/5 transition-all duration-200"
          onClick={handleOpenSettings}
        >
          Open Configuration
        </Button>
      </div>
    );
  }

  // Compile the system prompt using the custom catalog registered in extendedLibrary
  const promptOptions = { ...openuiPromptOptions, editMode: true, inlineMode: true };
  const systemPrompt = (extendedLibrary as any).prompt
    ? (extendedLibrary as any).prompt(promptOptions)
    : openuiLibrary.prompt(promptOptions);

  const processMessage = async ({ messages, abortController }: { messages: any[]; abortController: AbortController }) => {
    // 1. Ensure we have an active chat session to persist history in SQLite
    const activeSessionId = currentSessionId || (await handleCreateSession());
    if (!activeSessionId) {
      throw new Error("Failed to initialize chat session.");
    }

    const lastMessage = messages[messages.length - 1];
    const userMessage = lastMessage?.content || "";

    // 2. Setup the custom ReadableStream to bridge Tauri events to SSE chunks
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let firstChunkDelta: string | null = null;

        // Listen for the immediate first chunk (bypasses the 40ms buffer)
        const unlistenChunkFirst = await listenAppEvent("chat:chunk:first", (event) => {
          if (event.payload.chat_id === activeSessionId && event.payload.delta && event.payload.type !== "thought") {
            firstChunkDelta = event.payload.delta;
            const sseData = {
              choices: [
                {
                  delta: {
                    content: firstChunkDelta
                  }
                }
              ]
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(sseData)}\n\n`));
          }
        });

        // Register window listeners matching activeSessionId
        const unlistenChunk = await listenAppEvent("chat:chunk", (event) => {
          if (event.payload.chat_id === activeSessionId) {
            if (event.payload.type === "thought") return;
            let delta = event.payload.delta || "";

            // Strip the already-handled first-chunk prefix
            if (firstChunkDelta && delta.startsWith(firstChunkDelta)) {
              delta = delta.slice(firstChunkDelta.length);
              firstChunkDelta = null;
            }
            if (!delta) return;

            const sseData = {
              choices: [
                {
                  delta: {
                    content: delta
                  }
                }
              ]
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(sseData)}\n\n`));
          }
        });

        const unlistenDone = await listenAppEvent("chat:done", (event) => {
          if (event.payload.chat_id === activeSessionId) {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            cleanup();
            controller.close();
          }
        });

        const unlistenError = await listenAppEvent("chat:error", (event) => {
          if (event.payload.chat_id === activeSessionId) {
            controller.error(new Error(event.payload.error));
            cleanup();
          }
        });

        function cleanup() {
          unlistenChunkFirst();
          unlistenChunk();
          unlistenDone();
          unlistenError();
        }

        // Support manual cancellation
        abortController.signal.addEventListener("abort", () => {
          chatApi.abortChat(activeSessionId)
            .catch((e) => console.warn("Failed to abort stream:", e))
            .finally(() => {
              cleanup();
              try {
                controller.close();
              } catch (_) {}
            });
        });

        try {
          // Invoke the Tauri Rust command
          chatApi.sendMessage({
            chatId: activeSessionId,
            content: userMessage,
            model: selectedModelId,
            provider: selectedProvider,
            webSearch: false,
            temperature: null,
            maxTokens: null,
            topP: null,
            topK: null,
            presencePenalty: null,
            frequencyPenalty: null,
            repeatPenalty: null,
            seed: null,
            stop: null,
            thinking: null,
            generativeUi: true,
            tools: null,
            attachments: null,
            systemPrompt: systemPrompt
          }).catch((err) => {
            controller.error(err);
            cleanup();
          });
        } catch (err: any) {
          controller.error(err);
          cleanup();
        }
      }
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream" }
    });
  };

  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-background">
      <FullScreen
        processMessage={processMessage}
        streamProtocol={openAIReadableStreamAdapter()}
        componentLibrary={extendedLibrary as any}
        agentName="Zen Canvas"
        welcomeMessage={{
          title: "ZEN GENERATIVE CANVAS",
          description: "Design interactive visual assets in real time with our secure local LLM orchestrator."
        }}
      />
    </div>
  );
}
