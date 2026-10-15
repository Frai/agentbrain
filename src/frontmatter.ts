export type FrontmatterValue = string | boolean;

export type ParsedFrontmatter = {
  values: Record<string, FrontmatterValue>;
  lines: Record<string, number>;
};

export type ParseResult =
  | { ok: true; frontmatter: ParsedFrontmatter | null }
  | { ok: false; message: string; line: number };

function parseValue(raw: string): FrontmatterValue {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (
    (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) ||
    (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2)
  ) {
    return raw.slice(1, -1);
  }
  return raw;
}

export function parseFrontmatter(text: string): ParseResult {
  const source = text.replace(/^\uFEFF/, "");
  if (!source.startsWith("---\n") && !source.startsWith("---\r\n")) {
    return { ok: true, frontmatter: null };
  }
  const lines = source.split(/\r?\n/);
  const values: Record<string, FrontmatterValue> = {};
  const lineNumbers: Record<string, number> = {};
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line === "---") {
      return { ok: true, frontmatter: { values, lines: lineNumbers } };
    }
    if (line.trim() === "" || line.trim().startsWith("#")) {
      return { ok: false, message: "Frontmatter only supports simple key: value lines.", line: index + 1 };
    }
    const splitAt = line.indexOf(":");
    if (splitAt === -1) {
      return { ok: false, message: "Frontmatter line is missing a colon.", line: index + 1 };
    }
    const key = line.slice(0, splitAt).trim();
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(key)) {
      return { ok: false, message: `Frontmatter key "${key}" is not a plain name.`, line: index + 1 };
    }
    if (key in values) {
      return { ok: false, message: `Frontmatter key "${key}" is repeated.`, line: index + 1 };
    }
    values[key] = parseValue(line.slice(splitAt + 1).trim());
    lineNumbers[key] = index + 1;
  }
  return { ok: false, message: "Frontmatter is missing its closing ---.", line: 1 };
}

export function renderFrontmatter(pairs: Array<[string, string]>): string {
  return `---\n${pairs.map(([key, value]) => `${key}: ${value}`).join("\n")}\n---\n\n`;
}
