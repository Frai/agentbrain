# Tool pointers

Copy these into a repository where Cursor or Claude Code should use the brain.

- Cursor: `adapters/cursor/brain.mdc` to `.cursor/rules/brain.mdc`
- Claude Code: the body of `adapters/claude-code/CLAUDE.md` into `CLAUDE.md` or `~/.claude/CLAUDE.md`

Point the MCP server at the private brain with `BRAIN_DIR`. A brain created by `agentbrain init` already contains `AGENTS.md` and `CLAUDE.md`.
