"use client";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import React from "react";

export default function ConnectWallet() {
  return (
    <div className="flex items-center justify-center">
      <WalletMultiButton />
    </div>
  );
}

