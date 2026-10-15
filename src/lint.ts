import { readFile } from "node:fs/promises";
import path from "node:path";
import { CONFIDENCE, SOURCE_TOOLS } from "./constants.js";
import { isRealDate } from "./dates.js";
import { BrainError } from "./errors.js";
import { parseFrontmatter } from "./frontmatter.js";
import { isNotePath } from "./paths.js";
import { findSecrets, isTextPath } from "./secrets.js";
import { walkFiles } from "./walk.js";

export type LintMode = "brain" | "template";

export type LintFinding = {
  file: string;
  line: number;
  message: string;
};

const TARGET_PATH = /^[A-Za-z0-9._/-]+\.md$/;

function push(findings: LintFinding[], file: string, line: number, message: string): void {
  findings.push({ file, line, message });
}

function validateNote(
  file: string,
  text: string,
  mode: LintMode,
  findings: LintFinding[],
): void {
  const parsed = parseFrontmatter(text);
  if (!parsed.ok) {
    push(findings, file, parsed.line, parsed.message);
    return;
  }
  if (!parsed.frontmatter) {
    push(findings, file, 1, "Add frontmatter with source_tool, updated, and confidence.");
    return;
  }
  const { values, lines } = parsed.frontmatter;
  const sourceTool = values.source_tool;
  if (typeof sourceTool !== "string" || !SOURCE_TOOLS.includes(sourceTool as (typeof SOURCE_TOOLS)[number])) {
    push(findings, file, lines.source_tool ?? 1, "source_tool must be human, cursor, claude, claude-code, or grok-bot.");
  }
  const updated = values.updated;
  if (typeof updated !== "string" || !isRealDate(updated)) {
    push(findings, file, lines.updated ?? 1, "updated must be a real YYYY-MM-DD date.");
  }
  const confidence = values.confidence;
  if (typeof confidence !== "string" || !CONFIDENCE.includes(confidence as (typeof CONFIDENCE)[number])) {
    push(findings, file, lines.confidence ?? 1, "confidence must be low, medium, or high.");
  }
  if ("supersedes" in values) {
    const supersedes = values.supersedes;
    if (typeof supersedes !== "string" || supersedes.trim() === "") {
      push(findings, file, lines.supersedes ?? 1, "supersedes must be a path.");
    }
  }
  const example = values.example;
  if ("example" in values && typeof example !== "boolean") {
    push(findings, file, lines.example ?? 1, "example must be true or false.");
  } else if (mode === "template" && example !== true) {
    push(findings, file, lines.example ?? 1, "Synthetic notes in the template set example: true.");
  } else if (mode === "brain" && example === true) {
    push(findings, file, lines.example ?? 1, "Replace this synthetic example before using the brain.");
  }
  if (file.startsWith("inbox/") && file !== "inbox/README.md") {
    const target = values.target;
    if (typeof target !== "string" || !TARGET_PATH.test(target) || target.split("/").includes("..")) {
      push(findings, file, lines.target ?? 1, "Inbox notes include a relative target path.");
    }
  }
}

export async function lintBrain(root: string, mode: LintMode = "brain"): Promise<LintFinding[]> {
  let files: string[];
  try {
    files = await walkFiles(root);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cannot read the brain.";
    throw new BrainError(message);
  }
  const findings: LintFinding[] = [];
  for (const file of files) {
    if (!isTextPath(file)) continue;
    const text = await readFile(path.join(root, file), "utf8");
    if (isNotePath(file)) validateNote(file, text, mode, findings);
    for (const hit of findSecrets(text)) {
      push(findings, file, hit.line, `Possible secret (${hit.rule}).`);
    }
  }
  return findings;
}

export function formatFindings(findings: LintFinding[]): string {
  return findings.map((finding) => `${finding.file}:${finding.line} ${finding.message}`).join("\n");
}
