import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText, generateText, tool } from "ai";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import { z } from "zod";

// Multi-provider agent pool with fallback support

interface ModelConfig {
  provider: string;
  model: string;
  priority?: number;
}

type ProviderClient = {
  languageModel: (modelId: string) => LanguageModelV2;
};

class MultiProviderPool {
  private providers = new Map<string, ProviderClient>();
  private models = new Map<string, LanguageModelV2>();
  private toolSet = {
    calculate: tool({
      parameters: z.object({
        expression: z.string(),
      }),
      execute: async ({ expression }) => {
        return { result: eval(expression) };
      },
    }),
    search: tool({
      parameters: z.object({
        query: z.string(),
      }),
      execute: async ({ query }) => {
        return { results: [`Result for: ${query}`] };
      },
    }),
  };

  constructor() {
    this.initProviders();
  }

  private initProviders() {
    if (process.env.OPENAI_API_KEY) {
      this.providers.set(
        "openai",
        createOpenAI({ apiKey: process.env.OPENAI_API_KEY }),
      );
    }
    if (process.env.ANTHROPIC_API_KEY) {
      this.providers.set(
        "anthropic",
        createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
      );
    }
  }

  getModel(providerId: string, modelId: string) {
    const cacheKey = `${providerId}/${modelId}`;

    if (!this.models.has(cacheKey)) {
      const provider = this.providers.get(providerId);
      if (!provider) {
        throw new Error(`Provider not available: ${providerId}`);
      }
      this.models.set(cacheKey, provider.languageModel(modelId));
    }

    return this.models.get(cacheKey);
  }

  async executeWithFallback(
    configs: ModelConfig[],
    prompt: string,
    options: { stream?: boolean; maxSteps?: number } = {},
  ) {
    const sorted = configs.sort(
      (a, b) => (b.priority || 0) - (a.priority || 0),
    );

    for (const config of sorted) {
      try {
        console.log(`Trying ${config.provider}/${config.model}...`);
        const model = this.getModel(config.provider, config.model);

        if (options.stream) {
          return await this.stream(model, prompt, options.maxSteps);
        } else {
          return await this.generate(model, prompt, options.maxSteps);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed: ${config.provider}/${config.model}`, message);
        continue;
      }
    }

    throw new Error("All providers failed");
  }

  private async stream(model: LanguageModelV2, prompt: string, maxSteps = 10) {
    const result = await streamText({
      model,
      tools: this.toolSet,
      maxSteps,
      messages: [{ role: "user", content: prompt }],
    });

    for await (const chunk of result.textStream) {
      process.stdout.write(chunk);
    }
  }

  private async generate(
    model: LanguageModelV2,
    prompt: string,
    maxSteps = 10,
  ) {
    const result = await generateText({
      model,
      tools: this.toolSet,
      maxSteps,
      messages: [{ role: "user", content: prompt }],
    });

    return result.text;
  }
}

// Usage example
async function main() {
  const pool = new MultiProviderPool();

  // Define fallback chain with generic model names
  // Use models appropriate for your use case - check provider docs for current IDs
  await pool.executeWithFallback(
    [
      { provider: "openai", model: "gpt-5.4", priority: 100 },
      { provider: "anthropic", model: "claude-sonnet-4-6", priority: 90 },
    ],
    "Calculate 12345 * 67890 and search for information about TypeScript",
    { stream: true, maxSteps: 5 },
  );
}

if (import.meta.main) {
  main().catch(console.error);
}
