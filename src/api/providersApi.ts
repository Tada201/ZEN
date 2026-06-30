import { callCommand } from "./tauriClient";
import type { ModelInfo } from "@/lib/types/provider";

export interface ProviderConfigRequest {
  providerType: string;
  baseUrl: string;
  apiKey: string;
  displayName: string;
  headers?: Record<string, string>;
}

export interface ModelUsageSummary {
  model: string;
  requests: number;
  tokensIn: number;
  tokensOut: number;
  lastUsedAt: string;
}

export interface ModelUsageHistoryItem {
  id: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  createdAt: string;
}

export interface UsageDay {
  day: string;
  requests: number;
  tokensIn: number;
  tokensOut: number;
}

export interface ProviderUsageSnapshot {
  totalRequests: number;
  totalTokensIn: number;
  totalTokensOut: number;
  models: ModelUsageSummary[];
  history: ModelUsageHistoryItem[];
  daily: UsageDay[];
}

export const providersApi = {
  getAllAvailableModels: (provider?: string | null) =>
    callCommand<ModelInfo[]>("get_all_available_models", { provider: provider ?? null }),
  testProviderConnection: (config: ProviderConfigRequest) =>
    callCommand<ModelInfo[]>("test_provider_connection", { config }),
  getUsage: (modelIds: string[], periodDays?: number) =>
    callCommand<ProviderUsageSnapshot>("get_provider_usage", { modelIds, periodDays }),
  fetchNineRouterImageModels: () =>
    callCommand<ModelInfo[]>("fetch_9router_image_models"),
};
