import { workspaceCommandSchema, type WorkspaceCommand } from "./commands";

export type IntakeCandidate = Pick<Extract<WorkspaceCommand, { type: "save_invoice" }>, "type" | "payload"> |
  Pick<Extract<WorkspaceCommand, { type: "save_expense" }>, "type" | "payload">;

const intakeTypes = new Set(["save_invoice", "save_expense"]);
const validationId = "00000000-0000-4000-8000-000000000001";

// shortcut: Intake accepts only invoice and expense proposals until payment verification is reviewed.
export function parseIntakeCandidate(input: unknown, reviewed = false): IntakeCandidate {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some(key => key !== "type" && key !== "payload")) {
    throw new Error("Invalid intake candidate.");
  }
  const candidate = input as { type?: unknown; payload?: unknown };
  if (typeof candidate.type !== "string" || !intakeTypes.has(candidate.type)) {
    throw new Error("Unsupported intake candidate.");
  }
  if (!reviewed && candidate.payload && typeof candidate.payload === "object" && "reason" in candidate.payload) {
    throw new Error("A source cannot supply a correction reason.");
  }
  const result = workspaceCommandSchema.safeParse({
    requestId: validationId, expectedRevision: 0, type: candidate.type, payload: candidate.payload,
  });
  if (!result.success || (result.data.type !== "save_invoice" && result.data.type !== "save_expense")) throw new Error("Invalid intake candidate.");
  return result.data.type === "save_invoice"
    ? { type: result.data.type, payload: result.data.payload }
    : { type: result.data.type, payload: result.data.payload };
}
