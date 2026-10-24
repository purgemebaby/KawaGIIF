#!/usr/bin/env bash
# Runs one kg-swarm contract on an Ollama Cloud model via `ollama launch claude`, then measures what it touched and runs the gate.
# Usage: ollama-run.sh <contract-file> [model]. Model default: $KG_OLLAMA_MODEL or glm-5.3:cloud. Exit 0 only if scope and gate pass.
set -u
export LC_ALL=C  # sort and comm must agree on byte order

contract="${1:?usage: ollama-run.sh <contract-file> [model]}"
model="${2:-${KG_OLLAMA_MODEL:-glm-5.3:cloud}}"
inner_timeout="${KG_OLLAMA_TIMEOUT:-420}"
[ -f "$contract" ] || { echo "contract not found: $contract"; exit 1; }
contract="$(cd "$(dirname "$contract")" && pwd)/$(basename "$contract")"

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
cd "$root" || exit 1
ollama="ollama"
command -v ollama >/dev/null 2>&1 || ollama="$LOCALAPPDATA/Programs/Ollama/ollama.exe"
run_dir="${TMPDIR:-/tmp}/kg-ollama/$(date +%Y%m%d-%H%M%S)-$$"  # PID: workers launched in the same second get their own folder
mkdir -p "$run_dir"

# One line per dirty or untracked file with its content hash, so edits on already-dirty files are caught too.
snapshot() {
    git status --porcelain --untracked-files=all | cut -c4- | sed 's/.* -> //; s/^"//; s/"$//' | sort -u | while IFS= read -r f; do
        if [ -f "$f" ]; then echo "$(git hash-object -- "$f") $f"; else echo "deleted $f"; fi
    done
}

snapshot | sort > "$run_dir/before.txt"
awk '/^ALLOWED_FILES:/{f=1;next} f&&/^[[:space:]]*-[[:space:]]/{sub(/^[[:space:]]*-[[:space:]]*/,"");sub(/[[:space:]]+$/,"");print;next} f{exit}' "$contract" > "$run_dir/allowed.txt"
[ -s "$run_dir/allowed.txt" ] || { echo "contract has no ALLOWED_FILES list"; exit 1; }

cat > "$run_dir/prompt.md" <<'EOF'
You are a worker in the KawaGiif repo (Tauri v2 + Rust in src-tauri/, React in src/). Carry out the contract below.
Rules: edit only the files under ALLOWED_FILES; read the "KawaGiif code style" section of CLAUDE.md first and match it;
do not add dependencies; do not commit; run the command of every acceptance criterion and report the real result.
End with this report, every heading present ("none" when empty):
FILES_TOUCHED, COMMANDS, ACCEPTANCE, DECISIONS, QUESTIONS, PROPOSALS.

EOF
cat "$contract" >> "$run_dir/prompt.md"

allowed_tools="Read,Grep,Glob,Edit,Write,Bash(cargo check *),Bash(cargo clippy *),Bash(cargo test *),Bash(npx tsc --noEmit)"
timeout "$inner_timeout" "$ollama" launch claude --model "$model" --yes -- \
    -p "$(cat "$run_dir/prompt.md")" --allowedTools "$allowed_tools" --max-turns 40 --output-format json \
    > "$run_dir/inner.json" 2> "$run_dir/inner.err" < /dev/null
inner_exit=$?

snapshot | sort > "$run_dir/after.txt"
comm -13 "$run_dir/before.txt" "$run_dir/after.txt" | sed 's/^[^ ]* //' | sort -u > "$run_dir/touched.txt"
grep -vxF -f "$run_dir/allowed.txt" "$run_dir/touched.txt" > "$run_dir/violations.txt"

gate=()
gate_ok=1
check() {
    local name="$1"; shift
    local out
    out="$("$@" 2>&1)"
    local code=$?
    gate+=("\`$name\` -> exit $code")
    if [ $code -ne 0 ]; then gate_ok=0; gate+=("$(printf '%s\n' "$out" | grep -E ': (error|warning)|^error|FAILED|panicked|\([0-9]+,[0-9]+\)' | tail -20)"); fi
}
if grep -qE '^src-tauri/' "$run_dir/touched.txt"; then
    check "cargo clippy --all-targets -- -D warnings" bash -c 'cd src-tauri && cargo clippy --all-targets --message-format short -- -D warnings'
    check "cargo test" bash -c 'cd src-tauri && cargo test --quiet'
fi
if grep -qE '^(src/|[^/]*\.(ts|tsx|json)$)' "$run_dir/touched.txt"; then
    check "npx tsc --noEmit" node_modules/.bin/tsc --noEmit
fi
[ ${#gate[@]} -eq 0 ] && gate+=("none (no source files touched)")

echo "MODEL: $model"
echo "INNER_EXIT: $inner_exit$([ $inner_exit -eq 124 ] && echo ' (timed out)')"
echo "LOGS: $run_dir"
echo "INNER_REPORT:"
node -e 'try{const j=require(process.argv[1]);console.log(j.is_error?"ERROR: "+j.result:j.result)}catch(e){console.log("no JSON result; see inner.err")}' "$run_dir/inner.json"
echo "FILES_TOUCHED (measured):"; sed 's/^/  - /' "$run_dir/touched.txt"; [ -s "$run_dir/touched.txt" ] || echo "  none"
echo "SCOPE_VIOLATIONS (may include edits made by someone else during the run):"; sed 's/^/  - /' "$run_dir/violations.txt"; [ -s "$run_dir/violations.txt" ] || echo "  none"
echo "GATE:"; printf '  %s\n' "${gate[@]}"

[ $inner_exit -eq 0 ] && [ ! -s "$run_dir/violations.txt" ] && [ $gate_ok -eq 1 ]
