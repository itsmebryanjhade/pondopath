import { z } from "zod";
import { assertLocalDate } from "./dates";
import { MAX_RECORD_CENTS } from "./money";

const text = (max: number) => z.string().trim().min(1).max(max);
const cents = z.number().int().max(MAX_RECORD_CENTS);
const date = z.string().refine(value => {
  try { assertLocalDate(value); return true; } catch { return false; }
}, "Enter a valid date in YYYY-MM-DD format.");
const envelope = { requestId: z.uuid(), expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) };
const recordId = { id: z.uuid().optional() };

export const workspaceCommandSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...envelope, type: z.literal("set_opening_cash"), payload: z.strictObject({ amountCents: cents.min(0), date }) }),
  z.strictObject({ ...envelope, type: z.literal("save_customer"), payload: z.strictObject({ ...recordId, name: text(200), contactName: text(200), email: z.union([z.email().max(254), z.literal("")]).optional(), phone: z.string().trim().max(50).optional() }) }),
  z.strictObject({ ...envelope, type: z.literal("save_invoice"), payload: z.strictObject({ ...recordId, number: text(100), customerId: z.uuid(), amountCents: cents.min(1), dueDate: date, reason: text(4000).optional() }) }),
  z.strictObject({ ...envelope, type: z.literal("save_expense"), payload: z.strictObject({ ...recordId, label: text(200), payee: text(200), amountCents: cents.min(1), dueDate: date, reason: text(4000).optional() }) }),
]);

export type WorkspaceCommand = z.infer<typeof workspaceCommandSchema>;
export type CommandType = WorkspaceCommand["type"];
export const commandResultSchema = z.strictObject({ revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), recordId: z.uuid(), replayed: z.boolean() });
export type CommandResult = z.infer<typeof commandResultSchema>;

export const commandErrorMessages = {
  UNAUTHENTICATED: "Sign in to continue.",
  FORBIDDEN: "Your current role cannot perform this action.",
  VALIDATION_ERROR: "Check the values and any required correction reason, then try again.",
  NOT_FOUND: "This record is unavailable in your business workspace.",
  STALE_VERSION: "Records have changed. Refresh and review the latest values before saving.",
  DUPLICATE_REFERENCE: "That reference is already in use. Check the existing record.",
  POSSIBLE_DUPLICATE: "A similar payment exists. Review it before confirming another payment.",
  REQUEST_ID_REUSE: "This request identifier was already used for different values. Review and submit a new request.",
  LIMIT_REACHED: "The supported workspace limit has been reached.",
  SERVICE_UNAVAILABLE: "The save could not be confirmed. Retry the same request to check its result.",
} as const;
export type ErrorCode = keyof typeof commandErrorMessages;
export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: ErrorCode; message: string; fieldErrors?: Record<string, string> };

export class CommandError extends Error {
  static fromDatabase(message: string): CommandError {
    const code = Object.hasOwn(commandErrorMessages, message) ? message as ErrorCode : "SERVICE_UNAVAILABLE";
    return new CommandError(code);
  }

  constructor(public readonly code: ErrorCode, public readonly fieldErrors?: Record<string, string>) {
    super(commandErrorMessages[code]);
    this.name = "CommandError";
  }
}
