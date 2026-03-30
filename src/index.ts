/**
 * Glitchgate Provider Extension
 *
 * Provides access to Glitchgate models via API key authentication.
 *
 * Usage:
 *   Set GLITCHGATE_API_KEY environment variable
 *   pi -e ./node_modules/glitchgate-pi
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// =============================================================================
// Constants
// =============================================================================

const GLITCHGATE_BASE_URL_VAR = "GLITCHGATE_BASE_URL";
const GLITCHGATE_BASE_URL = process.env[GLITCHGATE_BASE_URL_VAR] ?? "https://glitchgate.corp.mulliken.net/openai/v1";
const GLITCHGATE_API_KEY_VAR = "GLITCHGATE_API_KEY";

// =============================================================================
// Types
// =============================================================================

export interface GlitchgateModel {
  id: string;
  owned_by: string;
  capabilities?: {
    context_window?: number;
    max_tokens?: number;
    reasoning?: boolean;
    vision?: boolean;
  };
  pricing?: {
    input_token_cost: number;
    output_token_cost: number;
    cache_write_token_cost?: number;
    cache_read_token_cost?: number;
  };
}

// =============================================================================
// Helpers
// =============================================================================

export function formatModelName(id: string): string {
  const baseName = id.split("/").pop() ?? id;
  return baseName.replace(/[-_]/g, " ");
}

export function getInputTypes(model: GlitchgateModel): ("text" | "image")[] {
  return model.capabilities?.vision ? ["text", "image"] : ["text"];
}

export function transformModel(model: GlitchgateModel) {
  return {
    id: model.id,
    name: formatModelName(model.id),
    reasoning: model.capabilities?.reasoning ?? false,
    input: getInputTypes(model),
    cost: {
      input: model.pricing?.input_token_cost ?? 0,
      output: model.pricing?.output_token_cost ?? 0,
      cacheRead: model.pricing?.cache_read_token_cost ?? 0,
      cacheWrite: model.pricing?.cache_write_token_cost ?? 0,
    },
    contextWindow: model.capabilities?.context_window ?? 128000,
    maxTokens: model.capabilities?.max_tokens ?? 16000,
    // Glitchgate doesn't support the OpenAI "developer" role,
    // so we map it to "system" role instead.
    compat: {
      supportsDeveloperRole: false,
    },
  };
}

// =============================================================================
// Dynamic Model Fetching
// =============================================================================

export async function fetchGlitchgateModels(apiKey: string): Promise<GlitchgateModel[]> {
  const response = await fetch(`${GLITCHGATE_BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { data: GlitchgateModel[] };
  return data.data ?? [];
}

// =============================================================================
// Extension Entry Point
// =============================================================================

const glitchgate: (pi: ExtensionAPI) => Promise<void> = async (pi) => {
  const apiKey = process.env[GLITCHGATE_API_KEY_VAR];

  if (!apiKey) {
    console.error(`${GLITCHGATE_API_KEY_VAR} not set`);
    return;
  }

  try {
    const glitchgateModels = await fetchGlitchgateModels(apiKey);

    if (glitchgateModels.length === 0) {
      console.warn("Glitchgate: No models available");
      return;
    }

    const models = glitchgateModels.map(transformModel);

    pi.registerProvider("glitchgate", {
      baseUrl: GLITCHGATE_BASE_URL,
      apiKey: GLITCHGATE_API_KEY_VAR,
      api: "openai-completions",
      models,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Glitchgate: Failed to fetch models:", message);
  }
};

export default glitchgate;
