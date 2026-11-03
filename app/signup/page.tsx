import { AuthShell } from "@/components/auth-shell";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Sign up | PondoPath", referrer: "no-referrer" as const };

export default function SignupPage() {
  return <AuthShell><SignupForm /></AuthShell>;
}
