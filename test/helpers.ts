export function sampleSecret(kind: "github" | "aws" | "key" | "password" | "unquoted" | "bearer" | "url" | "stripe"): string {
  if (kind === "github") return "ghp_" + "a".repeat(36);
  if (kind === "aws") return "AKIA" + "IOSFODNN7EXAMPLE";
  if (kind === "key") return "-----BEGIN " + "PRIVATE KEY-----";
  if (kind === "unquoted") return "password: " + "hunter2hunter2xyz";
  if (kind === "bearer") return "Authorization: Bearer " + "abcdefghijklmnopqrstuvwxyz0123456789";
  if (kind === "url") return "postgres://" + "user:p4ssw0rdXYZ@host/db";
  if (kind === "stripe") return "sk_" + "live_" + "a1".repeat(14);
  return "password = \"" + "hunter2hunter2" + "\"";
}
