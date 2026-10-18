export function sampleSecret(kind: "github" | "aws" | "key" | "password"): string {
  if (kind === "github") return "ghp_" + "a".repeat(36);
  if (kind === "aws") return "AKIA" + "IOSFODNN7EXAMPLE";
  if (kind === "key") return "-----BEGIN " + "PRIVATE KEY-----";
  return "password = \"" + "hunter2hunter2" + "\"";
}
