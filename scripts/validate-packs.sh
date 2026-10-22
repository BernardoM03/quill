#!/usr/bin/env bash
# Validates every content pack against its JSON Schema.
# Run with: npm run validate
set -uo pipefail

SCHEMAS="public/schemas"
PACKS="public/packs"
COMMON="$SCHEMAS/common.schema.json"

# schema stem : collection file stem
PAIRS=(
  "class:classes"
  "subclass:subclasses"
  "species:species"
  "origin:origins"
  "feat:feats"
  "skill:skills"
  "tool:tools"
  "spell:spells"
  "equipment:equipment"
  "language:languages"
  "creature:creatures"
  "rule:rules"
  "magic-item:magic-items"
  "conditions:conditions"
  "pack:pack"
)

failed=0

# ajv reports a malformed $ref as an opaque "can't resolve reference", so check
# for the common typo first and say plainly what is wrong.
if bad=$(grep -rn '#/defs/' "$SCHEMAS" 2>/dev/null); then
  echo "Malformed \$ref — '#/defs/' should be '#/\$defs/':"
  echo "$bad" | sed 's/^/  /'
  echo
  failed=1
fi

# Prints the schema stem for a collection file stem, or nothing if none matches.
schema_for() {
  for pair in "${PAIRS[@]}"; do
    [ "${pair##*:}" = "$1" ] && { echo "${pair%%:*}"; return; }
  done
}

for pack_dir in "$PACKS"/*/; do
  pack_dir="${pack_dir%/}"
  [ -f "$pack_dir/pack.json" ] || continue
  echo "${pack_dir##*/}"

  # pack.json itself is always checked; the rest is whatever it lists in provides.
  provides=$(node -e 'console.log(["pack", ...require(process.argv[1]).provides].join(" "))' "./$pack_dir/pack.json")

  for collection in $provides; do
    stem=$(schema_for "$collection")
    data="$pack_dir/$collection.json"

    [ -n "$stem" ] || { printf '  %-14s FAILED (no schema for this collection)\n' "$collection"; failed=1; continue; }
    [ -f "$data" ] || { printf '  %-14s FAILED (in provides, but %s is missing)\n' "$collection" "$data"; failed=1; continue; }

    # --all-errors matters: ajv stops at the first bad entry without it.
    out=$(npx --no-install ajv-cli validate \
      --spec=draft2020 --all-errors \
      -s "$SCHEMAS/$stem.schema.json" -r "$COMMON" -d "$data" 2>&1 | grep -v 'strict mode')

    if printf '%s' "$out" | grep -q ' valid$'; then
      printf '  %-14s ok\n' "$collection"
    else
      printf '  %-14s FAILED\n' "$collection"
      # A single bad qualifier emits one error per oneOf branch, so the raw dump runs
      # to hundreds of lines. The repeated instancePath is the signal: it names which
      # entry matched nothing. Show those, deduped.
      printf '%s\n' "$out" | grep -o "instancePath: '[^']*'" | sort -u | head -20 | sed 's/^/        /'
      n=$(printf '%s\n' "$out" | grep -c "instancePath:")
      printf '        (%s raw errors; rerun with -d for full output)\n' "$n"
      failed=1
    fi
  done
done

echo
if [ "$failed" -eq 0 ]; then
  echo "All packs valid."
else
  echo "Validation failed."
fi
exit "$failed"
