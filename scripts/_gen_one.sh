#!/bin/bash
# Batch helper: generate one child's book. Arg: "name|age|gender|book|folder".
# folder (photos subfolder) defaults to name if omitted.
# Expects GEMINI_API_KEY etc. already exported in the environment.
# Photos are read from $PHOTOS_DIR/<folder> (defaults to ./photos/<folder>).
IFS='|' read -r name age gender book folder <<< "$1"
folder="${folder:-$name}"
cd "$(dirname "$0")/.." || exit 1
photos_dir="${PHOTOS_DIR:-./photos}"
log="/tmp/gen-${folder// /_}.log"
echo ">>> START ${name} (${book}) [folder: ${folder}]"
if npx tsx scripts/generate.ts --name "$name" --age "$age" --gender "$gender" \
     --book "$book" --photos "${photos_dir}/${folder}" \
     > "$log" 2>&1; then
  fp=$(grep -o 'FAILED PAGES:.*' "$log" || echo 'all pages ok')
  echo "<<< DONE ${name} [${folder}] — ${fp}"
else
  echo "!!! FAIL ${name} [${folder}] (see ${log})"
fi
