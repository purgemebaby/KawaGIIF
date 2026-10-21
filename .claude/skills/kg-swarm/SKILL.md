---
name: kg-swarm
description: Lead/worker/reviewer workflow for KawaGiif. Splits a task into contracts, runs kg-coder or ollama-worker on each, and gates every contract through kg-reviewer. Only when the user types /kg-swarm.
disable-model-invocation: true
argument-hint: <task to split and delegate>
---

You are the lead. You plan, delegate, and judge. You do not write code yourself.

Task: $ARGUMENTS

## 1. Snapshot
Run `git status --porcelain` and save the output. Workers' diffs are measured against this snapshot, because the tree may
already be dirty. If the task touches files that are already dirty, tell the user before going on.

## 2. Contracts
Read CLAUDE.md and the code the task needs. Split the task into contracts using [contract.md](contract.md). Rules:
- Each contract has one goal that a single worker can finish and a reviewer can check.
- `ALLOWED_FILES` lists exact paths, not folders. Contracts that run in parallel must have **disjoint** `ALLOWED_FILES`.
  If two contracts need the same file, run them one after the other.
- Every acceptance criterion names the command that checks it and the expected result. "Code is clean" is not a
  criterion; "`cargo clippy --all-targets -- -D warnings` in src-tauri exits 0" is.
- Renaming a command, argument or event means the Rust side and the React side go in the same contract.
- Show the contracts to the user and wait for an OK before launching anything.

## 3. Pick the worker
- `ollama-worker` (default, `KG_OLLAMA_MODEL` in `.claude/settings.json`; fallback `deepseek-v4-pro:cloud`): any contract
  precise enough to implement, including logic, `window_manager.rs` and IPC changes with both sides in `ALLOWED_FILES`.
- `kg-coder`: `unsafe`, `native/`, dependencies, `capabilities/`, or a contract ollama-worker failed twice.
- The lead reads every worker diff itself (correctness, bugs, wasted work, helpers that could be reused) before or
  instead of `kg-reviewer`.

## 4. Run
Launch independent contracts in parallel (one message, several Agent calls), passing the full contract text. Wait for the
reports and check that every heading is there.

## 5. Review
For each finished contract, launch `kg-reviewer` with the contract, the worker's report and the step 1 snapshot.
- `VERDICT: APPROVED`: the contract is done.
- `VERDICT: REJECTED`: send the reasons back to the same worker (SendMessage, so it keeps its context), then review again.
  After 2 rejected rounds, stop and ask the user.

## 6. Close
Run the full gate once (`cargo clippy --all-targets -- -D warnings`, `cargo test`, `npx tsc --noEmit`). Report to the user:
one line per contract (verdict, files), anything the workers listed under QUESTIONS, PROPOSALS and WEB_SEARCH_REQUESTS,
and what is left to do. Do not commit unless the user asks.
