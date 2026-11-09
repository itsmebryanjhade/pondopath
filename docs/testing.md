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

The 3 November code gate passed on Node 24.22.1: 271 unit/UI tests, 112 integration tests, typecheck, lint and the Webpack production build. See `taskDGate` in the [runtime evidence](mvp-runtime-evidence.json). The 390px phone check deferred from that gate passed on 6 November in an emulated 390×844 viewport on the local dev server, after one scroll-offset CSS fix (`r3PhoneCheck` in the same file). This code gate is not a production-readiness claim. Development email confirmation and [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remain wider-launch prerequisites.

Task 16 (XLSX import) owning checks passed on 6 November with Node 24.22.1: 75 unit/UI tests in `lib/domain/xlsx.test.ts`, `lib/domain/imports.test.ts` and `lib/ui/intake-review.test.ts`; 8 tests in `tests/integration/intake.test.ts`, including CSV/XLSX replay; typecheck; and lint of project source, plus one browser upload review. Full lint also reports two errors in the ignored local `.taste-skill/check-production-css.cjs` helper, which is not project source. This is a focused feature check, not a new full gate.

Connect Google (demo item D2) checks passed on 6 November with Node 24.22.1: 476 unit/UI tests, 130 integration tests (including `tests/integration/google-connect.test.ts`), typecheck and the Webpack production build. The live proof with Bryan's Google test account (sign-in, picking, setup, sync, repeat sync, edited row, recovery) is recorded as `connectGoogleProof` in the [runtime evidence](mvp-runtime-evidence.json), including what was not checked.

Add records (workspace piece 1) checks passed on 7 November with Node 24: 548 unit/UI tests, `tests/integration/intake.test.ts` 10/10, typecheck and the production build (`/add` listed). Browser, with the fictional `public/samples/pondopath-mixed.csv`: drag over any page shows "Drop to import" and hides on leave, dragged text is ignored, a `.pdf` gives the notice toast, a drop on Overview opens `/add` and reaches the Check step in about 1.8 seconds with "We found 4 invoices and 2 expenses.", no horizontal overflow at desktop or 375px, and 44px buttons. Not done in the browser: pressing Send (it would add proposals to the shared workspace; staging is covered by the intake integration tests), a real Google sign-in, and an emulated reduced-motion pass.

Workspace polish (7 November, Node 24.22.1): Overview, Forecast, Add records and Cash ledger changes described in the [UI/UX polish playbook](ui-polish-playbook.md). Unit/UI tests, typecheck and lint pass; see the commit for the counts. Browser: each changed page checked at about 1880px, 1100px and 375px with no horizontal overflow. Not checked in the browser: a filled Payment history (the shared workspace has no recorded payments; the list is covered by unit tests), saving opening cash or any receipt, and an emulated reduced-motion pass.

## Build and runtime notes

The production build downloads Google Fonts and needs network access. Next.js Cache Components and Partial Prefetching remain enabled. Node-RED will run separately from Next.js/Vercel. Read [AGENTS.md](../AGENTS.md) before implementation.

Use [AI verification](ai-verification.md), [automation verification](automation-verification.md) and the [demo guide](demo-and-verification.md) only when relevant. Those runtime/provider operations have their own prerequisites and side effects. Do not repeat them for a prose-only change.
