# Contract template

Copy this block once per contract. Fill every field; write "none" when a field is empty.

```
ID: C<n>-<short-slug>
WORKER: kg-coder | ollama-worker
GOAL: one or two sentences on what must be true when this is done.
CONTEXT: files and docs to read first (paths), plus any fact the worker can't find in the repo.
ALLOWED_FILES:
  - exact/path/one.rs
  - exact/path/two.tsx
FORBIDDEN: what must not change (e.g. "no new dependencies", "generate_handler! list unchanged").
ACCEPTANCE:
  - [ ] A1: <what is true> -- check: `<command>` -- expect: <exit 0 / output contains X>
  - [ ] A2: ...
  - [ ] A-gate: `cargo clippy --all-targets -- -D warnings` and `cargo test` in src-tauri exit 0 (if Rust touched);
        `npx tsc --noEmit` exits 0 (if TS touched)
  - [ ] A-scope: files changed since the snapshot are a subset of ALLOWED_FILES
CONSTRAINTS: the CLAUDE.md rules that apply (code style; never hold a State lock while calling window_manager; never two
  locks at once). IPC API change: yes/no (if yes, Rust and React sides are both in ALLOWED_FILES).
DEPENDS_ON: contract IDs that must be approved first, or none.
```

# Worker report (kg-coder and ollama-worker)

```
FILES_TOUCHED: path -- what changed, one line each
COMMANDS: `command` -> exit code, one-line result
ACCEPTANCE: A1 PASS|FAIL -- evidence; one line per criterion
DECISIONS: choices the contract left open, and why
QUESTIONS: what the lead or the user must decide
WEB_SEARCH_REQUESTS: exact queries and why
PROPOSALS: improvements outside the contract, not applied
```

# Review report (kg-reviewer)

```
| Criterion | Result | Evidence |
|---|---|---|
| A1 | PASS/FAIL | command + relevant output, or file:line |
VERDICT: APPROVED | REJECTED
REASONS: for REJECTED, one actionable line per problem (file:line, what is wrong, what is expected)
PROPOSALS: problems outside the contract worth raising
```
