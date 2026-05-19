import { useEffect, useState, useCallback, useRef } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useQueryClient } from "@tanstack/react-query";
import { Message, ToolCall } from "../components/chat/types";

export function useStreamingChat(
  chatId: string | null,
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
) {
  const [isStreaming, setIsStreaming] = useState(false);
  const unlistenRefs = useRef<UnlistenFn[]>([]);
  const queryClient = useQueryClient();

  // Performance: Buffer streaming deltas and flush once per animation frame
  // instead of triggering a React state update on every single token.
  const chunkBufferRef = useRef('');
  const chunkRafRef = useRef<number | null>(null);

  const flushChunkBuffer = useCallback(() => {
    const delta = chunkBufferRef.current;
    if (!delta) {
      chunkRafRef.current = null;
      return;
    }
    chunkBufferRef.current = '';
    chunkRafRef.current = null;

    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== "assistant") return prev;

      const updated = { ...last };
      updated.content += delta;

      // Basic interleaving into steps
      updated.steps = updated.steps || [];
      const lastStep = updated.steps[updated.steps.length - 1];
      if (lastStep && lastStep.type === "text") {
        lastStep.content = (lastStep.content || "") + delta;
      } else {
        updated.steps.push({ type: "text", content: delta });
      }

      const next = [...prev];
      next[next.length - 1] = updated;
      return next;
    });
  }, [setMessages]);

  const cleanup = useCallback(() => {
    unlistenRefs.current.forEach(u => u());
    unlistenRefs.current = [];
    // Flush any remaining buffered chunks on cleanup
    if (chunkRafRef.current) {
      cancelAnimationFrame(chunkRafRef.current);
      chunkRafRef.current = null;
    }
    if (chunkBufferRef.current) {
      flushChunkBuffer();
    }
  }, [flushChunkBuffer]);

  useEffect(() => {
    if (!chatId) return;

    const setupListeners = async () => {
      cleanup();

      console.log(`[useStreamingChat] Registering Tauri event listeners for chatId: ${chatId}`);

      // Listen for text chunks — buffered via rAF for performance
      const unlistenChunk = await listen<any>("chat:chunk", (event) => {
        if (event.payload.chat_id !== chatId) return;
        setIsStreaming(true);

        // Buffer the delta and schedule a flush on the next animation frame
        chunkBufferRef.current += event.payload.delta;
        if (!chunkRafRef.current) {
          chunkRafRef.current = requestAnimationFrame(flushChunkBuffer);
        }
      });

      // Listen for tool starts
      const unlistenToolStart = await listen<any>("tool:start", (event) => {
        if (event.payload.chat_id !== chatId) return;
        setIsStreaming(true);
        
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant") return prev;

          const updated = { ...last };
          updated.toolCalls = updated.toolCalls || [];
          
          const newTool: ToolCall = {
            id: event.payload.tool_call_id,
            name: event.payload.tool_name,
            status: "running",
            input: event.payload.arguments,
            output: ""
          };

          updated.toolCalls.push(newTool);
          updated.steps = updated.steps || [];
          updated.steps.push({ type: "tool-call", toolCall: newTool });

          const next = [...prev];
          next[next.length - 1] = updated;
          return next;
        });
      });

      // Listen for tool completions
      const unlistenToolComplete = await listen<any>("tool:complete", (event) => {
        console.log("[useStreamingChat] Received 'tool:complete' event:", event);
        if (event.payload.chat_id !== chatId) return;

        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant") return prev;

          const updated = { ...last };
          updated.toolCalls = (updated.toolCalls || []).map(tc => 
            tc.id === event.payload.tool_call_id 
              ? { ...tc, status: event.payload.status === "ok" ? "completed" : "error" as any } 
              : tc
          );

          if (updated.steps) {
            updated.steps = updated.steps.map(s => 
              (s.type === "tool-call" && s.toolCall?.id === event.payload.tool_call_id)
                ? { ...s, toolCall: { ...s.toolCall!, status: event.payload.status === "ok" ? "completed" : "error" as any } }
                : s
            );
          }

          const next = [...prev];
          next[next.length - 1] = updated;
          return next;
        });
      });

      // Listen for completion
      const unlistenDone = await listen<any>("chat:done", (event) => {
        console.log("[useStreamingChat] Received 'chat:done' event:", event);
        if (event.payload.chat_id !== chatId) return;
        setIsStreaming(false);

        const reason: string = event.payload.reason || "complete";
        const isCancelled = reason === "cancelled";

        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant") return prev;

          const next = [...prev];
          next[next.length - 1] = { 
            ...last, 
            status: isCancelled ? "cancelled" : "sent",
            // If cancelled, keep the partial content instead of reverting
            content: isCancelled && event.payload.content 
              ? last.content 
              : (event.payload.content || last.content),
          };
          return next;
        });

        // Invalidate messages query to sync with DB
        queryClient.invalidateQueries({ queryKey: ["messages", chatId] });
      });

      // Listen for errors
      const unlistenError = await listen<any>("chat:error", (event) => {
        console.error("[useStreamingChat] Received 'chat:error' event:", event);
        if (event.payload.chat_id !== chatId) return;
        setIsStreaming(false);
        
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant") return prev;
          
          const next = [...prev];
          next[next.length - 1] = { ...last, status: "failed", error: event.payload.error };
          return next;
        });
      });

      // Listen for artifacts
      const unlistenArtifactStart = await listen<any>("artifact:start", (event) => {
        if (event.payload.chat_id !== chatId) return;
        
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant") return prev;

          const updated = { ...last };
          updated.artifact = {
            type: event.payload.artifact_type as any,
            title: event.payload.title,
            language: event.payload.language,
            content: ""
          };

          const next = [...prev];
          next[next.length - 1] = updated;
          return next;
        });
      });

      const unlistenArtifactDelta = await listen<any>("artifact:delta", (event) => {
        if (event.payload.chat_id !== chatId) return;

        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant" || !last.artifact) return prev;

          const updated = { ...last };
          updated.artifact = {
            ...last.artifact,
            content: last.artifact.content + event.payload.delta
          };

          const next = [...prev];
          next[next.length - 1] = updated;
          return next;
        });
      });

      const unlistenArtifactComplete = await listen<any>("artifact:complete", (event) => {
        if (event.payload.chat_id !== chatId) return;

        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant" || !last.artifact) return prev;

          const next = [...prev];
          next[next.length - 1] = { ...last };
          // Potentially flag artifact as complete if UI needs it (e.g., adding `completed: true` to artifact state)
          return next;
        });
      });

      unlistenRefs.current.push(
        unlistenChunk,
        unlistenToolStart,
        unlistenToolComplete,
        unlistenDone,
        unlistenError,
        unlistenArtifactStart,
        unlistenArtifactDelta,
        unlistenArtifactComplete
      );
    };

    setupListeners();

    return () => cleanup();
  }, [chatId, setMessages, cleanup]);

  const abortStream = useCallback(async () => {
    try {
      if (chatId) {
        await invoke("abort_chat", { chatId });
      }
    } catch (e) {
      console.warn("Failed to abort chat:", e);
    }
    setIsStreaming(false);
  }, [chatId]);

  return { isStreaming, abortStream, setMessages };
}
