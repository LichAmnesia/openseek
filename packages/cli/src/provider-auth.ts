import type { LLMProvider } from "@openseek/provider";

export function providerRequiresApiKey(provider: LLMProvider): boolean {
  return provider.requiresApiKey !== false;
}

export function missingApiKeyMessage(provider: LLMProvider): string {
  const envHint =
    provider.id === "mikan"
      ? "OPENSEEK_API_KEY"
      : `${provider.id.toUpperCase().replaceAll("-", "_")}_API_KEY`;
  return `no API key for ${provider.id}. set OPENSEEK_API_KEY, ${envHint}, or ~/.openseek/config.toml`;
}
