export class BrainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrainError";
  }
}

export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
