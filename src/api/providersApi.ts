import { callCommand } from "./tauriClient";
import type { ModelInfo } from "@/lib/types/provider";

export interface ProviderConfigRequest {
  providerType: string;
  baseUrl: string;
  apiKey: string;
  displayName: string;
  headers?: Record<string, string>;
}

export const providersApi = {
  getAllAvailableModels: (provider?: string | null) =>
    callCommand<ModelInfo[]>("get_all_available_models", { provider: provider ?? null }),
  testProviderConnection: (config: ProviderConfigRequest) =>
    callCommand<ModelInfo[]>("test_provider_connection", { config }),
};
