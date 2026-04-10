/**
 * MULTI-PROVIDER AGENT WITH TOOLOOPAGENT AND FALLBACK
 *
 * This example demonstrates:
 * - Using ToolLoopAgent across multiple providers
 * - Automatic provider fallback when one fails
 * - Unified agent interface regardless of provider
 *
 * PREREQUISITES:
 * 1. Create a .env file with:
 *    OPENAI_API_KEY=sk-your-key-here
 *    ANTHROPIC_API_KEY=sk-ant-your-key-here
 *
 * 2. Install dependencies:
 *    npm install ai @ai-sdk/openai @ai-sdk/anthropic zod dotenv
 *
 * 3. Run with:
 *    npx tsx multi-provider.ts
 */

import { ToolLoopAgent, tool } from "ai";
import { z } from "zod";

interface ModelConfig {
  provider: string;
  model: string;
  priority?: number;
}

/**
 * MultiProviderPool manages agents across multiple AI providers.
 *
 * Unlike the old approach using streamText with model instances,
 * ToolLoopAgent uses simple "provider/model" strings, making
 * multi-provider management much cleaner.
 */
class MultiProviderPool {
  private availableProviders = new Set<string>();

  private toolSet = {
    calculate: tool({
      description: "Calculate a mathematical expression",
      inputSchema: z.object({
        expression: z.string().describe("Math expression like '123 * 456'"),
      }),
      execute: async ({ expression }) => {
        try {
          // eslint-disable-next-line no-eval
          const result = eval(expression);
          return { result, success: true };
        } catch {
          return { result: null, success: false, error: "Invalid expression" };
        }
      },
    }),
    search: tool({
      description: "Search for information",
      inputSchema: z.object({
        query: z.string().describe("Search query"),
      }),
      execute: async ({ query }) => {
        return { results: [`Simulated result for: ${query}`] };
      },
    }),
  };

  constructor() {
    this.initProviders();
  }

  private initProviders() {
    // Check which providers have API keys configured
    if (process.env.OPENAI_API_KEY) {
      this.availableProviders.add("openai");
      console.log("[MultiProviderPool] OpenAI available");
    }
    if (process.env.ANTHROPIC_API_KEY) {
      this.availableProviders.add("anthropic");
      console.log("[MultiProviderPool] Anthropic available");
    }
    if (process.env.GOOGLE_API_KEY) {
      this.availableProviders.add("google");
      console.log("[MultiProviderPool] Google available");
    }

    if (this.availableProviders.size === 0) {
      console.warn(
        "[MultiProviderPool] No providers configured! Set API keys in .env",
      );
    }
  }

  /**
   * Check if a provider is available.
   */
  isProviderAvailable(providerId: string): boolean {
    return this.availableProviders.has(providerId);
  }

  /**
   * Get list of available providers.
   */
  getAvailableProviders(): string[] {
    return Array.from(this.availableProviders);
  }

  /**
   * Create a ToolLoopAgent for a specific provider and model.
   *
   * ToolLoopAgent uses the "provider/model" format (e.g., "openai/gpt-4o")
   * making it trivial to switch providers.
   */
  createAgent(
    providerId: string,
    modelId: string,
  ): ToolLoopAgent<typeof this.toolSet> {
    if (!this.isProviderAvailable(providerId)) {
      throw new Error(
        `Provider not available: ${providerId}. ` +
          `Available: ${this.getAvailableProviders().join(", ")}`,
      );
    }

    const fullModelId = `${providerId}/${modelId}`;

    return new ToolLoopAgent({
      model: fullModelId,
      instructions:
        "You are a helpful assistant with access to calculation and search tools.",
      tools: this.toolSet,
    });
  }

  /**
   * Execute with automatic fallback across providers.
   *
   * @param configs - Array of provider/model configs with priority
   * @param prompt - User's prompt
   *
   * Tries providers in priority order until one succeeds.
   */
  async executeWithFallback(
    configs: ModelConfig[],
    prompt: string,
  ): Promise<{ text: string; provider: string; model: string }> {
    // Sort by priority (highest first)
    const sorted = configs.sort(
      (a, b) => (b.priority || 0) - (a.priority || 0),
    );

    for (const config of sorted) {
      try {
        console.log(`\n[Trying] ${config.provider}/${config.model}...`);

        const agent = this.createAgent(config.provider, config.model);
        const result = await agent.run(prompt);

        console.log(`[Success] ${config.provider}/${config.model}`);

        return {
          text: result.text,
          provider: config.provider,
          model: config.model,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[Failed] ${config.provider}/${config.model}: ${message}`);
        continue;
      }
    }

    throw new Error("All providers failed");
  }

  /**
   * Execute with the best available provider.
   *
   * Automatically selects from available providers.
   */
  async executeWithBestProvider(
    prompt: string,
  ): Promise<{ text: string; provider: string; model: string }> {
    const configs: ModelConfig[] = [];

    // Define preferred models for each provider
    if (this.isProviderAvailable("openai")) {
      configs.push({ provider: "openai", model: "gpt-4o", priority: 100 });
      configs.push({ provider: "openai", model: "gpt-4o-mini", priority: 80 });
    }

    if (this.isProviderAvailable("anthropic")) {
      configs.push({ provider: "anthropic", model: "claude-sonnet-4", priority: 90 });
      configs.push({ provider: "anthropic", model: "claude-haiku", priority: 70 });
    }

    if (configs.length === 0) {
      throw new Error("No providers available");
    }

    return this.executeWithFallback(configs, prompt);
  }
}

// Usage example
async function main() {
  const pool = new MultiProviderPool();

  console.log("=== Example 1: Fallback Chain ===");
  try {
    const result1 = await pool.executeWithFallback(
      [
        { provider: "openai", model: "gpt-4o", priority: 100 },
        { provider: "anthropic", model: "claude-sonnet-4", priority: 90 },
        { provider: "openai", model: "gpt-4o-mini", priority: 50 },
      ],
      "Calculate 12345 * 67890 and explain the result",
    );

    console.log("\n[Result]");
    console.log(`Provider: ${result1.provider}/${result1.model}`);
    console.log(`Response: ${result1.text.slice(0, 200)}...`);
  } catch (error) {
    console.error("All providers failed:", error);
  }

  console.log("\n=== Example 2: Best Available Provider ===");
  try {
    const result2 = await pool.executeWithBestProvider(
      "What is the capital of France?",
    );

    console.log("\n[Result]");
    console.log(`Provider: ${result2.provider}/${result2.model}`);
    console.log(`Response: ${result2.text}`);
  } catch (error) {
    console.error("Failed:", error);
  }

  console.log("\n=== Example 3: Direct Agent Creation ===");
  try {
    const agent = pool.createAgent("openai", "gpt-4o-mini");
    const result3 = await agent.run("Calculate 2 + 2");
    console.log("[Result]", result3.text);
  } catch (error) {
    console.error("Failed:", error);
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("\n[Error]", error.message);
    console.error("\nDid you set up your .env file with API keys?");
    console.error("Create .env with:");
    console.error("  OPENAI_API_KEY=sk-your-key");
    console.error("  ANTHROPIC_API_KEY=sk-ant-your-key");
    process.exit(1);
  });
}

export { MultiProviderPool };
