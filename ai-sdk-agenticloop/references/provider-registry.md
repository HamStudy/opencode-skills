# Provider Registry Implementation

Build a unified interface for managing multiple AI providers.

## Core Interface

```typescript
import type { LanguageModelV2 } from "@ai-sdk/provider";

interface ModelInfo {
  id: string;
  provider: string;
  capabilities: {
    input: string[]; // 'text', 'image', 'audio', 'pdf'
    output: string[]; // 'text', 'image'
    tools: boolean;
    reasoning: boolean;
  };
  contextWindow: number;
  pricing?: {
    input: number;
    output: number;
  };
}

interface ProviderAdapter {
  readonly id: string;
  readonly name: string;

  // Core method: get language model
  languageModel(modelId: string): LanguageModelV2;

  // Optional: list available models
  models?(): Promise<ModelInfo[]>;

  // Check if provider supports a feature
  supports?(feature: string): boolean;
}
```

## Basic Registry Implementation

```typescript
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createCohere } from "@ai-sdk/cohere";
import { createAzure } from "@ai-sdk/azure";

class ProviderRegistry {
  private providers = new Map<string, ProviderAdapter>();
  private modelCache = new Map<string, LanguageModelV2>();

  register(adapter: ProviderAdapter): void {
    this.providers.set(adapter.id, adapter);
  }

  get(providerId: string): ProviderAdapter {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(
        `Provider not found: ${providerId}. ` + `Registered: ${Array.from(this.providers.keys()).join(", ")}`,
      );
    }
    return provider;
  }

  getModel(providerId: string, modelId: string): LanguageModelV2 {
    const cacheKey = `${providerId}/${modelId}`;

    if (!this.modelCache.has(cacheKey)) {
      const provider = this.get(providerId);
      const model = provider.languageModel(modelId);
      this.modelCache.set(cacheKey, model);
    }

    return this.modelCache.get(cacheKey)!;
  }

  list(): string[] {
    return Array.from(this.providers.keys());
  }

  clearCache(): void {
    this.modelCache.clear();
  }
}

// Create global registry
export const registry = new ProviderRegistry();
```

## Adapter Implementations

### OpenAI Adapter

```typescript
class OpenAIAdapter implements ProviderAdapter {
  readonly id = "openai";
  readonly name = "OpenAI";

  private client;

  constructor(apiKey: string) {
    this.client = createOpenAI({ apiKey });
  }

  languageModel(modelId: string) {
    return this.client.languageModel(modelId);
  }

  async models(): Promise<ModelInfo[]> {
    // You could fetch this from OpenAI API or hardcode common models
    return [
      {
        id: "gpt-5.1",
        provider: "openai",
        capabilities: {
          input: ["text", "image", "audio", "pdf"],
          output: ["text"],
          tools: true,
          reasoning: false,
        },
        contextWindow: 128000,
      },
      {
        id: "o1",
        provider: "openai",
        capabilities: {
          input: ["text", "image"],
          output: ["text"],
          tools: true,
          reasoning: true,
        },
        contextWindow: 200000,
      },
    ];
  }

  supports(feature: string): boolean {
    const features = ["streaming", "tools", "vision", "json"];
    return features.includes(feature);
  }
}

// Register
registry.register(new OpenAIAdapter(process.env.OPENAI_API_KEY!));
```

### Anthropic Adapter

```typescript
class AnthropicAdapter implements ProviderAdapter {
  readonly id = "anthropic";
  readonly name = "Anthropic";

  private client;

  constructor(apiKey: string) {
    this.client = createAnthropic({ apiKey });
  }

  languageModel(modelId: string) {
    return this.client.languageModel(modelId);
  }

  supports(feature: string): boolean {
    const features = ["streaming", "tools", "vision", "caching"];
    return features.includes(feature);
  }
}

registry.register(new AnthropicAdapter(process.env.ANTHROPIC_API_KEY!));
```

### Dynamic Provider Loading

Load providers on-demand to reduce startup time:

```typescript
class DynamicProviderRegistry {
  private providers = new Map<string, () => ProviderAdapter>();
  private instances = new Map<string, ProviderAdapter>();

  register(id: string, factory: () => ProviderAdapter): void {
    this.providers.set(id, factory);
  }

  get(id: string): ProviderAdapter {
    if (!this.instances.has(id)) {
      const factory = this.providers.get(id);
      if (!factory) throw new Error(`Provider not registered: ${id}`);
      this.instances.set(id, factory());
    }
    return this.instances.get(id)!;
  }

  isRegistered(id: string): boolean {
    return this.providers.has(id);
  }
}

// Usage
const dynamicRegistry = new DynamicProviderRegistry();

dynamicRegistry.register("openai", () => new OpenAIAdapter(process.env.OPENAI_API_KEY!));

dynamicRegistry.register("anthropic", () => new AnthropicAdapter(process.env.ANTHROPIC_API_KEY!));

// Only instantiated when first accessed
const openai = dynamicRegistry.get("openai");
```

## Model Capabilities System

Check what a model supports before using features:

```typescript
interface CapabilityChecker {
  supportsModality(model: ModelInfo, modality: string): boolean;
  supportsTools(model: ModelInfo): boolean;
  supportsVision(model: ModelInfo): boolean;
  supportsCaching(model: ModelInfo): boolean;
}

const capabilityChecker: CapabilityChecker = {
  supportsModality(model, modality) {
    return model.capabilities.input.includes(modality) || model.capabilities.output.includes(modality);
  },

  supportsTools(model) {
    return model.capabilities.tools;
  },

  supportsVision(model) {
    return model.capabilities.input.includes("image");
  },

  supportsCaching(model) {
    // Only specific providers support caching
    return ["anthropic", "bedrock", "openrouter"].includes(model.provider);
  },
};

// Usage
const model = await registry.get("openai").models?.();
if (model && capabilityChecker.supportsVision(model[0])) {
  // Can send images
}
```

## Provider Discovery

Discover available providers from a registry API:

```typescript
interface ModelRegistryAPI {
  fetchModels(): Promise<ModelInfo[]>;
}

class ModelsDevRegistry implements ModelRegistryAPI {
  private baseUrl = "https://models.dev/api";

  async fetchModels(): Promise<ModelInfo[]> {
    const response = await fetch(`${this.baseUrl}/models`);
    if (!response.ok) throw new Error(`Failed to fetch models: ${response.status}`);

    const data = await response.json();
    return data.models.map(this.transformModel);
  }

  private transformModel(apiModel: any): ModelInfo {
    return {
      id: apiModel.id,
      provider: apiModel.provider,
      capabilities: {
        input: apiModel.capabilities?.input || ["text"],
        output: apiModel.capabilities?.output || ["text"],
        tools: apiModel.capabilities?.tools || false,
        reasoning: apiModel.capabilities?.reasoning || false,
      },
      contextWindow: apiModel.context_window || 4096,
      pricing: apiModel.pricing,
    };
  }
}

// Usage
const modelRegistry = new ModelsDevRegistry();
const allModels = await modelRegistry.fetchModels();

// Filter by capability
const visionModels = allModels.filter((m) => capabilityChecker.supportsVision(m));
```

## Factory Pattern for Providers

Create providers with different configurations:

```typescript
interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  retries?: number;
}

class ProviderFactory {
  static createOpenAI(config: ProviderConfig): ProviderAdapter {
    return new OpenAIAdapter(config.apiKey);
  }

  static createAnthropic(config: ProviderConfig): ProviderAdapter {
    return new AnthropicAdapter(config.apiKey);
  }

  static createAzure(config: ProviderConfig & { resource: string }): ProviderAdapter {
    // Azure needs special handling
    return new AzureAdapter(config);
  }

  static createCustom(
    id: string,
    factory: (config: ProviderConfig) => ProviderAdapter,
    config: ProviderConfig,
  ): ProviderAdapter {
    return factory(config);
  }
}

// Usage
const openai = ProviderFactory.createOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  timeout: 30000,
});

registry.register(openai);
```

## Error Handling

Standardize errors across providers:

```typescript
class ProviderError extends Error {
  constructor(
    message: string,
    public provider: string,
    public code: string,
    public retryable: boolean = false,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

function handleProviderError(error: unknown, provider: string): never {
  if (error instanceof ProviderError) throw error;

  const message = error instanceof Error ? error.message : String(error);

  // Classify errors
  if (message.includes("rate limit")) {
    throw new ProviderError(message, provider, "RATE_LIMIT", true);
  }
  if (message.includes("authentication") || message.includes("api key")) {
    throw new ProviderError(message, provider, "AUTH", false);
  }
  if (message.includes("context length") || message.includes("too long")) {
    throw new ProviderError(message, provider, "CONTEXT_LENGTH", false);
  }

  throw new ProviderError(message, provider, "UNKNOWN", true);
}

// Usage in adapter
class ResilientOpenAIAdapter extends OpenAIAdapter {
  async languageModel(modelId: string) {
    try {
      return super.languageModel(modelId);
    } catch (error) {
      handleProviderError(error, this.id);
    }
  }
}
```

## Best Practices

1. **Lazy Loading**: Don't instantiate providers until needed
2. **Caching**: Cache model instances to avoid recreating
3. **Error Standardization**: Convert provider-specific errors to unified format
4. **Capability Checking**: Always check capabilities before using features
5. **Timeout Handling**: Set reasonable timeouts for each provider
6. **Retry Logic**: Implement retry with backoff for transient errors

## Complete Example

See [examples/complete-agent.ts](examples/complete-agent.ts) for a full working implementation with all patterns combined.
