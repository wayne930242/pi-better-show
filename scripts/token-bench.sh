#!/usr/bin/env bash
# Measures the output tokens an agent spends on each README example page: written as blocks (the Markdown file,
# echoed back verbatim) against written as one self-contained HTML page with the same content and working controls.
# Uses the Claude Code CLI, so the counts come from Claude's own tokenizer. Prints one TSV line per run.
#
#   scripts/token-bench.sh [runs] [model]     defaults: 3 runs, claude-sonnet-5-5
set -euo pipefail

runs=${1:-3}
model=${2:-claude-sonnet-5-5}
here=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

html_prompt='You are a coding agent. Your user must see the page below in a web browser and answer it. Write ONE self-contained HTML file that presents the same content with working controls (option picks, form fields, checkboxes, sortable/filterable table, collapsible tree, rendered diagram, coloured diff, image comparison, quick-reply buttons: whatever the content holds). When the user answers, POST the answer as JSON to /answer. Output only the HTML, no commentary.'
echo_prompt='Repeat the text between the markers exactly, byte for byte, with nothing before or after it.'

tokens() {
  claude -p --model "$model" --output-format json <"$1" | python3 -c 'import json, sys; d = json.load(sys.stdin); print(d["usage"]["output_tokens"], "html" if "<html" in d["result"].lower() else "text", sep="\t")'
}

printf 'page\tform\trun\toutput_tokens\toutput\n'
for page in decide status structure review; do
  source="$here/examples/readme-$page.md"
  printf '%s\n<<<BEGIN\n%s\nEND>>>\n' "$echo_prompt" "$(cat "$source")" >"$work/echo.txt"
  printf '%s\t%s\t%s\t%s\n' "$page" blocks 1 "$(tokens "$work/echo.txt")"
  printf '%s\n\n%s\n' "$html_prompt" "$(cat "$source")" >"$work/html.txt"
  for run in $(seq 1 "$runs"); do
    printf '%s\t%s\t%s\t%s\n' "$page" html "$run" "$(tokens "$work/html.txt")"
  done
done
