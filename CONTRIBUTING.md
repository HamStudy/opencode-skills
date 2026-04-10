# Contributing to Agent Skills

Thank you for your interest in contributing! This guide will help you create high-quality skills that can be installed via `skills.sh`.

## Quick Start

1. Fork this repository
2. Create your skill directory: `mkdir my-skill/`
3. Write `SKILL.md` following the format below
4. Add supporting files in `references/`
5. Submit a Pull Request

## Skill Structure

### Required Files

```
my-skill/
└── SKILL.md              # Must contain frontmatter + content
```

### Optional Files

```
my-skill/
├── SKILL.md
└── references/           # Supporting documentation
    ├── *.md             # Additional guides
    └── examples/        # Code examples
        └── *.{ts,js,py} # Working examples
```

## SKILL.md Format

### Frontmatter (Required)

```yaml
---
name: my-skill              # Unique identifier (kebab-case)
description: >              # One-line description (used in listings)
  Brief description of what this skill does and when to use it.
compatibility: opencode     # Target platform
metadata:                   # Additional metadata
  category: integration     # integration | workflow | domain
  audience: developers      # developers | users | both
  version: "1.0"           # Skill version
---
```

### Content Structure

After the frontmatter, write clear, actionable content:

```markdown
# Skill Title

Brief overview of what the user will accomplish.

## What You Will Build/Do

Clear description of the outcome.

## Prerequisites

- Required knowledge
- Required tools
- Dependencies to install

## Getting Started

Step-by-step instructions starting from simplest possible example.

## Core Concepts

Explain key terms and concepts.

## Documentation Structure

Outline the sections/references available.

## Common Errors

Troubleshooting section for quick fixes.

## Next Steps

Guidance on where to go after completing basics.
```

## Writing Guidelines

### Do's

✅ Start with a working "Hello World" example  
✅ Use clear, concise language  
✅ Include copy-paste ready code snippets  
✅ Add troubleshooting for common errors  
✅ Link related documentation  
✅ Use relative paths for internal links  
✅ Test all code examples  
✅ Include prerequisites upfront  

### Don'ts

❌ Assume prior knowledge (define jargon)  
❌ Leave code examples incomplete  
❌ Skip error handling  
❌ Use absolute URLs for internal references  
❌ Include broken links  
❌ Forget to document dependencies  

## Categories

Choose the most appropriate category:

| Category | Use For | Example |
|----------|---------|---------|
| **integration** | Connecting to external services | API clients, OAuth, databases |
| **workflow** | Development patterns and practices | CI/CD, testing strategies, code review |
| **domain** | Specialized knowledge areas | AI/ML, security, performance optimization |

## Testing Your Skill

Before submitting:

1. **Validate frontmatter**: Ensure YAML is valid
2. **Test code examples**: Run all code snippets
3. **Check links**: Verify all internal links work
4. **Review formatting**: Ensure proper Markdown rendering

### Local Testing

Install your skill locally to test:

```bash
# Copy to OpenCode skills directory
cp -r my-skill ~/.config/opencode/skill/

# Test in OpenCode
opencode skill list
opencode skill info my-skill
```

## Submission Process

1. **Fork** the repository
2. **Create** your skill directory
3. **Write** comprehensive SKILL.md
4. **Test** locally
5. **Commit** with clear message: `Add skill: my-skill`
6. **Push** to your fork
7. **Open** Pull Request with:
   - Skill name and description
   - Category and audience
   - Testing checklist completed

## Review Criteria

Skills are reviewed for:

- ✅ Accurate frontmatter
- ✅ Clear, tested examples
- ✅ Proper documentation structure
- ✅ No broken links
- ✅ Follows writing guidelines
- ✅ Useful and focused scope

## Updating Skills

To update an existing skill:

1. Update `version` in frontmatter
2. Add to CHANGELOG section in SKILL.md
3. Test changes
4. Submit PR with `[update]` prefix

## Questions?

- Open an issue for skill proposals
- Start a discussion for design questions
- Check existing skills for reference

## Code of Conduct

- Be respectful and constructive
- Focus on improving developer experience
- Accept feedback gracefully
- Help others learn

Thank you for contributing!
