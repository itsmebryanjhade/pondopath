// A file dropped on another workspace page waits here, in memory only, until the Add records page reads it.
let pending: File | null = null;

export function setPendingFile(file: File | null): void {
  pending = file;
}

export function takePendingFile(): File | null {
  const file = pending;
  pending = null;
  return file;
}
