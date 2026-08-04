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

/**
 * Providers whose built-in baseURL is a non-routable stub (custom) must get
 * one from config/env before any request — otherwise the SDK dials the stub,
 * burns 3 retries, and dumps an opaque connection error.
 */
export function providerRequiresBaseURL(provider: LLMProvider): boolean {
  return provider.requiresBaseURL === true;
}

export function missingBaseURLMessage(provider: LLMProvider): string {
  const envHint = `${provider.id.toUpperCase().replaceAll("-", "_")}_BASE_URL`;
  return (
    `provider "${provider.id}" needs a base URL. set base_url in ~/.openseek/config.toml ` +
    `(e.g. base_url = "http://localhost:8080/v1"), or export OPENSEEK_BASE_URL / ${envHint}, ` +
    `or re-run \`openseek setup\``
  );
}
