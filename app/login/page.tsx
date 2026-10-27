import { Suspense } from "react";
import { LoginForm } from "./login-form";

async function SessionNotice({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { reason } = await searchParams;
  if (reason === "session") return <p className="mb-6 text-sm" role="status">Please sign in to continue to your workspace.</p>;
  if (reason === "access") return <p className="mb-6 text-sm" role="status">Your workspace access has changed. Sign in with an authorized account.</p>;
  return null;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main data-ui className="mx-auto my-auto w-full max-w-md px-6 py-12">
      <p className="mb-12 font-semibold tracking-tight">SoloForge <span className="font-normal text-neutral-600">/ Cash flow</span></p>
      <h1 className="mb-3 text-3xl font-semibold tracking-tight">Sign in to your cash plan</h1>
      <p className="mb-8 text-neutral-600">Use your owner or finance account to access the business workspace.</p>
      <Suspense><SessionNotice searchParams={searchParams} /></Suspense>
      <LoginForm />
      <p className="mt-8 text-sm text-neutral-600">Accounts are provided by the business owner.</p>
    </main>
  );
}
