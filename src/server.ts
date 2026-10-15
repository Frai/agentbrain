import { readFileSync } from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { CONFIDENCE, DEFAULT_SEARCH_LIMIT, SOURCE_TOOLS } from "./constants.js";
import { BrainError } from "./errors.js";
import { appendNote, listSkills, proposeEdit, readNote, searchNotes } from "./notes.js";
import { packageRoot } from "./paths.js";

const instructions = [
  "agentbrain is a private markdown repository.",
  "Search and read notes before assuming a preference or decision.",
  "append_note creates a new file under log/. It does not edit profile, rules, or skills.",
  "propose_edit creates a file under inbox/ and leaves the target file unchanged.",
  "Skills are drafts until a person reviews them. Do not install or symlink them from this server.",
  "Transcripts under meetings/raw are not searchable or readable here.",
].join(" ");

function version(): string {
  const raw = readFileSync(path.join(packageRoot(), "package.json"), "utf8");
  const parsed = JSON.parse(raw) as { version?: string };
  return parsed.version ?? "0.0.0";
}

function textResult(text: string, isError = false): CallToolResult {
  return { content: [{ type: "text", text }], isError };
}

async function run(action: () => Promise<string>): Promise<CallToolResult> {
  try {
    return textResult(await action());
  } catch (error) {
    if (!(error instanceof BrainError)) console.error(error);
    const message = error instanceof BrainError ? error.message : "Something went wrong while using the brain.";
    return textResult(message, true);
  }
}

function formatHits(hits: Array<{ path: string; line: number; text: string }>): string {
  if (hits.length === 0) return "No matches.";
  return hits.map((hit) => `${hit.path}:${hit.line}: ${hit.text}`).join("\n");
}

export function createBrainServer(brainDir: string): McpServer {
  const root = path.resolve(brainDir);
  const server = new McpServer({ name: "agentbrain", version: version() }, { instructions });

  server.registerTool(
    "search",
    {
      description: "Literal case-insensitive search across markdown notes. Does not search meeting transcripts.",
      inputSchema: {
        query: z.string().min(1).max(200).describe("Text to find"),
        limit: z.number().int().min(1).max(50).optional().describe("Maximum matches, default 20"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, limit }) => run(async () => formatHits(await searchNotes(root, query, limit ?? DEFAULT_SEARCH_LIMIT))),
  );

  server.registerTool(
    "read",
    {
      description: "Read one markdown file by its path relative to the brain. Refuses transcripts and symlinks.",
      inputSchema: {
        path: z.string().min(1).max(500).describe("Relative path, such as me/preferences.md"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ path: notePath }) => run(async () => readNote(root, notePath)),
  );

  server.registerTool(
    "list_skills",
    {
      description: "List skills/<name>/SKILL.md files. A listed skill is a draft until a person reviews it.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      run(async () => {
        const skills = await listSkills(root);
        if (skills.length === 0) return "No skills.";
        return skills
          .map((skill) => {
            const marker = skill.example ? " (example)" : "";
            return `${skill.path}${marker}\n${skill.name}: ${skill.description}`;
          })
          .join("\n\n");
      }),
  );

  server.registerTool(
    "append_note",
    {
      description: "Create a new outcome note under log/YYYY/MM/. Does not modify me/, skills/, or rules.md.",
      inputSchema: {
        topic: z.string().min(1).max(80).describe("Short name for the note"),
        body: z.string().min(1).max(100_000).describe("What was done, learned, or decided"),
        source_tool: z.enum(SOURCE_TOOLS).describe("Tool writing the note"),
        confidence: z.enum(CONFIDENCE).optional().describe("Defaults to low"),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("YYYY-MM-DD, default today UTC"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ topic, body, source_tool, confidence, date }) =>
      run(async () => {
        const rel = await appendNote(root, { topic, body, sourceTool: source_tool, confidence, date });
        return `Wrote ${rel}. The profile, rules, and skills were left unchanged.`;
      }),
  );

  server.registerTool(
    "propose_edit",
    {
      description: "Propose a change to me/, a skill, or rules.md by writing inbox/ only. Does not edit the target.",
      inputSchema: {
        target: z.string().min(1).max(500).describe("Relative markdown path the proposal is about"),
        title: z.string().min(1).max(80).describe("Short proposal title"),
        body: z.string().min(1).max(100_000).describe("What should change, and why"),
        source_tool: z.enum(SOURCE_TOOLS),
        confidence: z.enum(CONFIDENCE).optional(),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ target, title, body, source_tool, confidence, date }) =>
      run(async () => {
        const rel = await proposeEdit(root, { target, title, body, sourceTool: source_tool, confidence, date });
        return `Wrote ${rel}. ${target} was not modified.`;
      }),
  );

  return server;
}
