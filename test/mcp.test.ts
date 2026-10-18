import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBrainServer } from "../src/server.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "agentbrain-mcp-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  if (!("content" in result) || !Array.isArray(result.content)) {
    throw new Error("Tool result had no content.");
  }
  const block = result.content.find((item) => item.type === "text");
  return block && "text" in block && typeof block.text === "string" ? block.text : "";
}

describe("mcp server", () => {
  it("lists the five tools and writes a note the next client can read", async () => {
    const server = createBrainServer(dir);
    const client = new Client({ name: "agentbrain-test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    try {
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
        "append_note",
        "list_skills",
        "propose_edit",
        "read",
        "search",
      ]);
      const written = await client.callTool({
        name: "append_note",
        arguments: {
          topic: "Taught in Cursor",
          body: "The shared fact is that notes live in git.",
          source_tool: "cursor",
          confidence: "medium",
          date: "2026-10-15",
        },
      });
      expect(written.isError).toBeFalsy();
      const rel = "log/2026/10/2026-10-15-cursor-taught-in-cursor.md";
      expect(textOf(written)).toContain(rel);
      const readBack = await client.callTool({ name: "read", arguments: { path: rel } });
      expect(textOf(readBack)).toContain("notes live in git");
      const found = await client.callTool({ name: "search", arguments: { query: "notes live in git" } });
      expect(textOf(found)).toContain(rel);
      const proposal = await client.callTool({
        name: "propose_edit",
        arguments: {
          target: "me/preferences.md",
          title: "Record the git fact",
          body: "Add that durable notes live in the private git repo.",
          source_tool: "claude",
          date: "2026-10-15",
        },
      });
      expect(textOf(proposal)).toContain("me/preferences.md was not modified");
      const inbox = await readFile(path.join(dir, "inbox/2026-10-15-record-the-git-fact.md"), "utf8");
      expect(inbox).toContain("target: me/preferences.md");
    } finally {
      await client.close();
      await server.close();
    }
  });
});
