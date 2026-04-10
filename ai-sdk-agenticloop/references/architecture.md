# Architecture Decisions

Why we built it this way and when to use each pattern.

---

## The Core Problem

You're building an AI agent. You start simple:

```typescript
import { openai } from "@ai-sdk/openai"

const result = await generateText({
  model: openai("gpt-4"),
  messages: [{ role: "user", content: "Hello" }],
})
```

This works! But then requirements grow:

- "Can we use Claude instead?"
- "We need to search files"
- "It's too slow, add caching"
- "OpenAI is down, we need a fallback"
- "Different models need different settings"

Each requirement adds complexity. Without structure, you end up with spaghetti code.

**This guide explains the patterns that keep your code organized as it grows.**

---

## Pattern 1: Provider Abstraction

### The Problem

Different AI providers have different APIs:

```typescript
// OpenAI
import { createOpenAI } from "@ai-sdk/openai"
const openai = createOpenAI({ apiKey })

// Anthropic
import { createAnthropic } from "@ai-sdk/anthropic"
const anthropic = createAnthropic({ apiKey })

// Your code now has provider-specific calls everywhere
if (provider === "openai") {
  model = openai.languageModel(modelId)
} else if (provider === "anthropic") {
  model = anthropic.languageModel(modelId)
}
// ... repeat for every provider
```

### The Solution

Create a unified interface:

```typescript
// All providers implement this interface
interface ProviderAdapter {
  languageModel(modelId: string): LanguageModel
}

// Usage - works for any provider
const model = registry.getModel("openai", "gpt-4")
const model = registry.getModel("anthropic", "claude-3")
```

### When to Use

**Use this when:**

- You need to switch providers (dev vs prod, fallback, etc.)
- Multiple team members use different providers
- You want to test with cheap models, deploy with expensive ones

**Skip this when:**

- Simple script using one provider
- Prototype/MVP
- You're certain you'll never switch

### The Trade-off

**With abstraction:**

- ✅ Switch providers by changing one string
- ✅ Test with GPT-4, deploy with Claude
- ✅ Centralized configuration
- ❌ Extra code to maintain
- ❌ Learning curve for new devs

**Without abstraction:**

- ✅ Less code
- ✅ Direct access to provider features
- ❌ Switching providers requires find/replace
- ❌ Configuration scattered

---

## Pattern 2: Transform Pipeline

### The Problem

Different providers need different message formats:

| Provider  | Tool ID Format        | Empty Messages | Sequence Rules    |
| --------- | --------------------- | -------------- | ----------------- |
| OpenAI    | Any string            | Allowed        | Flexible          |
| Anthropic | Alphanumeric only     | Rejected       | Flexible          |
| Mistral   | 9 chars, alphanumeric | Allowed        | tool→user invalid |

Without handling this, code works with one provider but fails with another.

### The Solution

Transform messages before sending:

```
Raw Messages
  ↓
Filter Modalities (remove unsupported content)
  ↓
Normalize for Provider (fix IDs, sequences)
  ↓
Apply Caching (if supported)
  ↓
Final Messages → Provider
```

### When to Use

**Use this when:**

- Supporting 3+ providers
- Hitting provider-specific errors
- Need caching/optimization

**Skip this when:**

- Only 1-2 providers
- You're okay handling errors as they come

### Real Example

**Without transforms (broken with Anthropic):**

```typescript
const messages = [
  { role: "user", content: "Hi" },
  { role: "assistant", content: "" }, // Empty!
]

// Anthropic: "Error: messages must have non-empty content"
```

**With transforms (works everywhere):**

```typescript
const normalized = normalizeMessages(messages, "anthropic")
// Empty messages filtered out

// Works with all providers ✓
```

---

## Pattern 3: Tool Abstraction

### The Problem

Tools need:

- Description (tells AI when to use them)
- Parameters (schema for arguments)
- Execution (your code)

Without structure, tools are inconsistent:

```typescript
// Tool 1 - simple
function search(query) { return results }

// Tool 2 - different pattern
const readFile = {
  execute: (path) => { return content },
  schema: { path: "string" }
}

// Tool 3 - yet another pattern
async function write(path, content) { ... }
```

### The Solution

Standardize with the `tool()` helper:

```typescript
const myTool = tool({
  description: "What this tool does",
  parameters: z.object({ ... }), // Zod schema
  execute: async (args) => {
    // Your implementation
    return result
  },
})
```

### Benefits

- **Type safety:** Zod validates arguments automatically
- **Documentation:** Description tells AI when to use it
- **Consistency:** All tools follow same pattern
- **Testing:** Easy to test execute() function in isolation

---

## Pattern 4: Authentication Abstraction

### The Problem

Different auth methods:

- **API Key:** Simple string
- **OAuth:** Token + refresh token + expiration
- **AWS:** Access key + secret key + region

Without abstraction, auth logic is scattered:

```typescript
// OpenAI - simple
headers["Authorization"] = `Bearer ${apiKey}`

// OAuth - complex
if (token.expiresAt < Date.now()) {
  token = await refreshToken(token)
}
headers["Authorization"] = `Bearer ${token.accessToken}`

// AWS - totally different
const signature = createAwsSignature(credentials)
headers["Authorization"] = signature
```

### The Solution

Unified auth interface:

```typescript
interface AuthCredentials {
  type: "api" | "oauth" | "aws"
  // Different fields based on type
}

// Usage - auth manager handles details
const auth = await authManager.getCredentials("openai")
const headers = authManager.createHeaders(auth)
```

### When to Use

**Use this when:**

- Mixing API keys and OAuth
- Need automatic token refresh
- Multiple auth providers

**Skip this when:**

- Only API keys
- Simple scripts

---

## Pattern 5: Streaming vs Blocking

### The Problem

Do you wait for the full response or show it as it comes?

**Blocking:**

```typescript
const result = await generateText({ model, messages })
console.log(result.text) // Full response at once
```

**Streaming:**

```typescript
const result = await streamText({ model, messages })
for await (const chunk of result.textStream) {
  process.stdout.write(chunk) // Word by word
}
```

### When to Use Each

**Blocking (generateText):**

- ✅ Simpler code
- ✅ Access full metadata (tokens used, finish reason)
- ✅ Easier error handling
- ❌ Must wait for complete response

**Use for:** Batch processing, scripts, APIs

**Streaming (streamText):**

- ✅ Lower latency (see first word immediately)
- ✅ Better UX (feels faster)
- ✅ Can cancel mid-generation
- ❌ More complex code
- ❌ Harder to get metadata

**Use for:** Chat interfaces, interactive apps

### Hybrid Approach

You can support both:

```typescript
async function runAgent(prompt: string, options: { stream?: boolean }) {
  const model = getModel()

  if (options.stream) {
    const result = await streamText({ model, messages })
    for await (const chunk of result.textStream) {
      yield chunk
    }
  } else {
    const result = await generateText({ model, messages })
    return result.text
  }
}
```

---

## Pattern 6: Caching

### The Problem

Repeated calls with same context waste money:

```typescript
// Each call sends full system prompt - $$$ adds up
await callModel([systemPrompt, ...context])
await callModel([systemPrompt, ...context])
await callModel([systemPrompt, ...context])
// Pay for systemPrompt 3 times
```

### The Solution

Mark messages for caching (Anthropic/Bedrock/OpenRouter):

```typescript
const cached = applyCaching(messages, "anthropic")
await callModel(cached) // System prompt cached
await callModel(cached) // Reuse cache (cheaper!)
await callModel(cached) // Reuse cache (cheaper!)
```

### When to Use

**Use this when:**

- Large system prompts
- Repeated similar queries
- Using Anthropic/Bedrock/OpenRouter

**Skip this when:**

- Short conversations
- One-off queries
- Provider doesn't support caching

---

## Scaling Patterns

### Small Project (1-2 providers)

```typescript
// Simple is fine
import { openai } from "@ai-sdk/openai"

const model = openai("gpt-4")
const result = await generateText({ model, messages })
```

### Medium Project (3-5 providers)

Add registry and basic transforms:

- Provider registry
- Simple message normalization
- Tool abstraction

### Large Project (Production)

Full architecture:

- Provider registry with caching
- Transform pipeline
- Auth abstraction with auto-refresh
- Error handling and retries
- Metrics and monitoring
- Rate limiting

### When to Add Complexity

**Start simple, add patterns when you feel pain:**

1. **Pain:** "Switching providers requires find/replace"
   **Solution:** Add provider registry

2. **Pain:** "Anthropic fails with my messages"
   **Solution:** Add transforms

3. **Pain:** "OAuth tokens keep expiring"
   **Solution:** Add auth manager

4. **Pain:** "Same system prompt sent repeatedly"
   **Solution:** Add caching

**Don't add patterns before you need them.**

---

## Anti-Patterns to Avoid

### 1. Premature Abstraction

**Bad:** Building full registry for a one-off script

**Better:** Start simple, abstract when you have 2+ providers

### 2. Ignoring Provider Quirks

**Bad:** "I'll deal with errors if they happen"

**Better:** Handle quirks proactively (see provider-transforms.md)

### 3. Hardcoding Model IDs

**Bad:** `if (modelId === "gpt-4") { ... }`

**Better:** Check capabilities, not model names

### 4. No Error Handling

**Bad:** `await streamText({ model, messages })`

**Better:** Wrap in try/catch, handle rate limits

### 5. Leaking API Keys

**Bad:** Committing `.env` file

**Better:** Add `.env` to `.gitignore`, use env vars

---

## Decision Framework

```
Building an agent?
│
├─ Only 1 provider?
│  └─ Use SDK directly (simplest)
│
├─ Might switch providers?
│  └─ Add provider registry
│
├─ Supporting 3+ providers?
│  └─ Add transform pipeline
│
├─ Mixing API keys and OAuth?
│  └─ Add auth abstraction
│
├─ Large system prompts?
│  └─ Add caching
│
└─ Production system?
   └─ Add all patterns + monitoring
```

---

## Common Questions

**Q: Should I use a framework instead?**

Frameworks like LangChain exist. This skill teaches the underlying patterns so you:

- Understand what's happening
- Can customize when frameworks don't fit
- Aren't locked into framework updates

**Q: How do I test this?**

See [complete-agent.ts](examples/complete-agent.ts) for testable patterns:

- Tools are pure functions (easy to unit test)
- Provider adapters are swappable (use mock in tests)
- Registry pattern allows dependency injection

**Q: What's the performance cost?**

Minimal:

- Registry: One Map lookup
- Transforms: O(n) where n = message count
- Caching: Saves money (slight latency to check cache)

**Q: Can I use this with [specific provider]?**

If Vercel AI SDK supports it, yes. Check [provider-matrix.md](provider-matrix.md) for tested providers.

---

## Summary

| Pattern            | Use When                      | Skip When                 |
| ------------------ | ----------------------------- | ------------------------- |
| Provider Registry  | 2+ providers, need fallback   | 1 provider, simple script |
| Transform Pipeline | 3+ providers, hitting errors  | 1-2 providers             |
| Auth Abstraction   | Mixing auth types             | Only API keys             |
| Caching            | Large prompts, repeated calls | Short conversations       |
| Streaming          | Interactive apps, chat        | Batch processing, scripts |

**Golden rule:** Start simple. Add patterns when you feel pain, not before.
