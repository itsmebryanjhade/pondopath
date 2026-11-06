# Component scope

- Reuse existing shared components, tokens and `ProductBrand` before adding a dependency or parallel design pattern. See [design guidance](../docs/design-system.md).
- Apply the relevant frontend/accessibility skills; use Taste's app-screen route for dashboard components.
- Preserve labels, focus, keyboard access, loading/error/empty states and responsive money/date presentation. Do not make styling changes that obscure financial meaning.
- Keep financial calculations and authorization in their existing programmed/server boundaries. Follow the owning callers and tests when changing a component contract.
- Verify the affected UI in an authorized real browser when behavior or layout changes; disclose untested states and viewport gaps.
