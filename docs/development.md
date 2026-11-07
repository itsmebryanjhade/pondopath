# Development setup

Run these commands from the repository root.

## Local setup

Use Node.js **24.x** and npm. Check `node --version` before running `npm ci`. Copy `.env.example` to `.env.local` only if a local file does not already exist. The Supabase URL and publishable key are public configuration; the service-role key, OpenRouter key and automation token must remain server-only.

See [database configuration and migration boundaries](database.md) before changing the development database.

```sh
node scripts/seed-demo.mjs
npm run dev
```

The seed command refuses other projects and real businesses. It provisions two fictional, email-confirmed accounts without sending signup emails. It writes their `DEMO_OWNER_EMAIL` / `DEMO_OWNER_PASSWORD` and `DEMO_FINANCE_EMAIL` / `DEMO_FINANCE_PASSWORD` to ignored `.env.local`, together with the actual `AUTOMATION_BUSINESS_ID`. Re-running preserves existing records and credentials; it is not a data-reset command.

Open [localhost:3000](http://localhost:3000). Sign in with one of those local demo accounts. The demo clearly labels its fixed **2026-10-29** financial reference date and **2026-10-26** opening cutoff. Opening cash is PHP 40,000, an expected invoice is PHP 50,000 on October 29, and October 30 obligations total PHP 80,000. These are fictional values, not observed business results.

## Connect Google (optional)

Connect Google needs a Google Cloud **Web application** OAuth client (Testing mode is enough for development and the demo), the Google Picker API, and a browser API key restricted to the Picker and this site's origins. Register `http://localhost:3000` as a JavaScript origin and `http://localhost:3000/api/google/callback` as a redirect URI; add the deployed address the same way. Server-only `.env.local` values: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY` (32 random bytes, base64) and `GOOGLE_SYNC_CRON_SECRET`; `GOOGLE_PICKER_API_KEY` and `GOOGLE_PROJECT_NUMBER` are public by design. Keep the encryption key identical everywhere: a different key cannot open stored sign-ins. Never commit downloaded `client_secret_*.json` files (they are git-ignored). After deployment, schedule the sync with [supabase/cron/google-sync.sql](../supabase/cron/google-sync.sql).

## Sign-up codes and password reset (Supabase + Resend)

New accounts confirm their email with a 6-digit code, and **Forgot password** uses the same kind of code. Both are sent by Supabase Auth through custom SMTP (Resend). In the Supabase dashboard:

1. **Authentication → Emails → SMTP Settings:** enable custom SMTP. Host `smtp.resend.com`, port `465`, username `resend`, password a Resend API key with sending access, sender `no-reply@<your verified mail subdomain>`.
2. **Authentication → Providers → Email:** turn **Confirm email** on, set **Minimum password length** to 12 and the email OTP expiry to about 600 seconds.
3. **Authentication → URL Configuration:** Site URL and Redirect URLs use the deployed app address.
4. **Authentication → Emails → Templates:** the app asks for the code, not a link, so both templates must contain `{{ .Token }}`.

Confirm signup (subject `Your PondoPath confirmation code`):

```html
<h2>Confirm your email</h2>
<p>Enter this code in PondoPath to finish creating your account:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
<p>It expires in a few minutes. If you did not sign up, you can ignore this email.</p>
```

Reset password (subject `Your PondoPath password reset code`):

```html
<h2>Reset your password</h2>
<p>Enter this code in PondoPath, then choose a new password:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
<p>It expires in a few minutes. If you did not ask for this, you can ignore this email. Your password has not changed.</p>
```

The app code lives in `lib/server/auth-codes.ts` (unit tests in `lib/server/auth-codes.test.ts`). Teammate invitations are separate: the owner copies a private link, and no email is sent.

Next: [testing and isolated fixtures](testing.md), or the separate [worker runbook](../automation/README.md).
