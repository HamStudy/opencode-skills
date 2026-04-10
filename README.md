# Agent Skills Collection

A curated collection of installable skills for agentic development. Each skill provides specialized knowledge, workflows, and tools for building AI-powered applications.

## Available Skills

| Skill | Description | Category |
|-------|-------------|----------|
| **ai-sdk-agenticloop** | Build provider-agnostic agent systems using Vercel AI SDK. Learn authentication, provider registry, message normalization, and handle 15+ AI providers without vendor lock-in. | integration |

## Installation

These skills are designed to work with [OpenCode](https://github.com/anomalyco/opencode) and can be installed using `skills.sh`.

### Quick Install

```bash
# Install a specific skill
skills.sh install ai-sdk-agenticloop

# Install all skills
skills.sh install-all
```

### Manual Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/HamStudy/create-agent-skills.git
   cd agent-skills
   ```

2. Copy skill directories to your OpenCode skills folder:
   ```bash
   cp -r ai-sdk-agenticloop ~/.config/opencode/skill/
   ```

3. Skills will be automatically available in your OpenCode environment.

## Repository Structure

```
.
├── README.md                    # This file
├── CONTRIBUTING.md              # Guidelines for contributing new skills
├── ai-sdk-agenticloop/          # Individual skill directory
│   ├── SKILL.md                 # Main skill definition (required)
│   └── references/              # Supporting documentation and examples
│       ├── architecture.md
│       ├── authentication.md
│       ├── examples/
│       └── ...
└── [future-skills]/            # Additional skills follow same pattern
```

## Skill Structure

Each skill follows the OpenCode skill specification:

```
skill-name/
├── SKILL.md                     # Required: Frontmatter + skill content
└── references/                  # Optional: Supplementary materials
    ├── *.md                     # Documentation
    └── examples/                # Code examples
        └── *.ts, *.js, *.py     # Working examples
```

### SKILL.md Format

```yaml
---
name: skill-name
description: Brief description of what this skill does
compatibility: opencode
metadata:
  category: integration | workflow | domain
  audience: developers | users | both
  version: "1.0"
---

# Skill Title

Content here...
```

## Creating New Skills

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines on:
- Skill structure and format
- Frontmatter requirements
- Writing effective skill content
- Testing and validation
- Submission process

## Categories

- **integration**: Connecting with external services, APIs, and platforms
- **workflow**: Development workflows, patterns, and best practices
- **domain**: Specialized knowledge for specific domains (AI, databases, etc.)

## Compatibility

All skills in this repository are compatible with:
- OpenCode CLI
- OpenCode IDE integration
- skills.sh installation method

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for:
- How to propose a new skill
- Style guidelines
- Review process
- Code of conduct

## License

[MIT License](./LICENSE)

## Support

PRs will be considered

---

