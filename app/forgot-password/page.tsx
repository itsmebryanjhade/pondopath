import { AuthShell } from "@/components/auth-shell";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Reset password | PondoPath", referrer: "no-referrer" as const };

export default function ForgotPasswordPage() {
  return <AuthShell><ResetForm /></AuthShell>;
}
