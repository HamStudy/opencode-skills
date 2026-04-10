# Getting Started Guide

Your first 30 minutes with the AI SDK Agentic Loop skill.

---

## Minute 0-5: Understanding What You're Building

**An AI agent is:**

1. **AI thinks** → Processes your request
2. **AI acts** → Calls tools (functions) to do things
3. **AI loops** → Uses tool results to think again

**Example:**

```
You: "Fix the bug"
AI: I'll search for files
    → Calls searchFiles tool
AI: Found src/utils.ts, let me read it
    → Calls readFile tool
AI: I see the bug! Let me fix it
    → Calls writeFile tool
AI: Done! The bug was...
```

**Why this skill exists:**
The Vercel AI SDK is powerful but low-level. This skill shows you patterns for:

- Using multiple AI providers (OpenAI, Anthropic, etc.)
- Handling each provider's quirks automatically
- Building production-ready systems

---

## Minute 5-10: Setup

**1. Install dependencies:**

```bash
npm install ai @ai-sdk/openai zod dotenv
```

**2. Get an API key:**

- Go to https://platform.openai.com/api-keys
- Create a new key
- Copy it

**3. Create `.env` file:**

```bash
echo "OPENAI_API_KEY=sk-your-key-here" > .env
```

**4. Add `.env` to `.gitignore`:**

```bash
echo ".env" >> .gitignore
```

**⚠️ Never commit API keys!**

---

## Minute 10-15: Run Your First Agent

Create `first-agent.ts`:

```typescript
import { openai } from "@ai-sdk/openai"
import { streamText, tool } from "ai"
import { z } from "zod"
import "dotenv/config"

// Define a tool
const calculator = tool({
  description: "Add two numbers",
  parameters: z.object({
    a: z.number(),
    b: z.number(),
  }),
  execute: async ({ a, b }) => {
    return { result: a + b }
  },
})

// Run the agent
async function main() {
  const result = await streamText({
    model: openai("gpt-4o-mini"), // Cheap model for testing
    tools: { calculator },
    maxSteps: 5,
    messages: [
      {
        role: "user",
        content: "What is 123 + 456?",
      },
    ],
  })

  // Print response as it streams
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk)
  }
  console.log("\n[Done]")
}

main()
```

**Run it:**

```bash
npx tsx first-agent.ts
```

**Expected output:**

```
The result is 579.
[Done]
```

**What happened?**

1. Your code called `streamText()`
2. OpenAI received: "What is 123 + 456?"
3. OpenAI decided to call your `calculator` tool
4. Your `execute` function ran with `{a: 123, b: 456}`
5. OpenAI received the result: `{result: 579}`
6. OpenAI responded: "The result is 579."

---

## Minute 15-20: Add More Tools

Expand your agent:

```typescript
const tools = {
  calculator: tool({
    description: "Add two numbers",
    parameters: z.object({ a: z.number(), b: z.number() }),
    execute: async ({ a, b }) => ({ result: a + b }),
  }),

  getTime: tool({
    description: "Get current time",
    parameters: z.object({}), // No parameters needed
    execute: async () => ({
      time: new Date().toLocaleTimeString(),
    }),
  }),

  searchFiles: tool({
    description: "Search for files matching a pattern",
    parameters: z.object({
      pattern: z.string().describe("Glob pattern like '*.ts'"),
    }),
    execute: async ({ pattern }) => {
      // In real code, use fs.glob or similar
      return { files: ["src/index.ts", "src/utils.ts"] }
    },
  }),
}

// Use all tools
const result = await streamText({
  model: openai("gpt-4o-mini"),
  tools, // All tools available
  maxSteps: 10,
  messages: [
    {
      role: "user",
      content: "What time is it? Also find all TypeScript files.",
    },
  ],
})
```

---

## Minute 20-25: Switch Providers

**Use Anthropic instead of OpenAI:**

```bash
npm install @ai-sdk/anthropic
```

```typescript
import { anthropic } from "@ai-sdk/anthropic"

const result = await streamText({
  model: anthropic("claude-3-haiku"), // Just change this line
  tools,
  maxSteps: 10,
  messages: [{ role: "user", content: "What is 123 + 456?" }],
})
```

**Same code, different provider!**

---

## Minute 25-30: Next Steps

**You now understand the basics. What's next?**

### Level 1: Keep It Simple

- Add more tools to your agent
- Try different prompts
- Experiment with models

### Level 2: Add Structure

- Read [complete-agent.ts](references/examples/complete-agent.ts)
- Add a provider registry for multiple providers
- Handle errors properly

### Level 3: Production Ready

- Read [architecture.md](references/architecture.md)
- Add authentication management
- Add message transforms for provider quirks
- Set up monitoring and logging

### Common Next Steps

**Make it interactive:**

```typescript
import { createInterface } from "readline"

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
})

async function chat() {
  const messages = []

  while (true) {
    const input = await new Promise((resolve) => {
      rl.question("You: ", resolve)
    })

    if (input === "exit") break

    messages.push({ role: "user", content: input })

    const result = await streamText({
      model: openai("gpt-4o-mini"),
      tools,
      maxSteps: 10,
      messages,
    })

    let response = ""
    for await (const chunk of result.textStream) {
      process.stdout.write(chunk)
      response += chunk
    }

    messages.push({ role: "assistant", content: response })
    console.log("\n")
  }
}

chat()
```

---

## Common First-Time Issues

**"Cannot find module 'ai'"**
→ Run `npm install ai @ai-sdk/openai zod dotenv`

**"API key required"**
→ Check your `.env` file has `OPENAI_API_KEY=sk-...`

**"maxSteps reached"**
→ Agent is confused or task is too complex. Increase `maxSteps` or simplify prompt.

**"Rate limit exceeded"**
→ You're calling the API too fast. Add delays between calls or upgrade your plan.

---

## Cost Awareness

**Running agents costs real money.**

- GPT-4o-mini: ~$0.0001 per 1K tokens (very cheap)
- GPT-4o: ~$0.005 per 1K tokens (moderate)
- Claude 3 Opus: ~$0.015 per 1K tokens (expensive)

**A typical agent conversation:**

- 10 steps
- 500 tokens per step
- GPT-4o-mini: ~$0.0005 (half a cent)
- GPT-4o: ~$0.025 (2.5 cents)

**Tips:**

- Use `gpt-4o-mini` while learning
- Set `maxSteps` to prevent infinite loops
- Monitor your API usage dashboard

---

## Key Concepts Checklist

By now you should understand:

- [ ] What an agent is (AI + Tools + Loop)
- [ ] How tools work (description + parameters + execute)
- [ ] What `streamText` does (calls AI with tools)
- [ ] What `maxSteps` controls (tool loop limit)
- [ ] How to switch providers (change import + model)
- [ ] That this costs money (use cheap models while learning)

---

## Quick Reference

**Install:**

```bash
npm install ai @ai-sdk/openai zod dotenv
```

**Basic structure:**

```typescript
import { openai } from "@ai-sdk/openai"
import { streamText, tool } from "ai"
import { z } from "zod"

const myTool = tool({
  description: "What this tool does",
  parameters: z.object({ param: z.string() }),
  execute: async ({ param }) => ({ result: "..." }),
})

const result = await streamText({
  model: openai("gpt-4o-mini"),
  tools: { myTool },
  maxSteps: 10,
  messages: [{ role: "user", content: "..." }],
})
```

**Switch providers:**

```typescript
// OpenAI
import { openai } from "@ai-sdk/openai"
const model = openai("gpt-4o")

// Anthropic
import { anthropic } from "@ai-sdk/anthropic"
const model = anthropic("claude-3-sonnet")
```

**Run:**

```bash
npx tsx agent.ts
```

---

## Where to Go From Here

1. **Build something real** - File manager, code reviewer, data analyzer
2. **Read the examples** - [complete-agent.ts](references/examples/complete-agent.ts)
3. **Add complexity when needed** - See [architecture.md](references/architecture.md)
4. **Debug issues** - See [troubleshooting.md](references/troubleshooting.md)

**Remember:** Start simple. Add patterns when you feel pain, not before.
