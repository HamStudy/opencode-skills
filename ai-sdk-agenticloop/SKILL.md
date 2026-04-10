---
name: ai-sdk-agenticloop
description: Build your own provider-agnostic agent system using Vercel AI SDK. Learn to implement authentication (API keys, OAuth), provider registry, message normalization, and special cases for 15+ providers (OpenAI, Anthropic, Codex, etc.). Use when creating agent systems that work across multiple AI providers without vendor lock-in.
compatibility: opencode
metadata:
  category: integration
  audience: developers
  version: "5"
---

# AI SDK Agentic Loop

Build AI agents that can use tools (search files, call APIs, run code) and work with any AI provider (OpenAI, Anthropic, Google, etc.) using the Vercel AI SDK.

## What You Will Build

An **agent** is an AI that can:

1. **Think** - Process your request using an LLM
2. **Act** - Call tools (functions) to gather information or make changes
3. **Loop** - Use tool results to think again, repeating until done

**Example conversation:**

```
User: "Fix the bug in my code"
Agent (thinks): I need to find and read the code first
Agent (acts): Calls searchFiles tool → finds "src/utils.ts"
Agent (acts): Calls readFile tool → reads the file
Agent (thinks): I see the bug. Let me fix it.
Agent (acts): Calls writeFile tool → fixes the bug
Agent (done): "Fixed! The bug was on line 23..."
```

This guide shows you how to build agents that:

- Work with **any AI provider** (switch from OpenAI to Anthropic by changing one string)
- Handle **provider quirks automatically** (message formatting, tool ID sanitization)
- Support **OAuth and API keys** with automatic token refresh
- Scale from **simple scripts to production systems**

---

## Prerequisites

**Required Knowledge:**

- Basic TypeScript/JavaScript
- Node.js fundamentals
- What an API key is

**Required Tools:**

- Node.js 18+ or Bun
- An API key from at least one provider (OpenAI, Anthropic, etc.)

**Install Dependencies:**

```bash
npm install ai @ai-sdk/openai zod
# Or if using Bun:
bun add ai @ai-sdk/openai zod
```

**Cost Warning:**
⚠️ **Running agents costs money.** Each "step" in the conversation calls the AI provider's API. A 10-step conversation with GPT-4 might cost $0.05-$0.50. Start with cheaper models like `gpt-4o-mini` while learning.

---

## Hello World: Your First Agent

Create a file called `agent.ts`:

```typescript
import { openai } from "@ai-sdk/openai";
import { streamText, tool } from "ai";
import { z } from "zod";
import "dotenv/config"; // Loads API keys from .env file

// 1. Define a tool (a function the AI can call)
const calculator = tool({
  description: "Add two numbers",
  parameters: z.object({
    a: z.number(),
    b: z.number(),
  }),
  execute: async ({ a, b }) => {
    console.log(`[Tool called] Adding ${a} + ${b}`);
    return { result: a + b };
  },
});

// 2. Run the agent
async function main() {
  const result = await streamText({
    model: openai("gpt-5.4-mini"), // Cheap model for testing
    tools: { calculator },
    maxSteps: 5, // Max tool calls before stopping
    messages: [
      {
        role: "user",
        content: "What is 123 + 456?",
      },
    ],
  });

  // Print the response as it streams in
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }
  console.log("\n[Done]");
}

main();
```

**Set up your API key:**

```bash
# Create .env file
echo "OPENAI_API_KEY=sk-your-key-here" > .env
```

**Run it:**

```bash
npx tsx agent.ts
# Or with Bun:
bun run agent.ts
```

**Expected output:**

```
[Tool called] Adding 123 + 456
The result is 579.
[Done]
```

### What Just Happened?

1. **streamText** - Called OpenAI with your message
2. **AI decided to use tool** - GPT-4 recognized this was a math problem
3. **Tool executed** - Your `calculator` function ran with `{a: 123, b: 456}`
4. **AI responded** - Used the tool result to answer your question
5. **maxSteps** - Limited to 5 tool calls to prevent infinite loops

### Key Concepts Explained

**What is `streamText`?**
A function from the AI SDK that:

- Sends messages to an AI provider
- Handles the tool-calling loop automatically
- Returns results as a stream (you get chunks as they're generated)

**What are `tools`?**
Functions you define that the AI can call. Each tool has:

- `description` - Tells the AI when to use it
- `parameters` - Zod schema defining what arguments the AI should pass
- `execute` - Your code that runs when the AI calls the tool

**What is `maxSteps`?**
The maximum number of AI↔Tool interactions. Each "step" is:

1. AI thinks and decides to call a tool
2. Tool executes and returns result
3. AI sees result and thinks again

Without `maxSteps`, a confused AI could loop forever calling tools.

---

## Core Concepts Glossary

Before diving deeper, understand these terms:

| Term                  | Definition                        | Example                                          |
| --------------------- | --------------------------------- | ------------------------------------------------ |
| **Provider**          | Company that hosts AI models      | OpenAI, Anthropic, Google                        |
| **Model**             | Specific AI version               | GPT-4, Claude 3, Gemini                          |
| **Agent**             | AI + Tools + Loop                 | Your application                                 |
| **Tool**              | Function the AI can call          | `searchFiles`, `readFile`                        |
| **Tool Call**         | When AI decides to use a tool     | AI sends `{tool: "readFile", args: {path: "x"}}` |
| **Streaming**         | Getting response word-by-word     | `for await (const chunk of stream)`              |
| **Blocking**          | Waiting for complete response     | `await generateText()`                           |
| **Provider-Agnostic** | Works with any provider           | Switch OpenAI → Anthropic easily                 |
| **Transform**         | Modifying messages for a provider | Fixing tool IDs for Mistral                      |
| **Registry**          | Map of available providers        | `providers.get("openai")`                        |

---

## Why Build a Provider Registry?

You might wonder: _"Why not just use `createOpenAI()` directly?"_

**Without a registry:**

```typescript
// Tightly coupled to OpenAI
import { createOpenAI } from "@ai-sdk/openai";

const openai = createOpenAI({ apiKey });
const model = openai.languageModel("gpt-4");
```

**Problems:**

- Hard to switch providers (find/replace across codebase)
- Can't fallback if OpenAI is down
- Provider quirks handled inline (messy)
- No centralized config

**With a registry:**

```typescript
// Switch providers by changing one string
const model = registry.getModel("openai", "gpt-4");
// const model = registry.getModel("anthropic", "claude-3")

// Automatic fallback
const model = await registry.getModelWithFallback(["openai", "anthropic"]);

// Quirks handled automatically
const messages = transform.normalize(rawMessages, "anthropic");
```

**When you DON'T need a registry:**

- Simple script using one provider
- Prototype/MVP
- You know you'll never switch providers

**When you DO need a registry:**

- Production system requiring reliability (fallbacks)
- Multiple providers for different use cases
- Team working on same codebase (centralized config)
- Testing with cheap models, deploying with expensive ones

---

## Documentation Structure

This skill is organized by complexity:

**Level 1: Just Getting Started**

- You're here (Hello World above)
- [Troubleshooting Common Errors](#common-errors)

**Level 2: Building Your First Agent**

- [Provider Registry Guide](references/provider-registry.md) - Set up multi-provider support
- [Complete Agent Example](references/examples/complete-agent.ts) - Working code combining all patterns

**Level 3: Production-Ready**

- [Authentication System](references/authentication.md) - OAuth, API keys, secure storage
- [Message Transforms](references/provider-transforms.md) - Handle provider quirks
- [Architecture Decisions](references/architecture.md) - Why these patterns work
- [Troubleshooting](references/troubleshooting.md) - Debugging production issues

**Level 4: Reference**

- [Provider Matrix](references/provider-matrix.md) - Capabilities comparison
- [Examples Directory](references/examples/) - More working code

**Recommended path:**

1. Run the Hello World above ☝️
2. Read [Complete Agent Example](references/examples/complete-agent.ts)
3. Build something simple
4. Add authentication when ready
5. Add transforms when you hit provider quirks

---

## Common Errors (And How to Fix Them)

### "Cannot find module 'ai'"

**Cause:** Dependencies not installed
**Fix:**

```bash
npm install ai @ai-sdk/openai zod
```

### "API key required"

**Cause:** `OPENAI_API_KEY` not set
**Fix:**

```bash
# Create .env file
echo "OPENAI_API_KEY=sk-..." > .env

# Or export directly
export OPENAI_API_KEY=sk-...
```

### "Rate limit exceeded"

**Cause:** Too many requests to provider
**Fix:** Add retry logic (see [troubleshooting.md](references/troubleshooting.md))

### "Tool call failed - invalid parameters"

**Cause:** AI sent wrong arguments to your tool
**Fix:** Check your Zod schema - make descriptions clearer

### "maxSteps reached"

**Cause:** Agent kept calling tools without finishing
**Fix:** Increase `maxSteps` or check if tools return clear results

### "Context length exceeded"

**Cause:** Conversation too long for model
**Fix:** Summarize conversation periodically (see [troubleshooting.md](references/troubleshooting.md))

---

## Environment Setup Checklist

Before building production agents:

- [ ] **Create `.env` file** with API keys
- [ ] **Add `.env` to `.gitignore`** (never commit keys!)
- [ ] **Install `dotenv`** for loading env vars
- [ ] **Set up TypeScript** (`tsconfig.json`)
- [ ] **Choose primary provider** (start with one)
- [ ] **Test with cheap model** (gpt-4o-mini, claude-3-haiku)
- [ ] **Budget monitoring** (track API costs)

---

## Key Design Decisions

### 1. Why `streamText` vs `generateText`?

**streamText** (used in examples):

- ✅ Shows response word-by-word (feels faster)
- ✅ Lower latency to first token
- ✅ Can cancel mid-generation
- ❌ Slightly more complex code (async iterator)

**generateText**:

- ✅ Simpler code (await and done)
- ✅ Access complete response immediately
- ❌ Must wait for full response

**Recommendation:** Use `streamText` for interactive agents, `generateText` for batch processing.

### 2. Why Provider-Agnostic?

**Scenario:** You build on OpenAI, hit rate limits during a product launch.

**Without registry:** Scramble to rewrite code for Anthropic. Downtime: hours.

**With registry:** Change one string: `getModel("openai", ...)` → `getModel("anthropic", ...)`. Downtime: seconds.

### 3. Why Not Just Use a Framework?

Frameworks like LangChain, LlamaIndex exist. This skill teaches the underlying patterns so you:

- Understand what's happening
- Can customize when frameworks don't fit
- Aren't locked into framework updates

---

## Next Steps

**New to agents?**

1. Modify the Hello World above to add more tools
2. Read [Complete Agent Example](references/examples/complete-agent.ts)
3. Build a simple file-search agent

**Building production system?**

1. Read [Architecture Decisions](references/architecture.md)
2. Set up [Provider Registry](references/provider-registry.md)
3. Add [Authentication](references/authentication.md)
4. Review [Provider Quirks](references/provider-transforms.md)

**Having issues?**
→ See [Troubleshooting](references/troubleshooting.md)

---

## Quick Reference

**Install providers:**

```bash
npm install @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google
```

**Basic agent structure:**

```typescript
import { openai } from "@ai-sdk/openai";
import { streamText, tool } from "ai";
import { z } from "zod";

const myTool = tool({
  description: "What this tool does",
  parameters: z.object({ param: z.string() }),
  execute: async ({ param }) => ({ result: "..." }),
});

const result = await streamText({
  model: openai("gpt-4o-mini"),
  tools: { myTool },
  maxSteps: 10,
  messages: [{ role: "user", content: "..." }],
});
```

**Switch providers:**

```typescript
// OpenAI
import { openai } from "@ai-sdk/openai";

const model = openai("gpt-4o");

// Anthropic
import { anthropic } from "@ai-sdk/anthropic";

const model = anthropic("claude-3-sonnet");

// Same code works for both!
const result = await streamText({ model, tools, messages });
```
