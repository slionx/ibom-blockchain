# ibom-blockchain On-chain Programs (Anchor)

This workspace contains the Anchor program for the copyright registry.

- Program: `ibom_registry`
- Anchor config: `onchain/Anchor.toml`
- Source: `onchain/programs/ibom_registry/src/lib.rs`

Quick start (localnet):

```bash
cd onchain
solana-test-validator -r # in a separate terminal
anchor build
anchor deploy            # note the Program ID
```

Update Program ID in `onchain/Anchor.toml` and in the frontend `.env.local`:

```
NEXT_PUBLIC_REGISTRY_PROGRAM_ID=<Deployed Program ID>
```

Devnet one-liner (after installing Solana + Anchor):

```bash
./scripts/deploy_devnet.sh
# This will:
# - ensure devnet config and airdrop
# - build program, derive PROGRAM_ID
# - update declare_id! and [programs.devnet]
# - deploy to devnet
# - write PROGRAM_ID to .env.local(.example)
```
