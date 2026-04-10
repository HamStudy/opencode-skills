/**
 * COMPLETE AGENT SYSTEM EXAMPLE
 * 
 * This file demonstrates a production-ready agent system with:
 * - Multi-provider support (OpenAI, Anthropic, etc.)
 * - Tool calling (search, read, write files)
 * - Provider registry pattern
 * - Both streaming and blocking responses
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
 *    npx tsx complete-agent.ts
 * 
 * COST WARNING: This example makes real API calls that cost money.
 * Start with cheap models (gpt-4o-mini, claude-3-haiku) while testing.
 */

import { createOpenAI } from "@ai-sdk/openai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { streamText, generateText, tool, ToolSet } from "ai"
import { z } from "zod"
import type { LanguageModelV2 } from "@ai-sdk/provider"
import "dotenv/config" // Automatically loads .env file

// =============================================================================
// SECTION 1: TYPE DEFINITIONS
// =============================================================================

/**
 * ModelInfo describes what a model can do.
 * This lets us check capabilities before using features.
 * 
 * Example: Before sending an image, check if capabilities.input includes "image"
 */
interface ModelInfo {
  id: string // Model ID like "gpt-4o" or "claude-3-sonnet"
  provider: string // Provider ID like "openai" or "anthropic"
  capabilities: {
    input: string[] // What inputs it accepts: ["text", "image", "audio", "pdf"]
    output: string[] // What outputs it produces: ["text", "image"]
    tools: boolean // Can it call tools?
    reasoning: boolean // Does it support reasoning mode?
  }
}

/**
 * ProviderAdapter is the interface every provider must implement.
 * This is the key abstraction that lets us switch providers easily.
 * 
 * Why this pattern? Without it, every tool call would need provider-specific code.
 * With it: getModel("openai", "gpt-4") and getModel("anthropic", "claude") 
 * both return the same interface.
 */
interface ProviderAdapter {
  readonly id: string // Unique provider identifier
  languageModel(modelId: string): LanguageModelV2 // Get a model instance
  models?(): Promise<ModelInfo[]> // Optional: list available models
}

// =============================================================================
// SECTION 2: PROVIDER REGISTRY
// =============================================================================

/**
 * ProviderRegistry manages multiple AI providers in one place.
 * 
 * BENEFITS:
 * 1. Switch providers by changing one string
 * 2. Cache model instances (don't recreate them)
 * 3. Centralized error handling
 * 4. Easy to add new providers
 * 
 * WITHOUT THIS: You'd have provider-specific code scattered throughout your app.
 * WITH THIS: One place to manage all providers.
 */
class ProviderRegistry {
  // Map of provider ID → adapter instance
  private providers = new Map<string, ProviderAdapter>()
  
  // Cache of "provider/model" → model instance
  // Caching is important: creating model instances has overhead
  private modelCache = new Map<string, LanguageModelV2>()

  /**
   * Register a provider adapter.
   * Call this once at startup for each provider you want to use.
   * 
   * Example:
   *   registry.register(new OpenAIAdapter(process.env.OPENAI_API_KEY))
   *   registry.register(new AnthropicAdapter(process.env.ANTHROPIC_API_KEY))
   */
  register(adapter: ProviderAdapter): void {
    this.providers.set(adapter.id, adapter)
  }

  /**
   * Get a provider adapter by ID.
   * Throws error if provider not registered.
   */
  get(providerId: string): ProviderAdapter {
    const provider = this.providers.get(providerId)
    if (!provider) {
      throw new Error(
        `Provider not found: ${providerId}. ` +
        `Registered: ${Array.from(this.providers.keys()).join(", ")}`
      )
    }
    return provider
  }

  /**
   * Get a model instance for a specific provider/model combo.
   * Uses caching to avoid recreating model instances.
   * 
   * Example:
   *   const model = registry.getModel("openai", "gpt-4o")
   *   const model = registry.getModel("anthropic", "claude-3-sonnet")
   */
  getModel(providerId: string, modelId: string): LanguageModelV2 {
    const cacheKey = `${providerId}/${modelId}`

    // Only create model if not in cache
    if (!this.modelCache.has(cacheKey)) {
      const provider = this.get(providerId)
      const model = provider.languageModel(modelId)
      this.modelCache.set(cacheKey, model)
    }

    return this.modelCache.get(cacheKey)!
  }
}

// =============================================================================
// SECTION 3: PROVIDER ADAPTERS
// =============================================================================

/**
 * OpenAI Adapter - wraps the OpenAI SDK
 * 
 * Each adapter handles provider-specific setup:
 * - Authentication
 * - SDK initialization
 * - Model instance creation
 */
class OpenAIAdapter implements ProviderAdapter {
  readonly id = "openai"
  private client // The @ai-sdk/openai client

  constructor(apiKey: string) {
    // Initialize the OpenAI SDK client
    this.client = createOpenAI({ apiKey })
  }

  /**
   * Get a language model instance.
   * The returned model can be used with streamText() or generateText()
   */
  languageModel(modelId: string) {
    return this.client.languageModel(modelId)
  }
}

/**
 * Anthropic Adapter - wraps the Anthropic SDK
 * Same pattern as OpenAIAdapter but for Claude models
 */
class AnthropicAdapter implements ProviderAdapter {
  readonly id = "anthropic"
  private client

  constructor(apiKey: string) {
    this.client = createAnthropic({ apiKey })
  }

  languageModel(modelId: string) {
    return this.client.languageModel(modelId)
  }
}

// =============================================================================
// SECTION 4: TOOL DEFINITIONS
// =============================================================================

/**
 * Tools are functions the AI can call to interact with the world.
 * 
 * Each tool has:
 * - description: Tells the AI when to use this tool
 * - parameters: Zod schema defining what arguments to pass
 * - execute: Your code that runs when AI calls the tool
 * 
 * HOW IT WORKS:
 * 1. User sends message: "Find TypeScript files"
 * 2. AI decides to call search tool
 * 3. AI generates arguments: { pattern: "**/*.ts" }
 * 4. Your execute() function runs with those arguments
 * 5. Result goes back to AI
 * 6. AI responds to user with the results
 */
const tools = {
  /**
   * Search for files matching a pattern.
   * AI uses this when user asks to find files.
   */
  search: tool({
    description: "Search for files matching a glob pattern (e.g., '**/*.ts')",
    parameters: z.object({
      pattern: z.string().describe("Glob pattern like '**/*.ts' or '*.json'"),
    }),
    execute: async ({ pattern }) => {
      // In a real app, you'd use fs.glob or similar
      console.log(`[Tool: search] Looking for: ${pattern}`)
      
      // Simulated results
      return { 
        files: ["src/index.ts", "src/utils.ts", "src/types.ts"]
      }
    },
  }),

  /**
   * Read contents of a file.
   * AI uses this to examine code, configs, etc.
   */
  readFile: tool({
    description: "Read the contents of a file",
    parameters: z.object({
      path: z.string().describe("Relative file path like 'src/index.ts'"),
    }),
    execute: async ({ path }) => {
      console.log(`[Tool: readFile] Reading: ${path}`)
      
      // Simulated file content
      return { 
        content: `// Simulated content of ${path}\nexport const hello = "world"`
      }
    },
  }),

  /**
   * Write content to a file.
   * AI uses this to create or modify files.
   */
  writeFile: tool({
    description: "Write content to a file (creates or overwrites)",
    parameters: z.object({
      path: z.string().describe("File path to write"),
      content: z.string().describe("Content to write to the file"),
    }),
    execute: async ({ path, content }) => {
      console.log(`[Tool: writeFile] Writing to: ${path}`)
      console.log(`[Tool: writeFile] Content preview: ${content.slice(0, 100)}...`)
      
      return { success: true, bytesWritten: content.length }
    },
  }),
}

// =============================================================================
// SECTION 5: AGENT SYSTEM
// =============================================================================

/**
 * AgentSystem is your main application class.
 * 
 * It orchestrates:
 * - Provider management
 * - Tool execution
 * - Streaming vs blocking responses
 * 
 * This is where you'd add your business logic:
 * - Custom logging
 * - Metrics tracking
 * - Error handling
 * - User session management
 */
class AgentSystem {
  private registry: ProviderRegistry

  constructor() {
    this.registry = new ProviderRegistry()

    // Register providers from environment variables
    // Only registers if the env var is set
    if (process.env.OPENAI_API_KEY) {
      this.registry.register(new OpenAIAdapter(process.env.OPENAI_API_KEY))
      console.log("[AgentSystem] OpenAI provider registered")
    } else {
      console.log("[AgentSystem] OPENAI_API_KEY not set, skipping OpenAI")
    }

    if (process.env.ANTHROPIC_API_KEY) {
      this.registry.register(new AnthropicAdapter(process.env.ANTHROPIC_API_KEY))
      console.log("[AgentSystem] Anthropic provider registered")
    } else {
      console.log("[AgentSystem] ANTHROPIC_API_KEY not set, skipping Anthropic")
    }
  }

  /**
   * Run an agent with the given prompt.
   * 
   * @param providerId - Which provider to use ("openai", "anthropic")
   * @param modelId - Which model ("gpt-4o", "claude-3-sonnet")
   * @param prompt - User's request
   * @param options - stream: true for real-time output, false for complete response
   * 
   * EXAMPLE USAGE:
   *   const agent = new AgentSystem()
   *   
   *   // Streaming (shows output as it's generated)
   *   await agent.runAgent("openai", "gpt-4o-mini", "Find all TS files", { stream: true })
   *   
   *   // Blocking (waits for complete response)
   *   const result = await agent.runAgent("anthropic", "claude-3-haiku", "Explain this code")
   */
  async runAgent(
    providerId: string,
    modelId: string,
    prompt: string,
    options: { stream?: boolean; maxSteps?: number } = {}
  ) {
    // Get the model from registry
    const model = this.registry.getModel(providerId, modelId)
    
    console.log(`\n[AgentSystem] Running with ${providerId}/${modelId}`)
    console.log(`[AgentSystem] Prompt: ${prompt.slice(0, 80)}...\n`)

    // Choose streaming or blocking based on options
    if (options.stream) {
      return this.runStreaming(model, prompt, options.maxSteps)
    } else {
      return this.runBlocking(model, prompt, options.maxSteps)
    }
  }

  /**
   * Run in streaming mode - outputs text as it's generated.
   * 
   * BENEFITS:
   * - Lower latency (see first word immediately)
   * - Better UX (feels more responsive)
   * - Can cancel mid-generation
   * 
   * USE WHEN: Interactive applications, chat interfaces
   */
  private async runStreaming(
    model: LanguageModelV2, 
    prompt: string, 
    maxSteps = 10
  ) {
    const result = await streamText({
      model,
      tools,
      maxSteps,
      messages: [{ role: "user", content: prompt }],
    })

    console.log("[Streaming Response]\n")
    
    // streamText returns an async iterator
    // Each chunk is a piece of the response
    for await (const chunk of result.textStream) {
      process.stdout.write(chunk)
    }

    console.log("\n\n[Streaming complete]")
  }

  /**
   * Run in blocking mode - waits for complete response.
   * 
   * BENEFITS:
   * - Simpler code (just await)
   * - Access full response object
   * - Easier error handling
   * 
   * USE WHEN: Batch processing, scripts, when you need the full response
   */
  private async runBlocking(
    model: LanguageModelV2, 
    prompt: string, 
    maxSteps = 10
  ) {
    const result = await generateText({
      model,
      tools,
      maxSteps,
      messages: [{ role: "user", content: prompt }],
    })

    console.log("[Blocking Response]\n")
    console.log(result.text)
    console.log("\n[Blocking complete]")
    
    // generateText returns metadata you might want:
    // - result.usage (token counts)
    // - result.finishReason (why it stopped)
    // - result.toolCalls (what tools were called)
    
    return result
  }
}

// =============================================================================
// SECTION 6: USAGE EXAMPLES
// =============================================================================

/**
 * Example: Running the agent with different providers and modes.
 * 
 * Uncomment the examples you want to try.
 * Remember: These make real API calls that cost money!
 */
async function main() {
  const agent = new AgentSystem()

  // Example 1: Simple streaming request with OpenAI (cheapest option)
  console.log("=== Example 1: OpenAI Streaming ===")
  await agent.runAgent(
    "openai", 
    "gpt-4o-mini", // Cheap model for testing
    "What files exist in this project?",
    { stream: true, maxSteps: 3 }
  )

  // Example 2: Blocking request with Anthropic
  console.log("\n=== Example 2: Anthropic Blocking ===")
  const result = await agent.runAgent(
    "anthropic",
    "claude-3-haiku", // Also cheap for testing
    "Read the file src/index.ts and explain what it does",
    { stream: false, maxSteps: 5 }
  )

  // Example 3: Multi-step agent task
  console.log("\n=== Example 3: Multi-step Task ===")
  await agent.runAgent(
    "openai",
    "gpt-4o-mini",
    "Find all TypeScript files, then read the first one and summarize it",
    { stream: true, maxSteps: 10 }
  )

  console.log("\n=== All examples complete ===")
}

// Run main() if this file is executed directly
if (import.meta.main) {
  main().catch((error) => {
    console.error("\n[Error]", error.message)
    console.error("\nDid you set up your .env file with API keys?")
    console.error("Create .env with:\n  OPENAI_API_KEY=sk-your-key")
    process.exit(1)
  })
}

// Export classes for use in other files
export { AgentSystem, ProviderRegistry, OpenAIAdapter, AnthropicAdapter }
