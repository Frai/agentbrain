import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { CONFIDENCE, DEFAULT_SEARCH_LIMIT, MAX_NOTE_CHARS, MAX_READ_CHARS, MAX_SEARCH_LIMIT, SOURCE_TOOLS, type Confidence, type SourceTool } from "./constants.js";
import { isRealDate, slugify, utcDate } from "./dates.js";
import { BrainError, isNodeError } from "./errors.js";
import { parseFrontmatter, renderFrontmatter } from "./frontmatter.js";
import { assertSafeRelative, isRawPath, resolveInside, toPosix } from "./paths.js";
import { findSecrets, isTextPath } from "./secrets.js";
import { walkFiles } from "./walk.js";

export type SearchHit = {
  path: string;
  line: number;
  text: string;
};

export type SkillInfo = {
  path: string;
  name: string;
  description: string;
  example: boolean;
};

const TARGET_PATH = /^[A-Za-z0-9._/-]+\.md$/;

function assertSourceTool(value: string): SourceTool {
  if (!SOURCE_TOOLS.includes(value as SourceTool)) {
    throw new BrainError("source_tool must be human, cursor, claude, claude-code, or grok-bot.");
  }
  return value as SourceTool;
}

function assertConfidence(value: string): Confidence {
  if (!CONFIDENCE.includes(value as Confidence)) {
    throw new BrainError("confidence must be low, medium, or high.");
  }
  return value as Confidence;
}

function assertBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) throw new BrainError("The note body is empty.");
  if (trimmed.length > MAX_NOTE_CHARS) throw new BrainError("The note body is too long.");
  const secret = findSecrets(trimmed)[0];
  if (secret) throw new BrainError(`Refusing to write a possible secret (${secret.rule}).`);
  return trimmed;
}

function assertDate(value: string | undefined): string {
  const date = value ?? utcDate();
  if (!isRealDate(date)) throw new BrainError("Date must be a real YYYY-MM-DD date.");
  return date;
}

async function createFile(full: string, contents: string): Promise<void> {
  await mkdir(path.dirname(full), { recursive: true });
  try {
    await writeFile(full, contents, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (isNodeError(error) && error.code === "EEXIST") {
      throw new BrainError("A note with that name already exists.");
    }
    throw error;
  }
}

export async function readNote(root: string, inputPath: string): Promise<string> {
  const rel = assertSafeRelative(inputPath);
  if (isRawPath(rel)) {
    throw new BrainError("Transcripts are not readable through this server.");
  }
  const full = resolveInside(root, rel);
  let info;
  try {
    info = await lstat(full);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") throw new BrainError("File not found.");
    throw error;
  }
  if (info.isSymbolicLink()) throw new BrainError("Refusing to read a symlink.");
  if (!info.isFile()) throw new BrainError("Path is not a file.");
  const realRoot = await realpath(root);
  const realFile = await realpath(full);
  const back = path.relative(realRoot, realFile);
  if (back.startsWith("..") || path.isAbsolute(back)) {
    throw new BrainError("Path must stay inside the brain.");
  }
  if (isRawPath(toPosix(back))) {
    throw new BrainError("Transcripts are not readable through this server.");
  }
  if (info.size > MAX_READ_CHARS) throw new BrainError("File is too large to read through the server.");
  return readFile(full, "utf8");
}

export async function searchNotes(root: string, query: string, limit = DEFAULT_SEARCH_LIMIT): Promise<SearchHit[]> {
  const needle = query.trim();
  if (!needle) throw new BrainError("Search query is empty.");
  if (needle.length > 200) throw new BrainError("Search query is too long.");
  const capped = Math.min(Math.max(limit, 1), MAX_SEARCH_LIMIT);
  const folded = needle.toLowerCase();
  const hits: SearchHit[] = [];
  for (const file of await walkFiles(root)) {
    if (!isTextPath(file) || (!file.endsWith(".md") && !file.endsWith(".mdc"))) continue;
    const full = path.join(root, file);
    const info = await lstat(full);
    if (!info.isFile() || info.size > MAX_READ_CHARS) continue;
    const text = await readFile(full, "utf8");
    if (!text.toLowerCase().includes(folded)) continue;
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      if (!line.toLowerCase().includes(folded)) continue;
      hits.push({ path: file, line: index + 1, text: line.trim().slice(0, 200) });
      if (hits.length >= capped) return hits;
    }
  }
  return hits;
}

export async function listSkills(root: string): Promise<SkillInfo[]> {
  const skills: SkillInfo[] = [];
  for (const file of await walkFiles(root)) {
    if (!file.startsWith("skills/") || !file.endsWith("/SKILL.md")) continue;
    const text = await readFile(path.join(root, file), "utf8");
    const parsed = parseFrontmatter(text);
    const values = parsed.ok ? parsed.frontmatter?.values : undefined;
    const dirName = file.split("/").at(-2) ?? file;
    const name = typeof values?.name === "string" && values.name ? values.name : dirName;
    const description = typeof values?.description === "string" && values.description ? values.description : "(no description)";
    skills.push({ path: file, name, description, example: values?.example === true });
  }
  return skills;
}

export async function appendNote(
  root: string,
  input: { topic: string; body: string; sourceTool: string; confidence?: string; date?: string },
): Promise<string> {
  const sourceTool = assertSourceTool(input.sourceTool);
  const confidence = assertConfidence(input.confidence ?? "low");
  const date = assertDate(input.date);
  const slug = slugify(input.topic);
  assertBody(input.topic);
  const body = assertBody(input.body);
  const [year, month] = date.split("-");
  const rel = `log/${year}/${month}/${date}-${sourceTool}-${slug}.md`;
  const heading = body.startsWith("#") ? body : `# ${input.topic.trim()}\n\n${body}`;
  const contents =
    renderFrontmatter([
      ["source_tool", sourceTool],
      ["updated", date],
      ["confidence", confidence],
    ]) +
    heading +
    "\n";
  await createFile(resolveInside(root, rel), contents);
  return rel;
}

export async function proposeEdit(
  root: string,
  input: { target: string; title: string; body: string; sourceTool: string; confidence?: string; date?: string },
): Promise<string> {
  const sourceTool = assertSourceTool(input.sourceTool);
  const confidence = assertConfidence(input.confidence ?? "low");
  const date = assertDate(input.date);
  let target: string;
  try {
    target = assertSafeRelative(input.target);
  } catch {
    throw new BrainError("target must be a relative path inside the brain.");
  }
  if (!TARGET_PATH.test(target) || isRawPath(target)) {
    throw new BrainError("target must be a markdown file inside the brain, and not a transcript.");
  }
  const title = input.title.trim();
  const slug = slugify(title);
  assertBody(`${target}\n${input.body}`);
  const rel = `inbox/${date}-${slug}.md`;
  const contents =
    renderFrontmatter([
      ["source_tool", sourceTool],
      ["updated", date],
      ["confidence", confidence],
      ["target", target],
    ]) + `# ${title}\n\n${input.body.trim()}\n`;
  await createFile(resolveInside(root, rel), contents);
  return rel;
}
