import { cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { BrainError, isNodeError } from "./errors.js";
import { packageRoot, templateDir } from "./paths.js";

function includeTemplateFile(source: string): boolean {
  const name = path.basename(source);
  return name !== ".git" && name !== "node_modules" && name !== "dist";
}

export async function initBrain(destInput: string, sourceDir = templateDir()): Promise<string> {
  const dest = path.resolve(destInput);
  if (dest === packageRoot()) {
    throw new BrainError("Refusing to initialize the agentbrain package directory.");
  }
  try {
    const entries = await readdir(dest);
    const extras = entries.filter((name) => name !== ".git");
    if (extras.length > 0) {
      throw new BrainError("Directory is not empty. Choose an empty directory or a new git repo.");
    }
  } catch (error) {
    if (error instanceof BrainError) throw error;
    if (isNodeError(error) && error.code === "ENOENT") {
      await mkdir(dest, { recursive: true });
    } else {
      throw error;
    }
  }
  await cp(sourceDir, dest, { recursive: true, filter: includeTemplateFile });
  return dest;
}
