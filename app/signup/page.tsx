import { AuthShell } from "@/components/auth-shell";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Join your workspace | PondoPath", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default function SignupPage() {
  return <AuthShell><SignupForm /></AuthShell>;
}
