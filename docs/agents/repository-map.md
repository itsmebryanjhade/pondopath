# Local code map and focused reading

- Before broad code exploration, query a current `graphify-out/graph.json`. Inspect the relevant source before editing; the map can be incomplete or stale. If `graph.json` is older than the files you are exploring, refresh it (below) or treat it as stale and fall back to focused searches.
- Initial local map: `graphify extract . --code-only --no-cluster --max-workers 1`.
- After source changes, refresh with `graphify update . --no-cluster` and check results against the changed files. Use focused `rg` searches if mapping is unavailable or insufficient.
- Keep `.graphifyignore` exclusions in effect. Do not index secrets, dependencies, build output, or generated reports. Do not enable cloud services or automatic hooks as part of ordinary mapping.
- The code-only map does not index the PRD/research documents or unsupported files such as CSS. Read those directly when relevant. Avoid rereading the entire workspace for each task.

Documentation-only changes do not require rebuilding the code-only map. Treat ignored reports as local tool output, not maintained documentation.
