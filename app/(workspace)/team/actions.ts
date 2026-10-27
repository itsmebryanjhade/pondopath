"use server";

import { createInvitation, type InvitationResult } from "@/lib/server/invitations";

export async function inviteTeammate(_previous: InvitationResult | null, form: FormData): Promise<InvitationResult> {
  return createInvitation(form);
}
