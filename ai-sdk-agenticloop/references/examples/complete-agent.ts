/**
 * COMPLETE AGENT SYSTEM EXAMPLE WITH TOOLOOPAGENT
 *
 * This file demonstrates a production-ready agent system with:
 * - ToolLoopAgent for automatic tool loop management (modern approach)
 * - Multi-provider support (OpenAI, Anthropic, etc.)
 * - Tool calling (search, read, write files)
 * - Provider registry pattern
 * - Type-safe agent definitions
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
 * Start with cheap models (gpt-5.4-mini, claude-haiku) while testing.
 */

import { ToolLoopAgent, tool } from "ai";
import { z } from "zod";
import "dotenv/config"; // Automatically loads .env file

// =============================================================================
// SECTION 1: TYPE DEFINITIONS
// =============================================================================

/**
 * ModelInfo describes what a model can do.
 * This lets us check capabilities before using features.
 */
interface ModelInfo {
  id: string; // Model ID like "gpt-5.4" or "claude-3-sonnet"
  provider: string; // Provider ID like "openai" or "anthropic"
  capabilities: {
    input: string[]; // What inputs it accepts: ["text", "image", "audio", "pdf"]
    output: string[]; // What outputs it produces: ["text", "image"]
    tools: boolean; // Can it call tools?
    reasoning: boolean; // Does it support reasoning mode?
  };
}

// =============================================================================
// SECTION 2: TOOL DEFINITIONS
// =============================================================================

/**
 * Tools are functions the AI can call to interact with the world.
 *
 * Each tool has:
 * - description: Tells the AI when to use this tool
 * - inputSchema: Zod schema defining what arguments to pass
 * - execute: Your code that runs when AI calls the tool
 */
const tools = {
  /**
   * Search for files matching a pattern.
   * AI uses this when user asks to find files.
   */
  search: tool({
    description: "Search for files matching a glob pattern (e.g., '**/*.ts')",
    inputSchema: z.object({
      pattern: z.string().describe("Glob pattern like '**/*.ts' or '*.json'"),
    }),
    execute: async ({ pattern }: { pattern: string }) => {
      console.log(`[Tool: search] Looking for: ${pattern}`);

      // Simulated results
      return {
        files: ["src/index.ts", "src/utils.ts", "src/types.ts"],
      };
    },
  }),

  /**
   * Read contents of a file.
   * AI uses this to examine code, configs, etc.
   */
  readFile: tool({
    description: "Read the contents of a file",
    inputSchema: z.object({
      path: z.string().describe("Relative file path like 'src/index.ts'"),
    }),
    execute: async ({ path }) => {
      console.log(`[Tool: readFile] Reading: ${path}`);

      // Simulated file content
      return {
        content: `// Simulated content of ${path}\nexport const hello = "world"`,
      };
    },
  }),

  /**
   * Write content to a file.
   * AI uses this to create or modify files.
   */
  writeFile: tool({
    description: "Write content to a file (creates or overwrites)",
    inputSchema: z.object({
      path: z.string().describe("File path to write"),
      content: z.string().describe("Content to write to the file"),
    }),
    execute: async ({ path, content }) => {
      console.log(`[Tool: writeFile] Writing to: ${path}`);
      console.log(
        `[Tool: writeFile] Content preview: ${content.slice(0, 100)}...`,
      );

      return { success: true, bytesWritten: content.length };
    },
  }),
};

// =============================================================================
// SECTION 3: PROVIDER REGISTRY WITH TOOLOOPAGENT
// =============================================================================

/**
 * ProviderRegistry manages multiple AI providers in one place.
 *
 * BENEFITS:
 * 1. Switch providers by changing one string
 * 2. Centralized error handling
 * 3. Easy to add new providers
 * 4. Works seamlessly with ToolLoopAgent
 *
 * WITHOUT THIS: You'd have provider-specific code scattered throughout your app.
 * WITH THIS: One place to manage all providers.
 */
class ProviderRegistry {
  // Map of provider ID → boolean (registered or not)
  private providers = new Map<string, boolean>();

  /**
   * Register a provider.
   * Call this once at startup for each provider you want to use.
   */
  register(providerId: string, apiKey?: string) {
    if (apiKey) {
      this.providers.set(providerId, true);
      console.log(`[ProviderRegistry] ${providerId} provider registered`);
    } else {
      console.log(
        `[ProviderRegistry] ${providerId} API key not set, skipping`,
      );
    }
  }

  /**
   * Check if a provider is registered.
   */
  isRegistered(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  /**
   * Get a list of registered providers.
   */
  getRegisteredProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

// =============================================================================
// SECTION 4: AGENT SYSTEM WITH TOOLOOPAGENT
// =============================================================================

/**
 * AgentSystem is your main application class using ToolLoopAgent.
 *
 * It orchestrates:
 * - Provider management
 * - ToolLoopAgent creation and execution
 * - Multi-provider support
 *
 * This is where you'd add your business logic:
 * - Custom logging
 * - Metrics tracking
 * - Error handling
 * - User session management
 */
class AgentSystem {
  private registry: ProviderRegistry;

  constructor() {
    this.registry = new ProviderRegistry();

    // Register providers from environment variables
    this.registry.register("openai", process.env.OPENAI_API_KEY);
    this.registry.register("anthropic", process.env.ANTHROPIC_API_KEY);
  }

  /**
   * Create a ToolLoopAgent for the specified provider and model.
   *
   * @param providerId - Which provider to use ("openai", "anthropic")
   * @param modelId - Which model ("gpt-5.4", "claude-3-sonnet")
   * @param customInstructions - Optional custom system instructions
   *
   * EXAMPLE USAGE:
   *   const agent = new AgentSystem()
   *
   *   // Create an agent with OpenAI
   *   const openaiAgent = agent.createAgent("openai", "gpt-5.4-mini")
   *
   *   // Create an agent with Anthropic
   *   const anthropicAgent = agent.createAgent("anthropic", "claude-haiku")
   */
  createAgent(
    providerId: string,
    modelId: string,
    customInstructions?: string,
  ): ToolLoopAgent<typeof tools> {
    if (!this.registry.isRegistered(providerId)) {
      throw new Error(
        `Provider not registered: ${providerId}. ` +
          `Registered: ${this.registry.getRegisteredProviders().join(", ")}`,
      );
    }

    // ToolLoopAgent uses "provider/model" format for model IDs
    const fullModelId = `${providerId}/${modelId}`;

    return new ToolLoopAgent({
      model: fullModelId,
      instructions:
        customInstructions ||
        "You are a helpful assistant that can use tools to help users accomplish tasks. Be concise and direct in your responses.",
      tools,
    });
  }

  /**
   * Run an agent with the given prompt.
   *
   * @param providerId - Which provider to use
   * @param modelId - Which model
   * @param prompt - User's request
   *
   * EXAMPLE USAGE:
   *   const agent = new AgentSystem()
   *   const result = await agent.run("openai", "gpt-5.4-mini", "Find all TS files")
   *   console.log(result.text)
   */
  async run(
    providerId: string,
    modelId: string,
    prompt: string,
  ): Promise<{ text: string; toolCalls: unknown[] }> {
    console.log(`\n[AgentSystem] Running with ${providerId}/${modelId}`);
    console.log(`[AgentSystem] Prompt: ${prompt.slice(0, 80)}...\n`);

    const agent = this.createAgent(providerId, modelId);

    // ToolLoopAgent.run() automatically handles the tool loop
    // No need to manage maxSteps or conversation state manually
    const result = await agent.run(prompt);

    return {
      text: result.text,
      toolCalls: result.toolCalls || [],
    };
  }
}

// =============================================================================
// SECTION 5: USAGE EXAMPLES
// =============================================================================

/**
 * Example: Running the agent with different providers.
 *
 * Uncomment the examples you want to try.
 * Remember: These make real API calls that cost money!
 */
async function main() {
  const system = new AgentSystem();

  // Example 1: Simple request with OpenAI (cheapest option)
  console.log("=== Example 1: OpenAI Agent ===");
  const result1 = await system.run(
    "openai",
    "gpt-5.4-mini", // Cheap model for testing
    "What files exist in this project?",
  );
  console.log("\n[Response]", result1.text);
  console.log("[Tool calls made]", result1.toolCalls.length);

  // Example 2: Request with Anthropic
  console.log("\n=== Example 2: Anthropic Agent ===");
  const result2 = await system.run(
    "anthropic",
    "claude-haiku", // Also cheap for testing
    "Read the file src/index.ts and explain what it does",
  );
  console.log("\n[Response]", result2.text);

  // Example 3: Multi-step agent task
  console.log("\n=== Example 3: Multi-step Task ===");
  const result3 = await system.run(
    "openai",
    "gpt-5.4-mini",
    "Find all TypeScript files, then read the first one and summarize it",
  );
  console.log("\n[Response]", result3.text);
  console.log("[Tool calls made]", result3.toolCalls.length);

  // Example 4: Custom instructions
  console.log("\n=== Example 4: Custom Instructions ===");
  const customAgent = system.createAgent(
    "openai",
    "gpt-5.4-mini",
    "You are a file management expert. Be very thorough when analyzing files.",
  );
  const result4 = await customAgent.run("What files do we have?");
  console.log("\n[Response]", result4.text);

  console.log("\n=== All examples complete ===");
}

// Run main() if this file is executed directly
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

// Export classes for use in other files
export { AgentSystem, ProviderRegistry, tools };
