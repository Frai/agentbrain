export const SOURCE_TOOLS = ["human", "cursor", "claude", "claude-code", "grok-bot"] as const;

export const CONFIDENCE = ["low", "medium", "high"] as const;

export type SourceTool = (typeof SOURCE_TOOLS)[number];

export type Confidence = (typeof CONFIDENCE)[number];

export const MAX_NOTE_CHARS = 100_000;

export const MAX_READ_CHARS = 256 * 1024;

export const DEFAULT_SEARCH_LIMIT = 20;

export const MAX_SEARCH_LIMIT = 50;

export const MAX_TITLE_CHARS = 80;

export const MAX_WRITES_PER_DAY = 50;
