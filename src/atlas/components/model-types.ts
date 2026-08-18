export type Model = {
  id: string;
  name: string;
  provider: string;
  description: string;
  category: "Smart" | "Fast" | "Balanced";
  capabilities: string[];
  available: boolean;
  contextWindow?: number;
  inputPricePerMToken?: number;
  outputPricePerMToken?: number;
  maxOutputTokens?: number;
  supportsReasoning?: boolean;
  reasoningConfigType?: "none" | "effort" | "budget";
};
