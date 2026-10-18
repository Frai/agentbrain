import { lstat, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CONFIDENCE, SOURCE_TOOLS } from "../src/constants.js";
import { initBrain } from "../src/init.js";
import { lintBrain } from "../src/lint.js";
import { appendNote, listSkills, proposeEdit, readNote, searchNotes } from "../src/notes.js";
import { findSecrets } from "../src/secrets.js";
import { isIgnoredDir, isNotePath, isRawPath, packageRoot } from "../src/paths.js";
import { sampleSecret } from "./helpers.js";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

describe("template contract", () => {
  it("matches the frontmatter schema enums", () => {
    const schema = JSON.parse(readFileSync(path.join(root, "schema/frontmatter.schema.json"), "utf8")) as {
      properties: {
        source_tool: { enum: string[] };
        confidence: { enum: string[] };
      };
    };
    expect(schema.properties.source_tool.enum).toEqual([...SOURCE_TOOLS]);
    expect(schema.properties.confidence.enum).toEqual([...CONFIDENCE]);
  });

  it("accepts the shipped template and rejects it as a real brain", async () => {
    const template = path.join(root, "template");
    expect(await lintBrain(template, "template")).toEqual([]);
    const findings = await lintBrain(template, "brain");
    expect(findings.some((finding) => finding.message.includes("synthetic example"))).toBe(true);
  });
});

describe("secrets", () => {
  it("flags provider keys and ignores ordinary prose", () => {
    expect(findSecrets("Do not commit tokens or private keys.")).toEqual([]);
    expect(findSecrets(sampleSecret("github")).map((hit) => hit.rule)).toContain("github-token");
    expect(findSecrets(sampleSecret("aws")).map((hit) => hit.rule)).toContain("aws-access-key");
    expect(findSecrets(sampleSecret("key")).map((hit) => hit.rule)).toContain("private-key");
    expect(findSecrets(sampleSecret("password")).map((hit) => hit.rule)).toContain("assigned-secret");
  });
});

describe("brain files", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "agentbrain-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("copies the template into an empty directory", async () => {
    await initBrain(dir);
    const profile = await readFile(path.join(dir, "me/profile.md"), "utf8");
    expect(profile).toContain("example: true");
    expect(await readFile(path.join(dir, "AGENTS.md"), "utf8")).toContain("inbox/");
    expect(await readFile(path.join(dir, "CLAUDE.md"), "utf8")).toContain("AGENTS.md");
    await expect(initBrain(dir)).rejects.toThrow(/not empty/);
  });

  it("appends a log note and refuses a second write, a secret, and a path escape", async () => {
    const rel = await appendNote(dir, {
      topic: "Shared fact",
      body: "Cursor and Claude Code share one markdown repo.",
      sourceTool: "cursor",
      confidence: "high",
      date: "2026-10-15",
    });
    expect(rel).toBe("log/2026/10/2026-10-15-cursor-shared-fact.md");
    const text = await readNote(dir, rel);
    expect(text).toContain("source_tool: cursor");
    expect(text).toContain("share one markdown repo");
    await expect(
      appendNote(dir, { topic: "Shared fact", body: "again", sourceTool: "cursor", date: "2026-10-15" }),
    ).rejects.toThrow(/already exists/);
    await expect(
      appendNote(dir, { topic: "Leak", body: sampleSecret("key"), sourceTool: "cursor", date: "2026-10-15" }),
    ).rejects.toThrow(/possible secret/);
    await expect(
      appendNote(dir, { topic: sampleSecret("github"), body: "nope", sourceTool: "cursor", date: "2026-10-15" }),
    ).rejects.toThrow(/possible secret/);
    await expect(readNote(dir, "../package.json")).rejects.toThrow(/inside the brain/);
    await expect(readNote(dir, "meetings/raw/transcript.md")).rejects.toThrow(/Transcripts/);
  });

  it("blocks transcripts through case variants", async () => {
    await initBrain(dir);
    await mkdir(path.join(dir, "meetings/raw"), { recursive: true });
    await writeFile(path.join(dir, "meetings/raw/hidden.md"), "UniqueTranscriptToken\n");
    await expect(readNote(dir, "Meetings/Raw/hidden.md")).rejects.toThrow(/Transcripts/);
    await expect(readNote(dir, "MEETINGS/RAW/hidden.md")).rejects.toThrow(/Transcripts/);
    await expect(
      proposeEdit(dir, { target: "Meetings/Raw/hidden.md", title: "Nope", body: "x", sourceTool: "cursor", date: "2026-10-15" }),
    ).rejects.toThrow(/not a transcript/);
    expect(isRawPath("Meetings/RAW")).toBe(true);
    expect(isRawPath("meetings/rawish/a.md")).toBe(false);
    expect(isNotePath("Meetings/Raw/hidden.md")).toBe(false);
    expect(isIgnoredDir("Meetings/Raw", "Raw")).toBe(true);
  });

  it("proposes an edit without changing the target", async () => {
    await mkdir(path.join(dir, "me"), { recursive: true });
    const target = path.join(dir, "me/preferences.md");
    await writeFile(target, "original\n");
    const before = await lstat(target);
    const rel = await proposeEdit(dir, {
      target: "me/preferences.md",
      title: "Prefer short notes",
      body: "Keep preferences to stable facts.",
      sourceTool: "claude-code",
      date: "2026-10-15",
    });
    expect(rel).toBe("inbox/2026-10-15-prefer-short-notes.md");
    expect(await readFile(target, "utf8")).toBe("original\n");
    expect((await lstat(target)).mtimeMs).toBe(before.mtimeMs);
    const proposal = await readFile(path.join(dir, rel), "utf8");
    expect(proposal).toContain("target: me/preferences.md");
    expect(proposal).not.toContain("original");
  });

  it("searches notes, skips transcripts, and lists skills", async () => {
    await initBrain(dir);
    await mkdir(path.join(dir, "meetings/raw"), { recursive: true });
    await writeFile(path.join(dir, "meetings/raw/hidden.md"), "UniqueTranscriptToken\n");
    await appendNote(dir, {
      topic: "Recall check",
      body: "UniqueLogToken should be found tomorrow.",
      sourceTool: "grok-bot",
      date: "2026-10-15",
    });
    expect(await searchNotes(dir, "uniquelogtoken")).toEqual([
      expect.objectContaining({ path: "log/2026/10/2026-10-15-grok-bot-recall-check.md" }),
    ]);
    expect(await searchNotes(dir, "UniqueTranscriptToken")).toEqual([]);
    const skills = await listSkills(dir);
    expect(skills.map((skill) => skill.name)).toContain("example-skill");
    expect(skills[0]?.example).toBe(true);
  });

  it("reports a secret while linting a note", async () => {
    await mkdir(path.join(dir, "me"), { recursive: true });
    await writeFile(
      path.join(dir, "me/profile.md"),
      `---\nsource_tool: human\nupdated: 2026-10-15\nconfidence: high\n---\n\n${sampleSecret("aws")}\n`,
    );
    const findings = await lintBrain(dir, "brain");
    expect(findings.some((finding) => finding.message.includes("aws-access-key"))).toBe(true);
  });

  it("refuses to read a symlink", async () => {
    await mkdir(path.join(dir, "me"), { recursive: true });
    const outside = path.join(dir, "..", "outside.txt");
    await writeFile(outside, "secret");
    await symlink(outside, path.join(dir, "me/leak.md"));
    await expect(readNote(dir, "me/leak.md")).rejects.toThrow(/symlink/);
    await rm(outside, { force: true });
  });
});

describe("cli", () => {
  it("lints the template through the command", () => {
    const output = execFileSync(
      process.execPath,
      ["--import", "tsx", "src/cli.ts", "lint", "template", "--mode", "template"],
      { cwd: packageRoot(), encoding: "utf8" },
    );
    expect(output).toContain("No problems.");
  });
});
