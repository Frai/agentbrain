# agentbrain

Tools and a file layout for a git-backed markdown brain shared across coding agents.

Personal knowledge stays in a separate private git repo. This repository holds the contract for that repo, a synthetic template, and a local CLI and stdio MCP server that read and write it. It stores no real personal data and sends no telemetry.

## Quick start

Requires Node 20 or newer.

```sh
pnpm install
pnpm build
node dist/cli.js init ../my-brain
```

`init` copies `template/` into an empty directory (a new git repo that contains only `.git` is fine). Replace the example files, then check and serve them:

```sh
node dist/cli.js lint ../my-brain
BRAIN_DIR=../my-brain node dist/cli.js mcp
```

`lint` checks note frontmatter and likely secrets. `mcp` speaks MCP over stdio. Cursor and Claude Code launch that process with `BRAIN_DIR` pointed at the private clone. Copy the pointers in [`adapters/`](adapters/README.md) into the repo those tools are working in.

```json
{
  "mcpServers": {
    "agentbrain": {
      "command": "node",
      "args": ["/absolute/path/to/agentbrain/dist/cli.js", "mcp"],
      "env": { "BRAIN_DIR": "/absolute/path/to/private-brain" }
    }
  }
}
```

`append_note` creates a new file under `log/`. `propose_edit` creates a file under `inbox/` and does not change the target. Reviewed skills can be copied into a tool later. This server does not symlink `skills/` into `~/.claude/skills` or any other executable skill directory.

To run the template lint and gitleaks on commit: `git config core.hooksPath hooks`.

This version is the local server. A hosted HTTPS endpoint for Claude web and Grok Bot, Granola ingestion, and skill install remain later steps.

## Brain layout

Point `BRAIN_DIR` at a private clone. `agentbrain init` copies `template/` there.

| Path | Purpose | Writes |
| --- | --- | --- |
| `me/` | Profile, preferences, people | Inbox proposal, then human merge |
| `projects/<name>/` | Context, rules, decisions | Rule changes through inbox |
| `skills/<name>/SKILL.md` | Reusable skills | Inbox proposal, then human merge |
| `meetings/` | One summary per meeting | New summary files |
| `log/` | Outcomes and lessons | Agents may append |
| `inbox/` | Proposed edits | Agents may append; they do not apply them |

`meetings/raw/` is for transcripts and is gitignored. Secrets, tokens, health information, and employer-confidential material do not belong in the brain.

Reviewed skills can be copied into a tool. Do not symlink `skills/` into `~/.claude/skills` or another executable skill directory. Inbox files and unreviewed skills are drafts, not instructions.

## Frontmatter

Shared fields are defined in [`schema/frontmatter.schema.json`](schema/frontmatter.schema.json).

```yaml
---
source_tool: human
updated: YYYY-MM-DD
confidence: medium
supersedes: path/to/older-note.md
---
```

`confidence` is `low`, `medium`, or `high`. When notes disagree, add an inbox item instead of overwriting `me/` or a skill.

## Commands

| Command | What it does |
| --- | --- |
| `init <dir>` | Copy `template/` into an empty directory |
| `lint [dir]` | Check frontmatter and likely secrets. `--mode template` requires `example: true` |
| `mcp` | Serve `search`, `read`, `append_note`, `propose_edit`, and `list_skills` over stdio |

`lint` defaults to `--mode brain`, which rejects leftover `example: true` files. Search is a literal case-insensitive match. It does not read `meetings/raw/`.

## Shape

TypeScript on Node 20, Apache-2.0.

A reviewed copy of skills into each tool is a later command. It stays a copy, not a symlink. A remote MCP server with OAuth is also later.

[ai-memory](https://github.com/akitaonrails/ai-memory) is a complementary capture layer for coding sessions. This project is the curated, human-reviewed store those sessions can write into.

## License

Apache-2.0. See [LICENSE](LICENSE).
