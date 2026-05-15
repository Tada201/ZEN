import { useChat, Message } from 'ai/react';

/**
 * Custom hook for agentic chat using Vercel AI SDK.
 * Manages conversation state and tool execution flows.
 */
export function useAgentChat() {

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
    id: 'zen-default-chat',
    initialMessages: [
      {
        id: '1',
        role: 'assistant',
        content: 'System initialized. Zen OSINT core ready for telemetry analysis. How can I assist you today?'
      }
    ],
    onResponse: (response: Response) => {
      console.log('[useAgentChat] Response received:', response);
    },
    onFinish: (message: Message) => {
      console.log('[useAgentChat] Message finished:', message);
    },
    onError: (error) => {
      console.error('[useAgentChat] Error:', error);
    }
  });

  return { messages, input, handleInputChange, handleSubmit, isLoading };
}
