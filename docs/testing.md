# Testing and verification

Run checks from the repository root with Node 24 and npm. Match verification to changed behavior; documentation-only changes require document/link checks rather than application suites.

## Checks

```sh
npm run test:unit
npm run test:integration
npm run typecheck
npm run lint
npm run build
```

Integration tests require a separate ignored `.env.test.local`:

```dotenv
TEST_ENVIRONMENT=isolated-development
TEST_SUPABASE_URL=https://vhdokiicswumirqxmbpn.supabase.co
TEST_SUPABASE_PUBLISHABLE_KEY=<development publishable key>
TEST_SUPABASE_SERVICE_ROLE_KEY=<development server key>
```

Missing test configuration fails the integration command. The suite signs in actual isolated owner/finance accounts and creates a separate unrelated test business. Cleanup is restricted to the IDs and ownership marker created by each fixture. It does not reset the project or delete the seeded business.

The 3 November code gate passed on Node 24.22.1: 271 unit/UI tests, 112 integration tests, typecheck, lint and the Webpack production build. See `taskDGate` in the [runtime evidence](mvp-runtime-evidence.json). The 390px phone check is explicitly deferred by the owner; this code gate is not a production-readiness claim. Development email confirmation and [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remain wider-launch prerequisites.

## Build and runtime notes

The production build downloads Google Fonts and needs network access. Next.js Cache Components and Partial Prefetching remain enabled. Node-RED will run separately from Next.js/Vercel. Read [AGENTS.md](../AGENTS.md) before implementation.

Use [AI verification](ai-verification.md), [automation verification](automation-verification.md) and the [demo guide](demo-and-verification.md) only when relevant. Those runtime/provider operations have their own prerequisites and side effects. Do not repeat them for a prose-only change.
