# Agent Instructions

This repository contains OpenCode skills - installable knowledge packages for agentic development.

## Repository Purpose

**NOT** a normal application - this is a skill collection for the [OpenCode](https://github.com/opencode-ai) ecosystem. Each subdirectory is an independent skill that can be installed via `skills.sh`.

## Skill Structure

```
skill-name/
├── SKILL.md              # Required: Frontmatter + skill content
└── references/           # Optional: Examples and docs
    ├── *.md
    └── examples/*.{ts,js,py}
```

### SKILL.md Frontmatter (Required)

```yaml
---
name: skill-name              # Kebab-case, unique
description: Brief description of what this skill does and when to use it
compatibility: opencode
metadata:
  category: integration       # integration | workflow | domain
  audience: developers        # developers | users | both
  version: "1.0"
---
```

## Critical Rules

### 1. NEVER Commit Unintended Files

- **`.agents/`** - OpenCode skill cache (already in `.gitignore`)
- **`skills-lock.json`** - Can be committed if you intend to
- Environment files, node_modules, etc.

**Always check `git status` before committing.**

### 2. Use Current Model Names

**DON'T use outdated models:**
- ❌ `gpt-4o`, `gpt-4o-mini` 
- ❌ `claude-3-*`

**DO use current models:**
- ✅ `gpt-5.4`, `gpt-5.4-mini`
- ✅ `claude-sonnet-4`, `claude-haiku`

**Verify current models:** `curl -s https://ai-gateway.vercel.sh/v1/models | jq`

### 3. Prefer ToolLoopAgent

When writing AI SDK examples, use `ToolLoopAgent` (not `streamText` with `maxSteps`):

```typescript
// ✅ CORRECT
import { ToolLoopAgent } from "ai";
const agent = new ToolLoopAgent({
  model: "openai/gpt-5.4-mini",
  tools: { myTool },
});

// ❌ OUTDATED - don't use in new examples
import { streamText } from "ai";
const result = await streamText({ model: openai("gpt-4"), maxSteps: 10 });
```

### 4. OAuth Examples Must Include Refresh Tokens

**MANDATORY** for any OAuth example - access tokens expire in 1-2 hours:

```typescript
// Token interface MUST include refreshToken
interface TokenData {
  accessToken: string;
  refreshToken: string;  // REQUIRED
  expiresAt: number;
}

// MUST implement refresh method
async refreshTokens(refreshToken: string): Promise<TokenData> { ... }

// MUST check expiration and auto-refresh
if (tokens.expiresAt < Date.now() / 1000 + 300) {
  tokens = await refreshTokens(tokens.refreshToken);
}
```

See `ai-sdk-agenticloop/references/examples/oauth-codex.ts` for complete implementation.

## Adding a New Skill

1. Create `my-skill/SKILL.md` with proper frontmatter
2. Add examples in `my-skill/references/examples/`
3. Test locally: `cp -r my-skill ~/.config/opencode/skill/`
4. Follow [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines

## Key Files

| File | Purpose |
|------|---------|
| `README.md` | Repository overview and installation |
| `CONTRIBUTING.md` | Detailed contribution guidelines |
| `ai-sdk-agenticloop/` | Reference skill - use as template |
| `.gitignore` | Excludes .agents/, .env, etc. |

## Git Workflow

```bash
# Commit skill changes
git add skill-name/
git commit -m "Add skill: skill-name"

# Push (NEVER force push - this is blocked)
git push
```

## Testing Skills

Install locally before submitting:

```bash
# Install to OpenCode
cp -r my-skill ~/.config/opencode/skill/

# Verify it loads
opencode skill list
opencode skill info my-skill
```
