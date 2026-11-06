import { startGoogleSignIn } from "@/lib/server/google-auth";

export async function GET(request: Request) {
  return startGoogleSignIn(request);
}
