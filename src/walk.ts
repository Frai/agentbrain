import { readdir } from "node:fs/promises";
import path from "node:path";
import { isIgnoredDir, toPosix } from "./paths.js";

export async function walkFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  await walk(root, root, files);
  files.sort();
  return files;
}

async function walk(root: string, dir: string, files: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = toPosix(path.relative(root, full));
    if (isIgnoredDir(rel, entry.name)) continue;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      await walk(root, full, files);
      continue;
    }
    if (entry.isFile()) files.push(rel);
  }
}
