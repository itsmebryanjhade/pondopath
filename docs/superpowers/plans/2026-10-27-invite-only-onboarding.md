# Invite-only onboarding implementation plan

> Execute inline using `superpowers:executing-plans`, in the existing worktree.

**Goal:** Polish sign-in and deliver owner-invited finance account creation using PondoPath's approved forest-green visual language.

**Scope decision:** The user selected invite-only sign-up. This supersedes the original PRD's exclusion of invitations; public registration and additional businesses remain excluded.

**Architecture:** Reuse Supabase Auth's native invite tokens and the existing memberships table. An owner-authenticated server action creates a finance membership for the native invited identity and returns a private link, without sending email. Tokens travel in the URL fragment, then a POST action verifies them before setting the recipient's password. Existing membership/RLS checks remain authoritative. No new dependencies or schema changes.

## Steps

- [x] Test invitation validation, owner-only generation, immutable business/role, failed provisioning, token verification and membership checks before implementation. Test native replay and existing-user behavior against disposable accounts in the dedicated development project.
- [x] Implement `lib/server/invitations.ts`, a server-only admin client, `/team` invitation form and owner navigation. Configure a trusted `APP_URL` for copyable links. Never log links or send messages.
- [x] Share a responsive auth shell between `/login` and `/signup`. Preserve real sign-in, add accessible password visibility, invitation-required/error/pending states, and a password setup form. Preserve entered non-password data on failures.
- [x] Run the focused auth tests, lint/type checking and a production build. Check desktop/mobile auth pages and keyboard interactions in the browser. Refresh the code map and review the change once.

## Security boundaries

Only `requireActor()` owners reach the service-role client. Invitees always receive finance access in the actor's business. Existing members cannot be moved or promoted by invitation. Supabase owns token expiry and one-use verification. Opening a URL never consumes the token. A failed password update may be retried only by the same authenticated invited identity. Missing/invalid membership prevents onboarding. A bearer invitation must be shared privately with its intended recipient.

## Sources

- Installed Next.js 16.4.3 authentication guide (`node_modules/next/dist/docs/01-app/02-guides/authentication.md`).
- [Supabase generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink).
- [Supabase verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp).

## Verification ledger

- Focused invitation unit tests: 11 passed. Initial run failed because the implementation did not exist; implementation then passed. Rerun after the mismatched-token sign-out adjustment: 11 passed.
- Dedicated development project: disposable invitation reissue, verified password setup, own finance membership, rejected invalid/replayed token, password sign-in and rejected confirmed-account reinvitation all passed. Fixtures were removed. No email was sent.
- Type checking, focused ESLint and production build passed. Final visual changes only compact short desktop spacing and remove an empty error wrapper.
- Real-browser checks: laptop 1366×768, phone 440×956 and small phone 320×900. Login and invitation form fit without horizontal overflow; laptop sign-up fits within the viewport after reducing short-screen spacing. Password visibility and keyboard focus worked. Missing invitation guidance and unauthenticated `/team` redirection worked.
- Owner invitation generation was tested in the server unit tests and native Supabase API integration; the authenticated owner form was not submitted in the browser because no owner browser session was available. Real-user password setup and waiting for wall-clock token expiry were not performed.
- One fresh read-only reviewer found no important issues. Graphify refreshed to 520 nodes / 1,261 edges; CSS inspected directly, optional SQL parser remains unavailable.
- No new qualifying Next.js feedback issues were found during this request.
