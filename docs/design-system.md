# Design system and UI references

PondoPath is the product; SoloForge is the builder brand. The transparent PP monogram is `public/brand/pondopath-monogram.png`; its simpler small-size companion is `public/brand/pondopath-icon.png`, used by notifications and the browser icon. Landing, sign-in, loading and workspace screens share the monogram through `ProductBrand`. The earlier blue mark remains as a historical asset. Sign-in errors appear beside the form; a dismissible successful sign-in notice is consumed on the first overview navigation.

## Use the existing product design

- Reuse shared components and current application styles; current source is the implementation authority.
- Apply Taste's app-screen route to signed-in dashboards and the frontend engineering skill to accessibility and interactions. Financial clarity takes priority over decoration.
- Verify tables, amounts, states, keyboard access and the affected mobile layouts in a real authorized browser; do not claim a deferred check was performed.
- For one-screen-at-a-time polish, follow the [UI/UX polish playbook](ui-polish-playbook.md): its rules, shared pieces and checklist.

## Recorded design decisions

- [Workspace design specification](superpowers/specs/2026-10-28-main-workspace-design.md).
- [Brand-refresh plan](superpowers/plans/2026-10-28-pondopath-brand-refresh.md) and [workspace-fidelity slices](superpowers/plans/2026-10-28-workspace-fidelity-slices.md).
- [Cash-overview QA](superpowers/reviews/cash-overview/design-qa.md) and [Figma-port QA](superpowers/reviews/figma-port/design-qa.md).

These are dated design records, not proof of current browser coverage. See [project status](project-status.md) and [testing evidence](testing.md). Code-style asset paths on this page are repository-root relative.
