import { finishGoogleSignIn } from "@/lib/server/google-auth";

export async function GET(request: Request) {
  return finishGoogleSignIn(request);
}
