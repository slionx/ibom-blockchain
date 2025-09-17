#!/usr/bin/env bash
# ./scripts/fund_target_from_airdrops.sh 7ujphKCdLzS8MHmwvYjb2xpr4dbhGTsQmPu7NyfLB78m 3 1.9
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <TARGET_PUBKEY> [COUNT=3] [AMOUNT_PER_TRANSFER=1.9]"
  exit 1
fi

TARGET="$1"
COUNT="${2:-3}"
AMOUNT="${3:-1.9}"
RPC_URL="${SOLANA_URL:-https://api.devnet.solana.com}"

echo "Target: $TARGET"
echo "Accounts to create: $COUNT; Amount per transfer: $AMOUNT; RPC: $RPC_URL"

WORKDIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")"/.. && pwd)/onchain/tmp-airdrops"
mkdir -p "$WORKDIR"

try_airdrop() {
  local addr="$1"
  local tries=6
  local i=1
  while [ $i -le $tries ]; do
    echo "Airdrop 2 SOL to $addr (attempt $i/$tries)"
    if solana airdrop 2 "$addr" --url "$RPC_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
    i=$((i+1))
  done
  echo "Airdrop failed for $addr after $tries attempts"
  return 1
}

for i in $(seq 1 "$COUNT"); do
  KEYPAIR="$WORKDIR/air$i.json"
  echo "\n[Account $i] Generating keypair at $KEYPAIR"
  solana-keygen new --no-bip39-passphrase --force -o "$KEYPAIR" >/dev/null
  PUB=$(solana address -k "$KEYPAIR" --url "$RPC_URL")
  echo "Pubkey: $PUB"
  try_airdrop "$PUB" || true
  echo -n "Balance after airdrop: "
  solana balance "$PUB" --url "$RPC_URL" || true
  echo "Transferring $AMOUNT SOL to $TARGET from $PUB"
  solana transfer "$TARGET" "$AMOUNT" --from "$KEYPAIR" --allow-unfunded-recipient --url "$RPC_URL" || true
  echo -n "Source balance now: "
  solana balance "$PUB" --url "$RPC_URL" || true
done

echo -n "\nFinal target balance: "
solana balance "$TARGET" --url "$RPC_URL" || true

