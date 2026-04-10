# Provider Support Matrix

Quick reference for provider capabilities and special handling.

## Supported Providers

| Provider    | Package                       | Auth    | Tools | Vision | Caching | Streaming |
| ----------- | ----------------------------- | ------- | ----- | ------ | ------- | --------- |
| OpenAI      | `@ai-sdk/openai`              | API Key | ✅    | ✅     | ❌      | ✅        |
| Anthropic   | `@ai-sdk/anthropic`           | API Key | ✅    | ✅     | ✅      | ✅        |
| Google      | `@ai-sdk/google`              | API Key | ✅    | ✅     | ❌      | ✅        |
| Azure       | `@ai-sdk/azure`               | API Key | ✅    | ✅     | ❌      | ✅        |
| AWS Bedrock | `@ai-sdk/amazon-bedrock`      | API Key | ✅    | ✅     | ✅      | ✅        |
| Mistral     | `@ai-sdk/mistral`             | API Key | ✅    | ❌     | ❌      | ✅        |
| Cohere      | `@ai-sdk/cohere`              | API Key | ✅    | ❌     | ❌      | ✅        |
| Groq        | `@ai-sdk/groq`                | API Key | ✅    | ❌     | ❌      | ✅        |
| OpenRouter  | `@openrouter/ai-sdk-provider` | API Key | ✅    | ✅     | ✅      | ✅        |
| Copilot     | `@ai-sdk/github-copilot`      | OAuth   | ✅    | ❌     | ✅      | ✅        |

## Provider Quirks

### OpenAI

```typescript
// Special cases
const quirks = {
  // Codex uses OAuth + different endpoint
  codex: {
    auth: "oauth",
    endpoint: "chatgpt.com/backend-api",
    notes: "Requires ChatGPT account, not API key",
  },

  // o1/o3 support reasoning effort
  reasoning: {
    models: ["o1", "o3"],
    parameter: "reasoningEffort",
    values: ["low", "medium", "high"],
  },

  // Responses API for newer models
  responses: {
    models: ["gpt-5"],
    api: "responses",
  },
};
```

### Anthropic

```typescript
const quirks = {
  // Tool call ID sanitization
  toolId: {
    pattern: /[^a-zA-Z0-9_-]/g,
    replace: "_",
  },

  // Empty message filtering
  filterEmpty: true,

  // Caching support
  caching: {
    header: { cacheControl: { type: "ephemeral" } },
    appliesTo: ["system", "final"],
  },

  // Thinking mode for Opus/Sonnet 4.6
  thinking: {
    models: ["opus-4-6", "sonnet-4-6"],
    parameter: { type: "enabled", budget_tokens: number },
  },
};
```

### Mistral

```typescript
const quirks = {
  // 9-character tool call ID limit
  toolId: {
    maxLength: 9,
    padChar: "0",
  },

  // Message sequence fix required
  sequence: {
    invalid: "tool → user",
    fix: "tool → assistant('Done.') → user",
  },
};
```

### Google (Gemini)

```typescript
const quirks = {
  // Different parameter defaults
  defaults: {
    temperature: 1.0,
    topP: 0.95,
    topK: 64,
  },

  // Multimodal support
  modalities: ["text", "image", "video", "audio"],
};
```

### AWS Bedrock

```typescript
const quirks = {
  // Same normalization as Anthropic
  inherits: "anthropic",

  // Different caching header
  caching: {
    header: { cachePoint: { type: "default" } },
  },
};
```

### OpenRouter

```typescript
const quirks = {
  // Unified API for multiple providers
  proxy: true,

  // Caching support
  caching: {
    header: { cacheControl: { type: "ephemeral" } },
  },

  // Key remapping in providerOptions
  providerKey: "openrouter",
};
```

## Default Parameters by Provider

| Provider        | Temperature | Top P | Top K |
| --------------- | ----------- | ----- | ----- |
| OpenAI          | -           | -     | -     |
| Anthropic       | -           | -     | -     |
| Google          | 1.0         | 0.95  | 64    |
| Mistral         | -           | -     | -     |
| Cohere          | -           | -     | -     |
| Qwen            | 0.55        | 1.0   | -     |
| Minimax         | 1.0         | 0.95  | 20/40 |
| Kimi (base)     | 0.6         | -     | -     |
| Kimi (thinking) | 1.0         | 0.95  | -     |

## Authentication Methods

| Method   | Providers                | Storage                        |
| -------- | ------------------------ | ------------------------------ |
| API Key  | Most                     | Environment var or secure file |
| OAuth    | Copilot, some enterprise | Token store with refresh       |
| AWS IAM  | Bedrock                  | AWS credentials                |
| Azure AD | Azure                    | Azure credentials              |

## Context Window Sizes

| Provider      | Max Context |
| ------------- | ----------- |
| GPT-4         | 128K        |
| Claude        | 200K        |
| Gemini        | 1M          |
| Mistral Large | 128K        |
| Llama 3       | 128K        |

## Recommendations by Use Case

### Coding Assistant

- **Primary:** Claude (strong reasoning)
- **Fallback:** GPT-4 (reliable)
- **Budget:** Codex (ChatGPT OAuth)

### Content Generation

- **Primary:** GPT-4 (good prose)
- **Fallback:** Claude (creative)
- **Budget:** Gemini (competitive pricing)

### Multi-modal

- **Primary:** Gemini (native multimodal)
- **Fallback:** GPT-4V (good vision)
- **Budget:** - (multimodal is expensive)

### European Compliance

- **Primary:** Mistral (EU-based)
- **Fallback:** Claude (data handling)

### High Throughput

- **Primary:** Groq (fast inference)
- **Fallback:** - (depends on load)
