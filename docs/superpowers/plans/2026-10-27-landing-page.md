# PondoPath Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this approved slice inline. Steps use checkbox syntax for tracking.

**Goal:** Replace the root redirect with a polished public PondoPath landing page, using the approved forest-green direction.

**Architecture:** Keep the page server-rendered, with one small client component for an illustrative payment-timing comparison. Scope all visual rules to a CSS module. Existing authentication, workspace screens, database access, and forecast rules remain the implementation source of truth.

**Tech Stack:** Existing Next.js, React, TypeScript, CSS Modules, and next/font. No new dependencies.

**Spec:** `docs/superpowers/specs/SoloForge_Cash-Flow_Action_Planner_PRD_v1.0.md`; frontend direction approved in chat, then narrowed by Bryan to the landing page first.

## Approved design contract

- Source: `https://github.com/itsmebryanjhade/pondopath1.0` (`src/App.tsx` and `src/index.css`), which matches the selected `color-route` published design. The repository numbering differs from the order of the published links.
- References: `pondopath2.0` supplies the alternative rounded mint direction; retain its direct explanation of cash shortages, while using the forest design's typography and surfaces.
- Palette: ivory `#f7f8f4`, white surfaces, ink `#18372d`, primary `#1e4b3c`, chart `#2e7b58`, border `#dbe3de`. Use darker muted text and warning text to preserve contrast.
- Typography: self-host DM Sans through next/font on this page only. Keep the existing PondoPath mark and product name.
- Page argument: see expected cash together → understand why timing matters → review a practical workflow → sign in.
- Primary action: a working `/login` link for existing owner/finance accounts.
- The fictional example uses the existing deterministic forecast engine: PHP 40,000 opening cash, PHP 50,000 expected receipt, PHP 80,000 obligations. Moving the receipt five days later exposes a PHP 40,000 shortage even though the end balance remains PHP 10,000.
- Phone: stack the hero and preview; show usable native radio controls; keep content inside the viewport and touch targets at least 44px.

## Global constraints

- Landing page only. Dashboard, onboarding, and authentication changes are separate later slices.
- Public copy and example data never read or write business records.
- Do not add fake customer proof, unsupported savings, dead request-access controls, or unimplemented AI controls.
- Reuse existing `ProductBrand`, money formatting, and `calculateForecast`.
- Prefer native links, radio inputs, and details elements; visible focus and reduced-motion support.

## Review focus

- A public visitor can reach `/` without signing in; `/login` remains reachable.
- Sample amounts reconcile in both states and do not imply an actual receipt.
- Phone text, controls, and SVG labels remain readable without page overflow.
- Keyboard users can switch the scenario and navigate the sections.
- Scoped styles and font loading do not restyle the signed-in application.

### Task 1: Landing page slice

**Files:** Replace `app/page.tsx`; create `app/landing.module.css` and `components/landing-preview.tsx`; restrict the existing Tailwind loader in `next.config.ts` to non-module stylesheets.

**Interfaces:** `LandingPreview()` consumes no private data and produces a local radio-controlled example. It calls `calculateForecast(input: ForecastInput)` and `formatPHP(cents)` from the existing domain code.

- [x] Inspect both reference repositories, relevant installed Next.js guides, current root route, and shared brand component.
- [x] Implement scoped source-derived tokens, public page copy/navigation, and the responsive interactive example.
- [x] Run lint and typecheck once on the completed source. Verify both sample states, keyboard operation, root/sign-in navigation, and representative desktop/phone widths in the browser. Correct demonstrated issues without repeating unrelated suites.
- [x] Refresh the required local code map and inspect the task diff.
- [x] Commit the landing slice separately with a focused message.

**Ruling:** The existing `*.css` Tailwind loader rule rewrote the CSS Module to a `.module.css.css` global stylesheet, leaving its import with an empty export. Exclude `.module.css` from that rule so Next's native module handling preserves scoping. Existing global Tailwind styling keeps its configured loader.

## Verification record

- Lint and typecheck passed. After the stylesheet-boundary correction and static copyright fix, the production build passed with `/` prerendered as static content.
- Browser confirmed the PHP 10,000 on-time end balance and PHP 40,000 delayed-payment shortage, with the expected receipt date updating. Arrow-key radio switching and the live status text worked.
- FAQ expansion and navigation to the existing `/login` page worked. No records were saved or changed.
- Browser checked measured widths from 480px upward without horizontal content overflow. The viewport tool did not produce the requested exact narrow-phone dimensions; 320px remains unverified. A stacked metric layout is supplied below 380px.
- A fresh read-only reviewer found no material issues in this slice. No unrelated application suites were rerun.
- Graphify code-map refresh passed; SQL remains outside the map because its optional parser is not installed.

### Task 2: Approved hero responsiveness polish

**Files:** `app/landing.module.css`, `components/landing-preview.tsx`.

- [x] Center the desktop hero group below the header, use even columns, and cap the preview at 520px wide.
- [x] Compact the chart and spacing without scaling down the whole card. Move source notes into a native disclosure; retain the interactive example and its amounts.
- [x] Stack and center the tablet layout below 1101px; keep phone copy left aligned and touch controls at least 44px.
- [x] Verify 1366×768, 1024×768, 440×956 and 320px layouts with exact-size iframe viewports, plus scenario switching and keyboard disclosure access. Laptop copy, action and collapsed preview must fit within the initial viewport.
- [x] Run focused lint/type checks, refresh the code map and commit the polish independently.

**Polish evidence:** At the 1366×768 initial viewport, the preview measured 520×519px and ended at y=681; the primary action ended at y=548, and the hero at y=766. The laptop, tablet, 440px and 320px frame sizes had no horizontal overflow; each headline remained two lines and each radio label retained a 44px hit area. Selecting the delayed case showed the PHP 40,000 gap; Enter opened the calculation notes with focus on the summary. This exact iframe check supersedes the initial slice's narrow-phone verification limitation. Focused component lint and typecheck passed; unrelated application suites were not repeated.
