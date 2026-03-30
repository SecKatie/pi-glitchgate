/**
 * Tests for Glitchgate Provider Extension
 *
 * Run with: npm test
 */

import {
  formatModelName,
  getInputTypes,
  transformModel,
  fetchGlitchgateModels,
  type GlitchgateModel,
} from "../src/index.js";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ============================================================================
// Test runner (same pattern as pi-permission)
// ============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const tests: Array<{ name: string; fn: () => Promise<void> }> = [];

function test(name: string, fn: () => Promise<void>) {
  tests.push({ name, fn });
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual<T>(actual: T, expected: T, message: string) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`${message}:\n  expected: ${expectedStr}\n  actual:   ${actualStr}`);
  }
}

async function runTests() {
  console.log("Running glitchgate-pi tests...\n");
  const results: TestResult[] = [];

  for (const { name, fn } of tests) {
    try {
      await fn();
      results.push({ name, passed: true });
      console.log(`  ${name}... ✓`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ name, passed: false, error: message });
      console.log(`  ${name}... ✗`);
      console.log(`    ${message}`);
    }
  }

  console.log();
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

// ============================================================================
// formatModelName tests
// ============================================================================

test("formatModelName: simple model id", async () => {
  assertEqual(formatModelName("gpt-4o"), "gpt 4o", "simple model");
});

test("formatModelName: namespaced model id", async () => {
  assertEqual(formatModelName("openai/gpt-4o"), "gpt 4o", "namespaced model");
});

test("formatModelName: deeply namespaced model id", async () => {
  assertEqual(formatModelName("org/team/gpt-4o-mini"), "gpt 4o mini", "deeply namespaced");
});

test("formatModelName: underscores become spaces", async () => {
  assertEqual(formatModelName("claude_3_5_sonnet"), "claude 3 5 sonnet", "underscores");
});

test("formatModelName: mixed dashes and underscores", async () => {
  assertEqual(formatModelName("deepseek-r1_v2"), "deepseek r1 v2", "mixed separators");
});

test("formatModelName: no separators", async () => {
  assertEqual(formatModelName("llama"), "llama", "no separators");
});

test("formatModelName: empty string", async () => {
  assertEqual(formatModelName(""), "", "empty string");
});

test("formatModelName: trailing slash produces empty string (pop returns falsy but not nullish)", async () => {
  // "org/".split("/").pop() → "" which is NOT nullish, so ?? fallback doesn't trigger
  assertEqual(formatModelName("org/"), "", "trailing slash → empty string");
});

// ============================================================================
// getInputTypes tests
// ============================================================================

test("getInputTypes: model without capabilities defaults to text", async () => {
  const model: GlitchgateModel = { id: "test", owned_by: "test" };
  assertDeepEqual(getInputTypes(model), ["text"], "no capabilities");
});

test("getInputTypes: model with empty capabilities defaults to text", async () => {
  const model: GlitchgateModel = { id: "test", owned_by: "test", capabilities: {} };
  assertDeepEqual(getInputTypes(model), ["text"], "empty capabilities");
});

test("getInputTypes: model with vision false returns text only", async () => {
  const model: GlitchgateModel = { id: "test", owned_by: "test", capabilities: { vision: false } };
  assertDeepEqual(getInputTypes(model), ["text"], "vision false");
});

test("getInputTypes: model with vision true returns text and image", async () => {
  const model: GlitchgateModel = { id: "test", owned_by: "test", capabilities: { vision: true } };
  assertDeepEqual(getInputTypes(model), ["text", "image"], "vision true");
});

// ============================================================================
// transformModel tests
// ============================================================================

test("transformModel: minimal model with only required fields", async () => {
  const model: GlitchgateModel = { id: "test-model", owned_by: "test-org" };
  const result = transformModel(model);

  assertEqual(result.id, "test-model", "id");
  assertEqual(result.name, "test model", "name");
  assertEqual(result.reasoning, false, "reasoning default");
  assertDeepEqual(result.input, ["text"], "input default");
  assertEqual(result.cost.input, 0, "cost.input default");
  assertEqual(result.cost.output, 0, "cost.output default");
  assertEqual(result.cost.cacheRead, 0, "cost.cacheRead default");
  assertEqual(result.cost.cacheWrite, 0, "cost.cacheWrite default");
  assertEqual(result.contextWindow, 128000, "contextWindow default");
  assertEqual(result.maxTokens, 16000, "maxTokens default");
});

test("transformModel: fully specified model", async () => {
  const model: GlitchgateModel = {
    id: "openai/gpt-4o",
    owned_by: "openai",
    capabilities: {
      context_window: 200000,
      max_tokens: 32000,
      reasoning: true,
      vision: true,
    },
    pricing: {
      input_token_cost: 2.5,
      output_token_cost: 10.0,
      cache_write_token_cost: 3.125,
      cache_read_token_cost: 1.25,
    },
  };
  const result = transformModel(model);

  assertEqual(result.id, "openai/gpt-4o", "id preserved with namespace");
  assertEqual(result.name, "gpt 4o", "name from last segment");
  assertEqual(result.reasoning, true, "reasoning");
  assertDeepEqual(result.input, ["text", "image"], "input with vision");
  assertEqual(result.cost.input, 2.5, "cost.input");
  assertEqual(result.cost.output, 10.0, "cost.output");
  assertEqual(result.cost.cacheRead, 1.25, "cost.cacheRead");
  assertEqual(result.cost.cacheWrite, 3.125, "cost.cacheWrite");
  assertEqual(result.contextWindow, 200000, "contextWindow");
  assertEqual(result.maxTokens, 32000, "maxTokens");
});

test("transformModel: partial capabilities and pricing", async () => {
  const model: GlitchgateModel = {
    id: "anthropic/claude-3-5-sonnet",
    owned_by: "anthropic",
    capabilities: {
      context_window: 100000,
      reasoning: true,
    },
    pricing: {
      input_token_cost: 3.0,
      output_token_cost: 15.0,
    },
  };
  const result = transformModel(model);

  assertEqual(result.name, "claude 3 5 sonnet", "name");
  assertEqual(result.reasoning, true, "reasoning");
  assertDeepEqual(result.input, ["text"], "no vision");
  assertEqual(result.cost.input, 3.0, "cost.input");
  assertEqual(result.cost.output, 15.0, "cost.output");
  assertEqual(result.cost.cacheRead, 0, "cacheRead default");
  assertEqual(result.cost.cacheWrite, 0, "cacheWrite default");
  assertEqual(result.contextWindow, 100000, "contextWindow");
  assertEqual(result.maxTokens, 16000, "maxTokens default");
});

// ============================================================================
// fetchGlitchgateModels tests (with mocked fetch)
// ============================================================================

function createMockResponse(data: unknown, status = 200, statusText = "OK"): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => data,
  } as Response;
}

test("fetchGlitchgateModels: successful fetch returns models array", async () => {
  const models: GlitchgateModel[] = [
    { id: "openai/gpt-4o", owned_by: "openai" },
    { id: "anthropic/claude-3-5-sonnet", owned_by: "anthropic" },
  ];

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => createMockResponse({ data: models });

  try {
    const result = await fetchGlitchgateModels("test-key");
    assertEqual(result.length, 2, "model count");
    assertEqual(result[0].id, "openai/gpt-4o", "first model");
    assertEqual(result[1].id, "anthropic/claude-3-5-sonnet", "second model");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchGlitchgateModels: successful fetch with empty data array", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => createMockResponse({ data: [] });

  try {
    const result = await fetchGlitchgateModels("test-key");
    assertEqual(result.length, 0, "empty models");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchGlitchgateModels: missing data field returns empty array", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => createMockResponse({});

  try {
    const result = await fetchGlitchgateModels("test-key");
    assertEqual(result.length, 0, "no data field");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchGlitchgateModels: null data field returns empty array", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => createMockResponse({ data: null });

  try {
    const result = await fetchGlitchgateModels("test-key");
    assertEqual(result.length, 0, "null data");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchGlitchgateModels: sends correct authorization header", async () => {
  const originalFetch = globalThis.fetch;
  let capturedHeaders: HeadersInit | undefined;

  globalThis.fetch = async (_url: string, init?: RequestInit) => {
    capturedHeaders = init?.headers;
    return createMockResponse({ data: [] });
  };

  try {
    await fetchGlitchgateModels("my-secret-key");
    const headers = capturedHeaders as Record<string, string>;
    assertEqual(headers["Authorization"], "Bearer my-secret-key", "auth header");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchGlitchgateModels: 401 error throws", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => createMockResponse({}, 401, "Unauthorized");

  try {
    let threw = false;
    try {
      await fetchGlitchgateModels("bad-key");
    } catch (err) {
      threw = true;
      assert(err instanceof Error, "error is Error instance");
      assert(
        err.message.includes("401"),
        `error message contains status: ${err.message}`
      );
    }
    assert(threw, "should have thrown on 401");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchGlitchgateModels: 500 error throws", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => createMockResponse({}, 500, "Internal Server Error");

  try {
    let threw = false;
    try {
      await fetchGlitchgateModels("test-key");
    } catch (err) {
      threw = true;
      assert(err instanceof Error, "error is Error instance");
      assert(
        err.message.includes("500"),
        `error message contains status: ${err.message}`
      );
    }
    assert(threw, "should have thrown on 500");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ============================================================================
// Extension entry point integration tests
// ============================================================================

test("extension: logs error when API key is not set", async () => {
  const glitchgate = (await import("../src/index.js")).default;
  const errors: string[] = [];
  const warns: string[] = [];
  const logs: string[] = [];

  // Save original env
  const originalKey = process.env.GLITCHGATE_API_KEY;
  delete process.env.GLITCHGATE_API_KEY;

  const mockPi = {
    registerProvider: () => {
      throw new Error("should not register without API key");
    },
  } as unknown as ExtensionAPI;

  const originalError = console.error;
  const originalWarn = console.warn;
  const originalLog = console.log;
  console.error = (...args: unknown[]) => errors.push(args.join(" "));
  console.warn = (...args: unknown[]) => warns.push(args.join(" "));
  console.log = (...args: unknown[]) => logs.push(args.join(" "));

  try {
    await glitchgate(mockPi);
    assert(errors.length > 0, "should have logged an error");
    assert(errors[0].includes("GLITCHGATE_API_KEY"), "error mentions env var");
    assertEqual(logs.length, 0, "should not have logged success");
  } finally {
    process.env.GLITCHGATE_API_KEY = originalKey;
    console.error = originalError;
    console.warn = originalWarn;
    console.log = originalLog;
  }
});

test("extension: registers provider with models on success", async () => {
  const glitchgate = (await import("../src/index.js")).default;

  const originalKey = process.env.GLITCHGATE_API_KEY;
  process.env.GLITCHGATE_API_KEY = "test-key";

  const models: GlitchgateModel[] = [
    {
      id: "openai/gpt-4o",
      owned_by: "openai",
      capabilities: { context_window: 128000, reasoning: true },
    },
  ];

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => createMockResponse({ data: models });

  let capturedProvider = "";
  let capturedConfig: any = null;

  const mockPi = {
    registerProvider: (name: string, config: any) => {
      capturedProvider = name;
      capturedConfig = config;
    },
  } as unknown as ExtensionAPI;

  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(args.join(" "));

  try {
    await glitchgate(mockPi);
    assertEqual(capturedProvider, "glitchgate", "provider name");
    assertEqual(
      capturedConfig.baseUrl,
      "https://glitchgate.corp.mulliken.net/openai/v1",
      "base url"
    );
    assertEqual(capturedConfig.apiKey, "GLITCHGATE_API_KEY", "api key env var");
    assertEqual(capturedConfig.api, "openai-completions", "api type");
    assertEqual(capturedConfig.models.length, 1, "model count");
    assertEqual(capturedConfig.models[0].id, "openai/gpt-4o", "model id");
    assertEqual(capturedConfig.models[0].reasoning, true, "model reasoning");
    assertEqual(capturedConfig.models[0].contextWindow, 128000, "model contextWindow");
  } finally {
    process.env.GLITCHGATE_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  }
});

test("extension: warns when no models are returned", async () => {
  const glitchgate = (await import("../src/index.js")).default;

  const originalKey = process.env.GLITCHGATE_API_KEY;
  process.env.GLITCHGATE_API_KEY = "test-key";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => createMockResponse({ data: [] });

  let registerCalled = false;
  const mockPi = {
    registerProvider: () => {
      registerCalled = true;
    },
  } as unknown as ExtensionAPI;

  const warns: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warns.push(args.join(" "));

  try {
    await glitchgate(mockPi);
    assert(!registerCalled, "should not register with no models");
    assert(warns.length > 0, "should have warned");
    assert(warns[0].includes("No models"), "warn mentions no models");
  } finally {
    process.env.GLITCHGATE_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test("extension: logs error when fetch fails with network error", async () => {
  const glitchgate = (await import("../src/index.js")).default;

  const originalKey = process.env.GLITCHGATE_API_KEY;
  process.env.GLITCHGATE_API_KEY = "test-key";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError("fetch failed");
  };

  let registerCalled = false;
  const mockPi = {
    registerProvider: () => {
      registerCalled = true;
    },
  } as unknown as ExtensionAPI;

  const errors: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => errors.push(args.join(" "));

  try {
    await glitchgate(mockPi);
    assert(!registerCalled, "should not register on fetch error");
    assert(errors.length > 0, "should have logged error");
    assert(errors[0].includes("Failed to fetch models"), "error mentions fetch failure");
    assert(errors[0].includes("fetch failed"), "error includes original message");
  } finally {
    process.env.GLITCHGATE_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});

// ============================================================================
// Run all tests
// ============================================================================

runTests();
