#!/usr/bin/env bash
# Validates every content pack against its JSON Schema.
# Run with: npm run validate
set -uo pipefail

SCHEMAS="public/schemas"
PACK="public/packs/srd-5.2"
COMMON="$SCHEMAS/common.schema.json"

# schema stem : collection file stem
PAIRS=(
  "class:classes"
  "subclass:subclasses"
  "species:species"
  "origin:origins"
  "feat:feats"
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

for pair in "${PAIRS[@]}"; do
  schema="$SCHEMAS/${pair%%:*}.schema.json"
  data="$PACK/${pair##*:}.json"

  [ -f "$data" ] || { printf '  %-14s skipped (no %s)\n' "${pair##*:}" "$data"; continue; }

  # --all-errors matters: ajv stops at the first bad entry without it.
  out=$(npx --no-install ajv-cli validate \
    --spec=draft2020 --all-errors \
    -s "$schema" -r "$COMMON" -d "$data" 2>&1 | grep -v 'strict mode')

  if printf '%s' "$out" | grep -q ' valid$'; then
    printf '  %-14s ok\n' "${pair##*:}"
  else
    printf '  %-14s FAILED\n' "${pair##*:}"
    # A single bad qualifier emits one error per oneOf branch, so the raw dump runs
    # to hundreds of lines. The repeated instancePath is the signal: it names which
    # entry matched nothing. Show those, deduped.
    printf '%s\n' "$out" | grep -o "instancePath: '[^']*'" | sort -u | head -20 | sed 's/^/      /'
    n=$(printf '%s\n' "$out" | grep -c "instancePath:")
    printf '      (%s raw errors; rerun with -d for full output)\n' "$n"
    failed=1
  fi
done

echo
if [ "$failed" -eq 0 ]; then
  echo "All packs valid."
else
  echo "Validation failed."
fi
exit "$failed"
