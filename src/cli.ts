#!/usr/bin/env node
import { stat } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BrainError } from "./errors.js";
import { initBrain } from "./init.js";
import { formatFindings, lintBrain, type LintMode } from "./lint.js";
import { createBrainServer } from "./server.js";

function help(): string {
  return [
    "agentbrain init <dir>",
    "agentbrain lint [dir] [--mode brain|template]",
    "agentbrain mcp --dir <dir>",
    "",
    "BRAIN_DIR is used when --dir is omitted for mcp.",
    "lint defaults to the current directory and --mode brain.",
    "brain mode rejects leftover example files. template mode requires example: true.",
  ].join("\n");
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function brainDir(flag: string | undefined, fallbackToCwd: boolean): string {
  const selected = flag ?? process.env.BRAIN_DIR ?? (fallbackToCwd ? process.cwd() : undefined);
  if (!selected) fail("Set --dir or BRAIN_DIR to the private brain.");
  return path.resolve(selected);
}

async function directoryExists(dir: string): Promise<void> {
  let info;
  try {
    info = await stat(dir);
  } catch {
    throw new BrainError(`Directory not found: ${dir}`);
  }
  if (!info.isDirectory()) throw new BrainError(`Not a directory: ${dir}`);
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    strict: true,
    options: {
      dir: { type: "string" },
      mode: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log(help());
    return;
  }
  const [command, positionalDir] = positionals;
  if (!command) fail(help());
  if (command === "init") {
    const dest = values.dir ?? positionalDir;
    if (!dest) fail("Usage: agentbrain init <dir>");
    const created = await initBrain(dest);
    console.log(`Created a brain at ${created}.`);
    console.log("Replace the example files, then run agentbrain lint on that directory.");
    return;
  }
  if (command === "lint") {
    const mode = values.mode ?? "brain";
    if (mode !== "brain" && mode !== "template") fail("--mode must be brain or template.");
    const dir = path.resolve(values.dir ?? positionalDir ?? process.cwd());
    await directoryExists(dir);
    const findings = await lintBrain(dir, mode as LintMode);
    if (findings.length > 0) fail(formatFindings(findings));
    console.log(`Checked ${dir}. No problems.`);
    return;
  }
  if (command === "mcp") {
    if (positionalDir) fail("Usage: agentbrain mcp --dir <dir>");
    const dir = brainDir(values.dir, false);
    await directoryExists(dir);
    const server = createBrainServer(dir);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    return;
  }
  fail(help());
}

main().catch((error: unknown) => {
  if (error instanceof BrainError) fail(error.message);
  const message = error instanceof Error ? error.message : "agentbrain failed.";
  fail(message);
});
