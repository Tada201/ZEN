import { useEffect, useState, useCallback, useRef } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { Message, ToolCall } from "../components/chat/types";

export function useStreamingChat(
  chatId: string | null,
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
) {
  const [isStreaming, setIsStreaming] = useState(false);
  const unlistenRefs = useRef<UnlistenFn[]>([]);

  const cleanup = useCallback(() => {
    unlistenRefs.current.forEach(u => u());
    unlistenRefs.current = [];
  }, []);

  useEffect(() => {
    if (!chatId) return;

    const setupListeners = async () => {
      cleanup();

      // Listen for text chunks
      const unlistenChunk = await listen<any>("chat:chunk", (event) => {
        if (event.payload.chat_id !== chatId) return;
        setIsStreaming(true);

        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant") return prev;

          const updated = { ...last };
          updated.content += event.payload.delta;
          
          // Basic interleaving into steps
          updated.steps = updated.steps || [];
          const lastStep = updated.steps[updated.steps.length - 1];
          if (lastStep && lastStep.type === "text") {
            lastStep.content = (lastStep.content || "") + event.payload.delta;
          } else {
            updated.steps.push({ type: "text", content: event.payload.delta });
          }

          const next = [...prev];
          next[next.length - 1] = updated;
          return next;
        });
      });

      // Listen for tool starts
      const unlistenToolStart = await listen<any>("tool:start", (event) => {
        if (event.payload.chat_id !== chatId) return;
        
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
        if (event.payload.chat_id !== chatId) return;

        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant") return prev;

          const updated = { ...last };
          updated.toolCalls = updated.toolCalls.map(tc => 
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
        if (event.payload.chat_id !== chatId) return;
        setIsStreaming(false);
        
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant") return prev;
          
          const next = [...prev];
          next[next.length - 1] = { ...last, status: "sent" };
          return next;
        });
      });

      // Listen for errors
      const unlistenError = await listen<any>("chat:error", (event) => {
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

      unlistenRefs.current.push(
        unlistenChunk, 
        unlistenToolStart, 
        unlistenToolComplete, 
        unlistenDone, 
        unlistenError,
        unlistenArtifactStart,
        unlistenArtifactDelta
      );
    };

    setupListeners();

    return () => cleanup();
  }, [chatId, setMessages, cleanup]);

  const abortStream = useCallback(async () => {
    // In a real app, you'd send an IPC command to cancel the token
    // await invoke("cancel_chat", { chatId });
    setIsStreaming(false);
  }, [chatId]);

  return { isStreaming, abortStream, setMessages };
}
