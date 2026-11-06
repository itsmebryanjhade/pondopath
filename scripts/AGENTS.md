# Script scope

- Inspect a script's callers and environment/data guards before changing it. Run from the repository root unless its documented interface says otherwise.
- Seeding, integration checks, AI evaluation and automation verification can affect external development services or incur provider charges. Preserve their existing project/fixture guards and the user's authorization boundary; a documentation edit does not authorize these runs.
- Keep credentials in ignored environment files. Do not print secret values, replace existing environment files, reset shared data or delete fixtures not owned by the current run.
- Keep evidence output paths stable; [testing](../docs/testing.md), [AI verification](../docs/ai-verification.md) and [worker verification](../automation/README.md) describe their consumers.
- Verify changed script behavior with a focused self-check or test, using fictional/isolated data where appropriate.
