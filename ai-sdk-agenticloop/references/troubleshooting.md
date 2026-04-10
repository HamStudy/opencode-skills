# Troubleshooting Guide

Real errors you'll encounter and exactly how to fix them.

## Before You Start Debugging

Enable debug logging to see what's happening:

```typescript
const DEBUG = process.env.DEBUG === "true"

function log(stage: string, data: any) {
  if (DEBUG) console.log(`[${stage}]`, data)
}

// Run with:
// DEBUG=true bun run agent.ts
```

---

## Installation Errors

### Error: "Cannot find module 'ai'"

```
error: Cannot find module 'ai'
Require stack:
- /path/to/agent.ts
```

**Cause:** Dependencies not installed
**Fix:**

```bash
npm install ai @ai-sdk/openai zod
# Or with Bun:
bun add ai @ai-sdk/openai zod
```

---

### Error: "Cannot find module 'dotenv/config'"

```
error: Cannot find module 'dotenv/config'
```

**Fix:**

```bash
npm install dotenv
```

Or remove the import if not using `.env` files:

```typescript
// Remove this line:
import "dotenv/config"

// And set env vars directly:
process.env.OPENAI_API_KEY = "sk-..."
```

---

## API Key Errors

### Error: "API key required"

```
Error: API key required
```

**Cause:** `OPENAI_API_KEY` environment variable not set
**Fix:**

```bash
# Option 1: Export in terminal
export OPENAI_API_KEY="sk-your-key-here"

# Option 2: Create .env file
echo "OPENAI_API_KEY=sk-your-key-here" > .env

# Option 3: Set in code (not recommended for production)
process.env.OPENAI_API_KEY = "sk-..."
```

---

### Error: "Invalid API key"

```
Error: 401 Unauthorized
{
  "error": {
    "message": "Incorrect API key provided",
    "type": "invalid_request_error"
  }
}
```

**Cause:** API key is wrong or revoked
**Check:**

1. Copy key from provider dashboard (no extra spaces)
2. Key format should be:
   - OpenAI: `sk-...` (starts with "sk-")
   - Anthropic: `sk-ant-...` (starts with "sk-ant-")

**Fix:** Regenerate key from provider dashboard

---

### Error: "No credentials found for provider"

```
Error: Provider not found: openai. Registered:
```

**Cause:** Provider not registered because env var was missing
**Fix:** Check your setup code:

```typescript
// Add logging to see what's happening:
if (process.env.OPENAI_API_KEY) {
  console.log("Registering OpenAI") // Should see this
  registry.register(new OpenAIAdapter(process.env.OPENAI_API_KEY))
} else {
  console.log("OPENAI_API_KEY not set") // If you see this, check .env
}
```

---

## Model Errors

### Error: "Model not found"

```
Error: 404 Not Found
{
  "error": {
    "message": "The model 'gpt-5' does not exist",
    "type": "invalid_request_error"
  }
}
```

**Cause:** Model ID is wrong or outdated
**Fix:** Check current model IDs:

```typescript
// These change frequently! Check provider docs:
// OpenAI: https://platform.openai.com/docs/models
// Anthropic: https://docs.anthropic.com/claude/docs/models-overview

// Common valid IDs:
const validModels = {
  openai: ["gpt-4o", "gpt-4o-mini", "o1", "o3-mini"],
  anthropic: ["claude-3-opus", "claude-3-sonnet", "claude-3-haiku"],
}
```

---

### Error: "Context length exceeded"

```
Error: 400 Bad Request
{
  "error": {
    "message": "This model's maximum context length is 128000 tokens...",
    "type": "invalid_request_error",
    "code": "context_length_exceeded"
  }
}
```

**Cause:** Conversation too long for model
**Fix - Truncate messages:**

```typescript
function truncateMessages(messages: any[], maxTokens: number = 120000): any[] {
  // Rough token estimate: 1 token ≈ 4 characters
  const estimateTokens = (text: string) => Math.ceil(text.length / 4)

  let totalTokens = 0
  const truncated = []

  // Add messages from the end (most recent) until we hit the limit
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)

    const tokens = estimateTokens(content)
    if (totalTokens + tokens > maxTokens) break

    totalTokens += tokens
    truncated.unshift(msg) // Add to front since we're iterating backwards
  }

  return truncated
}

// Usage
const truncated = truncateMessages(allMessages, 120000)
const result = await streamText({ model, messages: truncated })
```

---

## Tool Calling Errors

### Error: "maxSteps reached"

```
[AgentSystem] maxSteps reached after 10 steps
```

**Cause:** Agent kept calling tools without finishing
**Common reasons:**

1. Tool results are unclear
2. Agent is confused
3. maxSteps too low for complex task

**Fix:**

```typescript
// Option 1: Increase maxSteps
const result = await streamText({
  model,
  tools,
  maxSteps: 20, // Increase from default 10
  messages,
})

// Option 2: Check if tools return clear results
const myTool = tool({
  description: "...",
  parameters: z.object({ ... }),
  execute: async (args) => {
    const result = await doSomething(args)

    // Make result clear and actionable
    return {
      success: true,
      summary: "Completed X successfully", // Clear summary
      details: result,
    }
  },
})
```

---

### Error: "Tool execution failed"

```
Error: Tool execution failed: Cannot read property 'map' of undefined
```

**Cause:** Your tool's execute() function threw an error
**Fix - Add error handling:**

```typescript
const myTool = tool({
  description: "...",
  parameters: z.object({ ... }),
  execute: async (args) => {
    try {
      return await doSomething(args)
    } catch (error) {
      // Return error in a format the AI can understand
      return {
        error: true,
        message: error instanceof Error ? error.message : String(error),
      }
    }
  },
})
```

---

### Error: "Invalid tool parameters"

```
Error: 400 Bad Request
{
  "error": {
    "message": "Invalid schema for function 'myTool': ..."
  }
}
```

**Cause:** Zod schema is wrong or too complex
**Fix:** Keep schemas simple

```typescript
// BAD - Complex nested objects
const badSchema = z.object({
  data: z.object({
    nested: z.object({
      deep: z.string(),
    }),
  }),
})

// GOOD - Flat, simple schema
const goodSchema = z.object({
  query: z.string().describe("Search query"),
  limit: z.number().optional().describe("Max results (default: 10)"),
})

const myTool = tool({
  description: "Search for files. Use this when the user asks to find something.",
  parameters: goodSchema,
  execute: async ({ query, limit = 10 }) => {
    // ...
  },
})
```

---

## Provider-Specific Errors

### Error: "Invalid tool call ID format" (Mistral)

```
Error: 400 Bad Request
{
  "message": "Tool call ID must be alphanumeric and max 9 characters"
}
```

**Cause:** Mistral requires 9-char alphanumeric tool IDs
**Fix:** Apply Mistral transform

```typescript
// Add to your transform pipeline
if (providerId.includes("mistral")) {
  messages = normalizeMistralMessages(messages)
}

// Or inline fix:
const sanitizeMistralId = (id: string) =>
  id
    .replace(/[^a-zA-Z0-9]/g, "")
    .substring(0, 9)
    .padEnd(9, "0")
```

See [provider-transforms.md](provider-transforms.md) for full implementation.

---

### Error: "Invalid message sequence" (Mistral)

```
Error: 400 Bad Request
{
  "message": "Invalid message sequence: tool message cannot be followed by user message"
}
```

**Fix:** Insert assistant message between tool and user

```typescript
function fixMistralSequence(messages: any[]): any[] {
  const result = []
  for (let i = 0; i < messages.length; i++) {
    result.push(messages[i])

    // Check if current is tool and next is user
    if (messages[i].role === "tool" && messages[i + 1]?.role === "user") {
      result.push({
        role: "assistant",
        content: "Done.",
      })
    }
  }
  return result
}
```

---

### Error: "Empty messages not allowed" (Anthropic)

```
Error: 400 Bad Request
{
  "error": {
    "message": "messages: all messages must have non-empty content"
  }
}
```

**Fix:** Filter empty messages

```typescript
function filterEmptyMessages(messages: any[]): any[] {
  return messages.filter((msg) => {
    if (typeof msg.content === "string") {
      return msg.content.trim() !== ""
    }
    if (Array.isArray(msg.content)) {
      return msg.content.some((part: any) => {
        if (part.type === "text") return part.text !== ""
        return true
      })
    }
    return true
  })
}
```

---

## Rate Limiting Errors

### Error: "Rate limit exceeded"

```
Error: 429 Too Many Requests
{
  "error": {
    "message": "Rate limit reached for requests",
    "type": "rate_limit_error"
  }
}
```

**Fix - Add retry with exponential backoff:**

```typescript
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error: any) {
      if (error.message?.includes("rate limit")) {
        const delay = Math.pow(2, i) * 1000 // 1s, 2s, 4s
        console.log(`Rate limited. Retrying in ${delay}ms...`)
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      throw error
    }
  }
  throw new Error("Max retries exceeded")
}

// Usage
const result = await withRetry(() => streamText({ model, tools, messages }))
```

---

### Error: "Rate limit: Tokens per minute"

```
Error: 429 Too Many Requests
{
  "error": {
    "message": "Rate limit reached for tokens per minute"
  }
}
```

**Cause:** Sending too much text too quickly
**Fix:** Reduce context size or add delays between calls

```typescript
// Add delay between calls
await new Promise((r) => setTimeout(r, 1000))

// Or reduce context
const truncated = messages.slice(-10) // Only last 10 messages
```

---

## Streaming Errors

### Error: "Stream unexpectedly ended"

```
Error: Stream unexpectedly ended
```

**Cause:** Network interruption or provider error
**Fix - Add resilient streaming:**

```typescript
async function* resilientStream(model: any, messages: any[]) {
  let attempts = 0
  const maxAttempts = 3

  while (attempts < maxAttempts) {
    try {
      const result = await streamText({ model, messages })

      for await (const chunk of result.textStream) {
        yield chunk
      }

      return // Success
    } catch (error) {
      attempts++
      if (attempts >= maxAttempts) throw error

      console.log(`Stream failed, retry ${attempts}/${maxAttempts}...`)
      await new Promise((r) => setTimeout(r, 1000 * attempts))
    }
  }
}

// Usage
for await (const chunk of resilientStream(model, messages)) {
  process.stdout.write(chunk)
}
```

---

### Error: "Cannot read stream"

```
TypeError: result.textStream is not async iterable
```

**Cause:** Using wrong function (generateText instead of streamText)
**Fix:**

```typescript
// WRONG - generateText doesn't stream
const result = await generateText({ model, messages })
for await (const chunk of result.textStream) { // Error!

// CORRECT - use streamText for streaming
const result = await streamText({ model, messages })
for await (const chunk of result.textStream) { // Works!
```

---

## Authentication Errors

### Error: "OAuth token expired"

```
Error: OAuth token expired at 1234567890
```

**Fix - Auto-refresh token:**

```typescript
async function getValidToken(providerId: string): Promise<string> {
  const auth = await authStore.get(providerId)

  if (auth.type !== "oauth") {
    throw new Error("Not OAuth auth")
  }

  // Check expiration with 5-minute buffer
  if (auth.expiresAt < Date.now() / 1000 + 300) {
    console.log("Token expired, refreshing...")
    const refreshed = await refreshOAuthToken(auth.refreshToken)
    await authStore.set(providerId, refreshed)
    return refreshed.accessToken
  }

  return auth.accessToken
}
```

---

## Debugging Checklist

When something breaks:

- [ ] **Check API key is set:** `echo $OPENAI_API_KEY`
- [ ] **Check dependencies installed:** `npm list ai`
- [ ] **Enable debug logging:** `DEBUG=true bun run agent.ts`
- [ ] **Test with simple prompt:** Start with "Hello" not complex tasks
- [ ] **Use cheap model:** Test with `gpt-4o-mini` not `gpt-4o`
- [ ] **Check model ID:** Verify it's current on provider's website
- [ ] **Reduce context:** Try with just 1-2 messages
- [ ] **Check tool schemas:** Simplify if complex
- [ ] **Add try/catch:** Wrap execute() functions
- [ ] **Check rate limits:** Wait a minute and retry

---

## Getting Help

If you're stuck:

1. **Enable DEBUG mode** (see above)
2. **Try the simplest possible case** (one tool, one message)
3. **Check provider status** (OpenAI/Anthropic status pages)
4. **Test the raw SDK** (without your wrapper code)
5. **Read the AI SDK docs:** https://sdk.vercel.ai/docs
