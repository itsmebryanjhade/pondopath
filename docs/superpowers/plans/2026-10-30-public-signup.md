# Public Sign-up and Private Workspace Implementation Plan

**Goal:** Anyone can create a PondoPath account and an empty private business workspace; owners can still invite teammates.

**Architecture:** Supabase Auth handles email/password registration. A narrow authenticated database function creates the business and owner membership together after sign-in. Existing invitation handling remains separate.

**Tech Stack:** Next.js Server Actions, Supabase Auth/Postgres, TypeScript.

**Spec:** `docs/superpowers/specs/SoloForge_Cash-Flow_Action_Planner_PRD_v1.0.md`, superseded for registration by Bryan's 30 October instruction.

## Slice 1: Registration and workspace access

- [x] Test a new authenticated user creating one empty private workspace, and reject anonymous and repeat calls.
- [x] Add the database function and verify its business isolation.
- [x] Add public sign-up and initial business setup; keep invitation sign-up working. Development sign-up does not require email confirmation, per Bryan's test preference.
- [x] Link sign-up from login and landing; update the PRD's access scope.
- [x] Run focused integration, type, lint, and page checks.

**Risk:** The development project skips email verification for immediate testing. Enable and test verification and email delivery before wider public use. AI requests and the scheduled automation are still limited to the fictional demo workspace.
