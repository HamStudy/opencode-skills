# Provider-Specific Transforms

Handle the quirks and requirements of different AI providers.

## Why Transforms Are Needed

Different providers have different rules for message formatting. Without transforms, your code works with one provider but fails with another.

### Example: Tool Call ID Formats

**The Problem:** Each provider requires different tool call ID formats:

| Provider  | Format              | Max Length  | Example          |
| --------- | ------------------- | ----------- | ---------------- |
| OpenAI    | Any string          | Unlimited   | `call_abc123xyz` |
| Anthropic | Alphanumeric + `_-` | Unlimited   | `call_abc-123`   |
| Mistral   | Alphanumeric only   | **9 chars** | `abc123xyz`      |

**Without transforms (broken):**

```typescript
// Your code generates this tool call ID
const toolCallId = "call_abc-123_xyz"

// Works with OpenAI ✓
// Works with Anthropic ✓
// FAILS with Mistral ✗ (too long, has hyphens)
// Error: "Invalid tool call ID format"
```

**With transforms (works everywhere):**

```typescript
// Mistral transform sanitizes the ID
const sanitizedId = sanitizeForMistral("call_abc-123_xyz")
// Result: "callabc12" (9 chars, alphanumeric only)

// Works with all providers ✓
```

---

## Message Types

Before understanding transforms, know the message structure:

```typescript
interface ModelMessage {
  role: "system" | "user" | "assistant" | "tool"
  content: string | MessagePart[]
  providerOptions?: Record<string, any>
}

type MessagePart =
  | { type: "text"; text: string }
  | { type: "image"; image: string | Uint8Array }
  | { type: "tool-call"; toolCallId: string; toolName: string; args: any }
  | { type: "tool-result"; toolCallId: string; toolName: string; result: any; isError?: boolean }
```

**Example conversation flow:**

```typescript
// 1. System prompt
{ role: "system", content: "You are a helpful assistant." }

// 2. User asks a question
{ role: "user", content: "What files are in the project?" }

// 3. AI decides to call a tool
{
  role: "assistant",
  content: [{
    type: "tool-call",
    toolCallId: "call_123",
    toolName: "listFiles",
    args: { path: "." }
  }]
}

// 4. Tool returns result
{
  role: "tool",
  content: [{
    type: "tool-result",
    toolCallId: "call_123", // Must match the tool-call ID!
    toolName: "listFiles",
    result: { files: ["src", "package.json"] }
  }]
}
```

---

## Anthropic/AWS Bedrock Normalization

**The Problem:** Anthropic rejects empty messages and requires sanitized tool IDs.

**Without transforms (broken):**

```typescript
const messages = [
  { role: "user", content: "Hi" },
  { role: "assistant", content: "" }, // Empty!
  { role: "user", content: "Hello?" },
]

// Anthropic Error: "Messages must not be empty"
```

**With transforms (works):**

```typescript
// Transform filters empty messages
const normalized = normalizeAnthropicMessages(messages)
// Result: Empty assistant message removed

// Works with Anthropic ✓
```

**Implementation:**

```typescript
function normalizeAnthropicMessages(msgs: ModelMessage[]): ModelMessage[] {
  return msgs
    .map((msg) => {
      // Remove empty string content
      if (typeof msg.content === "string" && msg.content === "") {
        return undefined
      }

      // Remove empty arrays
      if (Array.isArray(msg.content)) {
        const filtered = msg.content.filter((part) => {
          if (part.type === "text" || part.type === "reasoning") {
            return part.text !== ""
          }
          return true
        })
        if (filtered.length === 0) return undefined
        msg = { ...msg, content: filtered }
      }

      // Sanitize tool IDs (replace special chars with _)
      if (Array.isArray(msg.content)) {
        msg.content = msg.content.map((part) => {
          if (part.type === "tool-call" || part.type === "tool-result") {
            return {
              ...part,
              toolCallId: part.toolCallId.replace(/[^a-zA-Z0-9_-]/g, "_"),
            }
          }
          return part
        })
      }
      return msg
    })
    .filter((msg): msg is ModelMessage => msg !== undefined)
}
```

---

## Mistral/Devstral Normalization

**The Problem:** Mistral has TWO quirks:

1. Tool call IDs must be exactly 9 alphanumeric characters
2. Tool messages cannot be immediately followed by user messages

**Without transforms (broken):**

```typescript
const messages = [
  { role: "user", content: "Run the test" },
  {
    role: "assistant",
    content: [{ type: "tool-call", toolCallId: "call_abc123", toolName: "runTest", args: {} }],
  },
  {
    role: "tool",
    content: [{ type: "tool-result", toolCallId: "call_abc123", toolName: "runTest", result: "PASS" }],
  },
  { role: "user", content: "Great!" }, // Immediately after tool!
]

// Mistral Error: "Invalid message sequence"
```

**With transforms (works):**

```typescript
const normalized = normalizeMistralMessages(messages)
// Result: Inserts assistant message between tool and user

// Works with Mistral ✓
```

**Implementation:**

```typescript
function normalizeMistralMessages(msgs: ModelMessage[]): ModelMessage[] {
  const sanitizeId = (id: string) => {
    return id
      .replace(/[^a-zA-Z0-9]/g, "") // Remove non-alphanumeric
      .substring(0, 9) // Max 9 chars
      .padEnd(9, "0") // Pad to exactly 9
  }

  const result: ModelMessage[] = []

  for (let i = 0; i < msgs.length; i++) {
    const msg = msgs[i]
    const nextMsg = msgs[i + 1]

    // Sanitize tool IDs in this message
    if (Array.isArray(msg.content)) {
      msg.content = msg.content.map((part) => {
        if (part.type === "tool-call" || part.type === "tool-result") {
          return { ...part, toolCallId: sanitizeId(part.toolCallId) }
        }
        return part
      })
    }

    result.push(msg)

    // Fix sequence: tool → user is invalid, insert assistant
    if (msg.role === "tool" && nextMsg?.role === "user") {
      result.push({
        role: "assistant",
        content: [{ type: "text", text: "Done." }],
      })
    }
  }

  return result
}
```

---

## Default Parameters by Model

**The Problem:** Different models need different temperature/topP settings for optimal results.

| Model Family | Temperature | Top P    | Top K     | Why                         |
| ------------ | ----------- | -------- | --------- | --------------------------- |
| GPT-4        | -           | -        | -         | Provider defaults work well |
| Claude       | -           | -        | -         | Provider defaults work well |
| Gemini       | **1.0**     | **0.95** | **64**    | Google's recommended values |
| Qwen         | **0.55**    | **1.0**  | -         | Lower temp for reasoning    |
| Minimax      | **1.0**     | **0.95** | **20/40** | Varies by variant           |
| Kimi         | **0.6-1.0** | **0.95** | -         | Varies by variant           |

**Implementation:**

```typescript
function getDefaultParameters(modelId: string) {
  const id = modelId.toLowerCase()
  let temperature: number | undefined
  let topP: number | undefined
  let topK: number | undefined

  // Temperature
  if (id.includes("qwen")) temperature = 0.55
  else if (id.includes("gemini")) temperature = 1.0
  else if (id.includes("minimax")) temperature = 1.0
  else if (id.includes("kimi-k2")) {
    temperature = id.includes("thinking") ? 1.0 : 0.6
  }

  // Top P
  if (id.includes("qwen")) topP = 1.0
  else if (id.includes("gemini") || id.includes("minimax") || id.includes("kimi")) {
    topP = 0.95
  }

  // Top K
  if (id.includes("minimax-m2")) {
    topK = id.includes("m25") ? 40 : 20
  } else if (id.includes("gemini")) {
    topK = 64
  }

  return { temperature, topP, topK }
}

// Usage
const params = getDefaultParameters("gemini-pro")
const result = await streamText({
  model: google("gemini-pro"),
  ...params, // Spread in the defaults
  messages,
})
```

---

## Caching Implementation

**The Problem:** Repeated calls with the same context waste tokens and money.

**Solution:** Mark messages for caching (Anthropic/Bedrock/OpenRouter support this).

**Before caching (expensive):**

```typescript
// Each call sends full context - $$$ adds up
await streamText({ model, messages: [systemPrompt, ...longContext] })
await streamText({ model, messages: [systemPrompt, ...longContext] })
await streamText({ model, messages: [systemPrompt, ...longContext] })
// Pay for systemPrompt 3 times
```

**After caching (cheaper):**

```typescript
// Cache system prompt - only pay once
const cachedMessages = applyCaching(messages, "anthropic")
await streamText({ model, messages: cachedMessages })
await streamText({ model, messages: cachedMessages })
await streamText({ model, messages: cachedMessages })
// Pay for systemPrompt 1 time + small cache read fee
```

**Implementation:**

```typescript
function applyCaching(msgs: ModelMessage[], providerId: string): ModelMessage[] {
  const system = msgs.filter((m) => m.role === "system").slice(0, 2)
  const final = msgs.filter((m) => m.role !== "system").slice(-2)
  const toCache = [...system, ...final]

  const cacheConfigs: Record<string, any> = {
    anthropic: { cacheControl: { type: "ephemeral" } },
    openrouter: { cacheControl: { type: "ephemeral" } },
    bedrock: { cachePoint: { type: "default" } },
  }

  const cacheConfig = cacheConfigs[providerId]
  if (!cacheConfig) return msgs

  return msgs.map((msg) => {
    if (!toCache.includes(msg)) return msg

    // Anthropic/Bedrock: Apply at message level
    if (["anthropic", "bedrock"].includes(providerId)) {
      return {
        ...msg,
        providerOptions: { ...msg.providerOptions, ...cacheConfig },
      }
    }

    // Others: Apply to last content part
    if (Array.isArray(msg.content) && msg.content.length > 0) {
      const lastPart = msg.content[msg.content.length - 1]
      if (lastPart && typeof lastPart === "object") {
        lastPart.providerOptions = {
          ...lastPart.providerOptions,
          ...cacheConfig,
        }
      }
    }
    return msg
  })
}
```

---

## Reasoning/Thinking Support

**The Problem:** Some models (Claude Opus 4.6, Grok 3, o1/o3) support "thinking mode" for complex reasoning.

**Without reasoning:**

```typescript
// Model answers immediately
// Good for simple questions
// May miss complex logic
```

**With reasoning:**

```typescript
// Model thinks step-by-step internally
// Better for math, logic, complex analysis
// Costs more tokens (thinking uses tokens)
```

**Implementation:**

```typescript
function getReasoningOptions(modelId: string) {
  const id = modelId.toLowerCase()

  // Claude thinking mode
  if (id.includes("opus-4-6") || id.includes("sonnet-4-6")) {
    return {
      thinking: { type: "enabled", budget_tokens: 16000 },
    }
  }

  // Grok reasoning
  if (id.includes("grok-3-mini")) {
    return { reasoningEffort: "high" }
  }

  // OpenAI reasoning models
  if (id.includes("o1") || id.includes("o3")) {
    return { reasoningEffort: "medium" } // low | medium | high
  }

  return {}
}

// Usage
const reasoning = getReasoningOptions("claude-opus-4-6")
const result = await streamText({
  model,
  ...reasoning,
  messages,
})
```

---

## Provider Options Key Mapping

**The Problem:** Some providers use different keys in `providerOptions`.

**Example:** OpenRouter expects `openrouter` key, not `openrouter-provider`.

**Implementation:**

```typescript
const PROVIDER_KEY_MAP: Record<string, string> = {
  "github-copilot": "copilot",
  "amazon-bedrock": "bedrock",
  "google-vertex": "vertex",
  gateway: "gateway",
}

function remapProviderOptions(options: Record<string, any>, providerId: string): Record<string, any> {
  const sdkKey = PROVIDER_KEY_MAP[providerId]
  if (!sdkKey || sdkKey === providerId) return options

  const remapped = { ...options }
  if (providerId in remapped) {
    remapped[sdkKey] = remapped[providerId]
    delete remapped[providerId]
  }
  return remapped
}
```

---

## Modality Filtering

**The Problem:** Not all models support all input types (images, audio, PDFs).

**Without filtering (broken):**

```typescript
// User sends image to text-only model
const messages = [
  {
    role: "user",
    content: [
      { type: "text", text: "Describe this" },
      { type: "image", image: "data:image/png;base64,..." },
    ],
  },
]

// Model doesn't support images → Error
```

**With filtering (graceful):**

```typescript
// Filter removes unsupported parts, adds error message
const filtered = filterUnsupportedParts(messages, ["text"])
// Result: Image replaced with error text

// Model receives: "Describe this [Image not supported]"
```

**Implementation:**

```typescript
function filterUnsupportedParts(msgs: ModelMessage[], supportedModalities: string[]): ModelMessage[] {
  return msgs.map((msg) => {
    if (msg.role !== "user" || !Array.isArray(msg.content)) return msg

    const filtered = msg.content.map((part) => {
      if (part.type === "image") {
        const imageStr = part.image.toString()

        // Check if image is empty
        if (imageStr.startsWith("data:")) {
          const match = imageStr.match(/^data:([^;]+);base64,(.*)$/)
          if (match && (!match[2] || match[2].length === 0)) {
            return {
              type: "text",
              text: "ERROR: Image file is empty or corrupted.",
            }
          }
        }

        // Check if images are supported
        if (!supportedModalities.includes("image")) {
          return {
            type: "text",
            text: "ERROR: This model does not support image input.",
          }
        }
      }

      return part
    })

    return { ...msg, content: filtered }
  })
}
```

---

## Complete Transform Pipeline

Putting it all together:

```typescript
class ProviderTransform {
  transformMessages(
    msgs: ModelMessage[],
    providerId: string,
    modelId: string,
    capabilities: { input: string[] },
  ): ModelMessage[] {
    // 1. Remove unsupported content types
    msgs = filterUnsupportedParts(msgs, capabilities.input)

    // 2. Apply provider-specific normalization
    if (providerId === "anthropic" || providerId.includes("bedrock")) {
      msgs = normalizeAnthropicMessages(msgs)
    } else if (providerId.includes("mistral")) {
      msgs = normalizeMistralMessages(msgs)
    }

    // 3. Apply caching
    msgs = applyCaching(msgs, providerId)

    // 4. Remap provider options keys
    msgs = msgs.map((msg) => ({
      ...msg,
      providerOptions: remapProviderOptions(msg.providerOptions, providerId),
    }))

    return msgs
  }

  getDefaultParams(modelId: string) {
    return getDefaultParameters(modelId)
  }

  getSystemPrompt(modelId: string) {
    return selectSystemPrompt(modelId)
  }
}
```

**Usage:**

```typescript
const transform = new ProviderTransform()

// Before sending to any provider
const normalized = transform.transformMessages(rawMessages, "anthropic", "claude-3-sonnet", {
  input: ["text", "image"],
})

const result = await streamText({
  model: anthropic("claude-3-sonnet"),
  messages: normalized,
})
```

---

## Provider Quirks Quick Reference

| Provider     | Quirks                          | Transform Function           |
| ------------ | ------------------------------- | ---------------------------- |
| Anthropic    | Empty messages, tool ID chars   | `normalizeAnthropicMessages` |
| AWS Bedrock  | Same as Anthropic               | `normalizeAnthropicMessages` |
| Mistral      | 9-char tool IDs, sequence fix   | `normalizeMistralMessages`   |
| Devstral     | Same as Mistral                 | `normalizeMistralMessages`   |
| Gemini       | Temp=1.0, TopP=0.95, TopK=64    | `getDefaultParameters`       |
| Claude       | Provider defaults               | `getDefaultParameters`       |
| Kimi         | Temp varies by variant          | `getDefaultParameters`       |
| Qwen         | Temp=0.55, TopP=1.0             | `getDefaultParameters`       |
| Minimax      | Temp=1.0, TopP=0.95, TopK=20/40 | `getDefaultParameters`       |
| Grok         | Reasoning effort variants       | `getReasoningOptions`        |
| OpenAI o1/o3 | Reasoning effort control        | `getReasoningOptions`        |

---

## Debugging Transforms

**Enable logging to see what transforms are doing:**

```typescript
const DEBUG = process.env.DEBUG === "true"

function logTransform(stage: string, before: any, after: any) {
  if (DEBUG) {
    console.log(`[Transform: ${stage}]`)
    console.log("Before:", JSON.stringify(before, null, 2))
    console.log("After:", JSON.stringify(after, null, 2))
    console.log("---")
  }
}

// Usage in transform
function normalizeAnthropicMessages(msgs: ModelMessage[]): ModelMessage[] {
  logTransform("anthropic-start", msgs, null)
  const result = /* ... normalization logic ... */ logTransform("anthropic-end", null, result)
  return result
}
```

**Run with debugging:**

```bash
DEBUG=true bun run agent.ts
```
