import { redirect } from "next/navigation";
import { requireActor } from "@/lib/server/auth";
import { getWorkspace } from "@/lib/server/workspace";
import { WorkspaceShell } from "@/components/workspace-shell";
import { InvitationForm } from "./invitation-form";

export const metadata = { title: "Invite a teammate | PondoPath" };

export default async function TeamPage() {
  const actor = await requireActor();
  if (actor.role !== "owner") redirect("/overview");
  const workspace = await getWorkspace();
  return (
    <WorkspaceShell workspace={workspace}>
      <section className="panel" style={{ maxWidth: 620 }}>
        <h1>Invite a teammate</h1>
        <p className="muted">Create a private sign-up link for a finance or admin teammate in {workspace.business.name}.</p>
        <InvitationForm />
      </section>
    </WorkspaceShell>
  );
}
