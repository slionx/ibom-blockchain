"use client";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import type { WalletContextState } from "@solana/wallet-adapter-react";

export function makeUmi(wallet: WalletContextState) {
  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const umi = createUmi(rpc).use(mplTokenMetadata());
  if (!wallet?.publicKey || !wallet.signTransaction) return umi; // readonly umi
  return umi.use(walletAdapterIdentity(wallet as any));
}

