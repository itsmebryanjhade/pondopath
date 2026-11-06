# Test scope

- Use the actual commands and fixture boundaries in [testing](../docs/testing.md). Node 24 and npm are the supported environment.
- Cover user-visible behavior, meaningful failures and relevant PRD acceptance criteria. Money, authorization, duplicate requests and recovery need meaningful cases; avoid implementation-mirroring tests for trivial edits.
- Integration tests require isolated-development credentials and create only owned fictional fixtures. Missing configuration is a failure, not a passing/skipped integration gate. Do not reset the shared project or remove seeded business data.
- Preserve validations and assertions. Do not skip/delete tests or lower a threshold merely to make a check pass.
- Run the owning checks once after the change. Broaden only when changes, failures or unresolved concerns justify it; report exact outcomes and remaining gaps.
