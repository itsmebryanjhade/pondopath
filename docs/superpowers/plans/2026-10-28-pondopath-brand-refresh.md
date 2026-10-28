# PondoPath logo refresh

**Approved design:** Keep PondoPath and its existing wordmark. Use the user's overlapping PP with an upward-right arrow, forest-green foreground and a muted-green rear P, with transparent separation and background. Use a matching single P at small sizes. The user approved refinement and application on 28 October 2026.

**Scope:** Asset-only branding update. No dashboard layout, authentication, financial behavior or dependencies change. Execute inline using the existing worktree and `superpowers:executing-plans`.

- [x] Prepare transparent PP and single-P assets using imagegen, preserving the selected mark. Keep the original image as a historical asset.
- [x] Update `ProductBrand` to use PP, `AuthToast` to use the small P, and Next.js metadata to use the small P browser icon. Shared consumers include landing/header/footer, login/signup, workspace/sidebar/mobile header, and loading state.
- [x] Check transparency, correct served assets and icon references; inspect real 44px, 28px, 32px and 16px sizes and mobile layout in the browser. Run focused lint and type checking; skip unrelated money/auth tests for this visual change.
- [x] Attempt the code-map refresh, review the focused diff, record results and commit. See the environment limitation below.

## Asset brief

Generated with the built-in imagegen tool from the user's supplied PP reference. Main prompt: preserve PP composition and arrow, use solid forest green `#1E4B3C` / muted green `#6B897C`, remove the off-white backdrop and make arrow/separation transparent, produce one tightly framed mark without text. Companion prompt: remove the rear P only, preserve the foreground arrow and recenter on transparency. The existing text wordmark remains real text.

## Verification

- Two 1254×1254 RGBA PNGs have transparent background/cutouts. Original blue image retained. Image generation performed the visual edits; original generated outputs remain available outside the repo as well.
- Focused ESLint on the three changed components/layout and `npm run typecheck` passed. `git diff --check` passed.
- Browser size sheet checked PP at 44/32px and P at 16/24/28/32px, on off-white and white. All images loaded. The phone landing-header iframe loaded the shared PP mark and had equal body/scroll width (290 CSS pixels after its scrollbar).
- Actual login page rendered the PP mark at 44×44 through Next's optimizer and emitted `/brand/pondopath-icon.png` as its sole icon link. The same shared component reaches workspace, landing/footer and loading states by the queried code map and focused source inspection.
- Self-reviewed the focused diff: three image references plus branding documentation/assets. No behavior or image dimensions changed. Temporary inspection HTML removed.
- Windows Application Control blocked `graphify.exe`, so the map refresh could not run. The existing map was queried; affected callers were verified directly. No attempt was made to bypass that policy.
- Backend suites and a repeated production build were skipped for this asset/reference-only update. No new qualifying Next.js feedback issues arose.
