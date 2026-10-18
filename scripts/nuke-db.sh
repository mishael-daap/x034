#!/usr/bin/env bash
# One-off destructive maintenance: wipe all user-generated data, keeping the
# seeded catalog (node_tiers, banks, companies, jobs), admin records
# (admin users + app_settings + withdrawal_presets), and the `fucker` account.
#
# Takes a full JSON backup first, then deletes children before parents so the
# `on delete restrict` foreign keys never block.
#
# Usage: bash scripts/nuke-db.sh
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
[ -f .env.local ] && { set -a; . ./.env.local; set +a; }

API="$SUPABASE_URL/rest/v1"
H=(-H "apikey: $SUPABASE_API_KEY" -H "Authorization: Bearer $SUPABASE_API_KEY")
KEEP_NAMES=("Platform" "legionadmin" "fucker")

count() { # count <table> [filter]
  curl -s "$API/$1?select=*&${2:-id=not.is.null}" "${H[@]}" \
    -H "Range: 0-0" -H "Prefer: count=exact" -o /dev/null -D - \
    | grep -i content-range | tr -d '\r' | sed 's/.*\///'
}
dump() { # dump <table> <file>
  curl -s "$API/$1?select=*" "${H[@]}" | jq -c . >> "$2"
}

STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP=".temp/db-backup-$STAMP.json"
echo "==> Backing up to $BACKUP"
echo "{" > "$BACKUP"
TABLES=(users nodes assignments transactions payments withdrawals jobs companies node_tiers banks app_settings withdrawal_presets)
for t in "${TABLES[@]}"; do
  echo -n "  \"$t\": " >> "$BACKUP"
  dump "$t" "$BACKUP"
  echo "," >> "$BACKUP"
done
truncate -s -2 "$BACKUP" 2>/dev/null || true
echo "" >> "$BACKUP"
echo "}" >> "$BACKUP"
echo "    saved $(wc -c < "$BACKUP") bytes"

echo "==> Resolving keep-set"
KEEP_IDS=()
for name in "${KEEP_NAMES[@]}"; do
  ids=$(curl -s "$API/users?select=id&name=eq.$name" "${H[@]}" | jq -r '.[].id')
  for id in $ids; do KEEP_IDS+=("$id"); echo "    keep $name → $id"; done
done
KEEP_CSV=$(IFS=,; echo "${KEEP_IDS[*]}")
DEL_IDS=$(curl -s "$API/users?select=id&id=not.in.($KEEP_CSV)" "${H[@]}" | jq -r '.[].id' | paste -sd, -)
echo "    delete users: $DEL_IDS"

echo "==> Before:"; for t in "${TABLES[@]}"; do printf "    %-18s %s\n" "$t" "$(count "$t")"; done

del() { # del <table> [filter]
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API/$1?${2:-id=not.is.null}" "${H[@]}")
  echo "    delete $1${2:+ ($2)} → HTTP $code"
}

echo "==> Deleting user-generated data (children first)"
del transactions
del payments
del withdrawals
del assignments
del nodes

echo "==> Clearing self-referrals pointing at deleted users"
curl -s -o /dev/null -w '    clear referrer → HTTP %{http_code}\n' \
  -X PATCH "$API/users?referrer=in.($DEL_IDS)" "${H[@]}" \
  -H "Content-Type: application/json" -d '{"referrer":null}'

echo "==> Deleting users (keeping $KEEP_CSV)"
del users "id=not.in.($KEEP_CSV)"

echo "==> After:"; for t in "${TABLES[@]}"; do printf "    %-18s %s\n" "$t" "$(count "$t")"; done
echo "==> Done. Backup: $BACKUP"
