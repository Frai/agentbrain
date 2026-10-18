export type SecretHit = {
  line: number;
  rule: string;
};

type SecretRule = {
  id: string;
  test: (line: string) => boolean;
};

const RULES: SecretRule[] = [
  {
    id: "private-key",
    test: (line) => /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/.test(line),
  },
  {
    id: "aws-access-key",
    test: (line) => /\bAKIA[0-9A-Z]{16}\b/.test(line),
  },
  {
    id: "github-token",
    test: (line) => /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/.test(line) || /\bgithub_pat_[A-Za-z0-9_]{20,}\b/.test(line),
  },
  {
    id: "slack-token",
    test: (line) => /\bxox[baprs]-[A-Za-z0-9-]{10,}/.test(line),
  },
  {
    id: "openai-key",
    test: (line) => /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}\b/.test(line),
  },
  {
    id: "npm-token",
    test: (line) => /\bnpm_[A-Za-z0-9]{36}\b/.test(line),
  },
  {
    id: "stripe-key",
    test: (line) => /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}\b/.test(line),
  },
  {
    id: "google-api-key",
    test: (line) => /\bAIza[0-9A-Za-z_-]{35}\b/.test(line),
  },
  {
    id: "jwt",
    test: (line) => /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/.test(line),
  },
  {
    id: "bearer-token",
    test: (line) => /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/.test(line),
  },
  {
    id: "url-credentials",
    test: (line) => /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i.test(line),
  },
  {
    id: "assigned-secret",
    test: (line) => {
      const match = line.match(/(?:api[_-]?key|secret|password|passwd|token)\s*[:=]\s*(?:['"]([^'"]+)['"]|([^\s'"]+))/i);
      const value = match?.[1] ?? match?.[2];
      if (!value) return false;
      return value.length >= 12 && /[A-Za-z]/.test(value) && /\d/.test(value);
    },
  },
];

const TEXT_EXTENSIONS = new Set([".md", ".mdc", ".txt", ".json", ".yml", ".yaml", ".toml"]);

export function isTextPath(relPosix: string): boolean {
  const dot = relPosix.lastIndexOf(".");
  if (dot === -1) return false;
  return TEXT_EXTENSIONS.has(relPosix.slice(dot).toLowerCase());
}

export function findSecrets(text: string): SecretHit[] {
  const hits: SecretHit[] = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    for (const rule of RULES) {
      if (rule.test(line)) hits.push({ line: index + 1, rule: rule.id });
    }
  }
  return hits;
}
