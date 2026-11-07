"use server";

import { finishPasswordReset, resendCode, startPasswordReset, type CodeStep } from "@/lib/server/auth-codes";

export async function requestReset(_previous: CodeStep, form: FormData): Promise<CodeStep> {
  return startPasswordReset(form);
}

export async function completeReset(_previous: string | null, form: FormData): Promise<string | null> {
  return finishPasswordReset(form);
}

export async function resendResetCode(email: string): Promise<string> {
  return resendCode("recovery", email);
}
