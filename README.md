# agentbrain

Tools and a file layout for a git-backed markdown brain shared across coding agents.

Personal knowledge stays in a separate private git repo. This repository holds the contract for that repo, a synthetic template, and (later) the CLI and MCP server that read and write it. It stores no real personal data and sends no telemetry.

Status: layout and note contract only. There is no CLI or server in this commit.

## Brain layout

Point `BRAIN_DIR` at a private clone. `brain init` (not built yet) should copy `template/` there.

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

## Intended shape

TypeScript on Node 20, Apache-2.0.

- `init` copies `template/` into a private brain repo
- `lint` checks frontmatter and warns on likely secrets
- `sync` is a reviewed copy of skills into each tool, never an automatic symlink
- A local MCP server exposes search, read, and append over `BRAIN_DIR`

[ai-memory](https://github.com/akitaonrails/ai-memory) is a complementary capture layer for coding sessions. This project is the curated, human-reviewed store those sessions can write into.

## License

Apache-2.0. See [LICENSE](LICENSE).
