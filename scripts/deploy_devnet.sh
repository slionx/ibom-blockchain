#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")"/.. && pwd)
ONCHAIN_DIR="$ROOT_DIR/onchain"
PROGRAM_NAME="ibom_registry"
LIB_RS="$ONCHAIN_DIR/programs/$PROGRAM_NAME/src/lib.rs"
ANCHOR_TOML="$ONCHAIN_DIR/Anchor.toml"
ENV_EXAMPLE="$ROOT_DIR/.env.local.example"
ENV_LOCAL="$ROOT_DIR/.env.local"

log(){ echo "$@"; }
req(){ if ! command -v "$1" >/dev/null 2>&1; then echo "Missing $1. Please install."; exit 1; fi }

log "[1/9] Checking CLIs..."
req solana
req anchor

log "[2/9] Using devnet..."
solana config set --url devnet >/dev/null
solana config get | sed -n '1,4p' || true

if [ ! -f "$HOME/.config/solana/id.json" ]; then
  log "[3/9] Generating default keypair..."
  solana-keygen new --no-bip39-passphrase --force >/dev/null
fi

log "[4/9] Airdropping 2 SOL (devnet) ..."
solana airdrop 2 >/dev/null || true
solana balance || true

log "[5/9] Preparing program keypair and Program ID..."
cd "$ONCHAIN_DIR"
mkdir -p "$ONCHAIN_DIR/target/deploy"
KEYPAIR_PATH="$ONCHAIN_DIR/target/deploy/${PROGRAM_NAME}-keypair.json"
if [ ! -f "$KEYPAIR_PATH" ]; then
  solana-keygen new --no-bip39-passphrase --force -o "$KEYPAIR_PATH" >/dev/null
fi
PROGRAM_ID=$(solana address -k "$KEYPAIR_PATH")
log "Program ID derived: $PROGRAM_ID"

log "[6/9] Updating declare_id and Anchor.toml (devnet)..."
# Update declare_id! line
tmp_lib="${LIB_RS}.tmp"
awk -v pid="$PROGRAM_ID" '
  { if ($0 ~ /^declare_id!\("/) { print "declare_id!(\"" pid "\");" } else { print } }
' "$LIB_RS" > "$tmp_lib" && mv "$tmp_lib" "$LIB_RS"

# Remove existing [programs.devnet] section (BSD awk safe)
tmp_toml="${ANCHOR_TOML}.tmp"
awk '
  BEGIN{insec=0}
  /^\[programs\.devnet\]/{insec=1; next}
  /^\[/{ if(insec){insec=0} }
  { if(!insec) print }
' "$ANCHOR_TOML" > "$tmp_toml" && mv "$tmp_toml" "$ANCHOR_TOML"

# Append new [programs.devnet]
{
  echo ""
  echo "[programs.devnet]"
  echo "${PROGRAM_NAME} = \"${PROGRAM_ID}\""
} >> "$ANCHOR_TOML"

log "[7/9] Building program..."
anchor build

log "[8/9] Deploying to devnet..."
anchor deploy --provider.cluster devnet

log "[9/9] Updating env files..."
update_env_var() {
  file="$1"; key="$2"; value="$3"
  if [ -f "$file" ]; then
    if grep -q "^$key=" "$file"; then
      sed -E -i '' "s|^$key=.*|$key=$value|g" "$file" 2>/dev/null || sed -E -i "s|^$key=.*|$key=$value|g" "$file"
    else
      printf "\n%s=%s\n" "$key" "$value" >> "$file"
    fi
  fi
}
update_env_var "$ENV_EXAMPLE" REGISTRY_PROGRAM_ID "$PROGRAM_ID"
update_env_var "$ENV_EXAMPLE" NEXT_PUBLIC_REGISTRY_PROGRAM_ID "$PROGRAM_ID"
[ -f "$ENV_LOCAL" ] && update_env_var "$ENV_LOCAL" REGISTRY_PROGRAM_ID "$PROGRAM_ID"
[ -f "$ENV_LOCAL" ] && update_env_var "$ENV_LOCAL" NEXT_PUBLIC_REGISTRY_PROGRAM_ID "$PROGRAM_ID"

echo
echo "✅ Deployed to devnet: $PROGRAM_ID"
echo "   Updated: $LIB_RS, $ANCHOR_TOML, $ENV_EXAMPLE (and $ENV_LOCAL if present)"
