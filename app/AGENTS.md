# App Router scope

- Follow root rules and read the relevant installed Next.js guide before framework changes; do not assume older App Router APIs apply.
- For screen/layout work, consult [design guidance](../docs/design-system.md) and the project workflow's UI skills. Use Taste's app-screen route for signed-in product screens.
- For actions, HTTP routes, authentication or financial writes, consult [database rules](../docs/database.md) and the relevant security/Supabase skills. Authorize on the server; client checks are not a permission boundary.
- Keep expected receipts, actual payments, scenarios and review states clear in the interface. Preserve accessible errors, keyboard use, amount/date clarity and mobile behavior.
- Run owning tests and authorized real-browser checks for changed interactions. Do not claim a deferred phone-width check was performed.
