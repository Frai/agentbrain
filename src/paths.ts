import { fileURLToPath } from "node:url";
import path from "node:path";
import { BrainError } from "./errors.js";

export function packageRoot(): string {
  return path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
}

export function templateDir(): string {
  return path.join(packageRoot(), "template");
}

export function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

export function assertSafeRelative(input: string): string {
  const rel = input.trim().replace(/\\/g, "/");
  if (!rel || path.posix.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) {
    throw new BrainError("Path must be relative to the brain.");
  }
  const parts = rel.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new BrainError("Path must stay inside the brain.");
  }
  return rel;
}

export function resolveInside(root: string, input: string): string {
  const rel = assertSafeRelative(input);
  const rootResolved = path.resolve(root);
  const full = path.resolve(rootResolved, rel);
  const back = path.relative(rootResolved, full);
  if (back.startsWith("..") || path.isAbsolute(back)) {
    throw new BrainError("Path must stay inside the brain.");
  }
  return full;
}

export function isNotePath(relPosix: string): boolean {
  if (relPosix === "README.md" || relPosix.endsWith("/README.md")) return false;
  if (relPosix === "AGENTS.md" || relPosix.endsWith("/AGENTS.md")) return false;
  if (relPosix === "CLAUDE.md" || relPosix.endsWith("/CLAUDE.md")) return false;
  if (relPosix.startsWith("meetings/raw/")) return false;
  if (!relPosix.endsWith(".md")) return false;
  return (
    relPosix.startsWith("me/") ||
    relPosix.startsWith("projects/") ||
    relPosix.startsWith("meetings/") ||
    relPosix.startsWith("log/") ||
    relPosix.startsWith("inbox/") ||
    relPosix.startsWith("plan/") ||
    (relPosix.startsWith("skills/") && relPosix.endsWith("/SKILL.md"))
  );
}

export function isIgnoredDir(relPosix: string, name: string): boolean {
  if (name === ".git" || name === "node_modules" || name === "dist" || name === "coverage") {
    return true;
  }
  return relPosix === "meetings/raw" || relPosix.startsWith("meetings/raw/");
}
