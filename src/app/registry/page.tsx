"use client";
import React, { useCallback, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import idl from "@/solana/idl/ibom_registry.json";
import { makeProgram } from "@/lib/solana/provider";

function randomBytes32(): number[] {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return Array.from(a);
}

export default function RegistryPage() {
  const wallet = useWallet();
  const [logs, setLogs] = useState<string[]>([]);
  const [metadataUri, setMetadataUri] = useState("ipfs://demo.work.json");
  const [workIdHex, setWorkIdHex] = useState<string>("");
  const [fingerHex, setFingerHex] = useState<string>("");

  const log = useCallback((m: string) => setLogs((prev) => [m, ...prev].slice(0, 200)), []);

  const onRegister = useCallback(async () => {
    try {
      if (!wallet.publicKey || !wallet.signTransaction) throw new Error("请先连接钱包");
      const program = makeProgram(idl as any, wallet as any);
      const workId = workIdHex && workIdHex.length === 64 ? Array.from(Buffer.from(workIdHex, "hex")) : randomBytes32();
      const fingerprint = fingerHex && fingerHex.length === 64 ? Array.from(Buffer.from(fingerHex, "hex")) : randomBytes32();
      const [pda] = PublicKey.findProgramAddressSync([
        Buffer.from("work"),
        wallet.publicKey.toBuffer(),
        Buffer.from(Uint8Array.from(workId)),
      ], program.programId);

      log("发送交易中…");
      const sig = await program.methods
        .registerWork(workId as any, metadataUri, fingerprint as any, [{ pubkey: wallet.publicKey, share: 10000 }] as any)
        .accounts({ authority: wallet.publicKey, work: pda, systemProgram: SystemProgram.programId })
        .rpc();
      log(`成功: ${sig}`);
      log(`PDA: ${pda.toBase58()}`);
    } catch (e: any) {
      log(`失败: ${e.message || e}`);
    }
  }, [wallet, metadataUri, workIdHex, fingerHex, log]);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold">版权登记（Registry）测试</h1>
      <p className="text-sm text-gray-500">程序: {process.env.NEXT_PUBLIC_REGISTRY_PROGRAM_ID}</p>

      <div className="grid grid-cols-1 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-500">metadataUri</span>
          <input className="border rounded px-3 py-2" value={metadataUri} onChange={(e) => setMetadataUri(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-500">workIdHex（64位，可留空随机）</span>
          <input className="border rounded px-3 py-2" value={workIdHex} onChange={(e) => setWorkIdHex(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-500">fingerprintHex（64位，可留空随机）</span>
          <input className="border rounded px-3 py-2" value={fingerHex} onChange={(e) => setFingerHex(e.target.value)} />
        </label>
      </div>

      <div>
        <button className="px-4 py-2 rounded bg-black text-white disabled:opacity-50" onClick={onRegister} disabled={!wallet.connected}>发起登记</button>
      </div>

      <div>
        <h2 className="font-medium mb-2">输出</h2>
        <pre className="text-xs bg-gray-100 p-3 rounded whitespace-pre-wrap break-all min-h-[120px]">{logs.join("\n")}</pre>
      </div>
    </div>
  );
}

