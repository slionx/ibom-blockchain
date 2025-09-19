"use client";
import React, { useCallback, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import idl from "@/solana/idl/ibom_splitter.json" assert { type: "json" };

function makeProvider(wallet: any) {
  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const commitment = (process.env.NEXT_PUBLIC_SOLANA_COMMITMENT as any) || "confirmed";
  const conn = new Connection(rpc, commitment);
  return new AnchorProvider(conn, wallet, { commitment });
}

export default function SplitterDemo() {
  const wallet = useWallet();
  const provider = useMemo(() => (wallet ? makeProvider(wallet as any) : null), [wallet]);
  const program = useMemo(() => {
    if (!provider) return null;
    const programIdStr = process.env.NEXT_PUBLIC_SPLITTER_PROGRAM_ID || "E11111111111111111111111111111111111111111";
    const programId = new PublicKey(programIdStr);
    const idlWithAddr: any = { ...(idl as any), address: programId.toBase58() };
    return new Program(idlWithAddr as Idl, provider);
  }, [provider]);

  const [work, setWork] = useState("");
  const [pool, setPool] = useState("");
  const [members, setMembers] = useState<Array<{ address: string; bp: number }>>([]);
  const [amountSol, setAmountSol] = useState<string>("0.1");
  const [logs, setLogs] = useState<string[]>([]);
  const log = useCallback((m: string) => setLogs((prev) => [m, ...prev].slice(0, 200)), []);

  const onDerivePool = useCallback(() => {
    try {
      if (!wallet.publicKey) throw new Error("请先连接钱包");
      if (!work) throw new Error("请填写 registry Work 地址");
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), wallet.publicKey.toBuffer(), new PublicKey(work).toBuffer()],
        new PublicKey(process.env.NEXT_PUBLIC_SPLITTER_PROGRAM_ID || "E11111111111111111111111111111111111111111")
      );
      setPool(pda.toBase58());
      log(`Pool PDA: ${pda.toBase58()}`);
    } catch (e: any) {
      log(e?.message || String(e));
    }
  }, [wallet, work, log]);

  const onInitPool = useCallback(async () => {
    try {
      if (!program || !wallet.publicKey) throw new Error("请先连接钱包");
      const registryWork = new PublicKey(work);
      const shares = members.map((m) => ({ pubkey: new PublicKey(m.address), bp: Number(m.bp) }));
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), wallet.publicKey.toBuffer(), registryWork.toBuffer()], program.programId
      );
      await program.methods
        .initPool(registryWork, null, shares as any)
        .accounts({ authority: wallet.publicKey, pool: pda, systemProgram: PublicKey.default })
        .rpc();
      setPool(pda.toBase58());
      log(`init_pool 成功: ${pda.toBase58()}`);
    } catch (e: any) {
      log(e?.message || String(e));
    }
  }, [program, wallet, work, members, log]);

  const onFundSol = useCallback(async () => {
    try {
      if (!program || !wallet.publicKey) throw new Error("请先连接钱包");
      const p = new PublicKey(pool);
      const lamports = BigInt(Math.floor((Number(amountSol) || 0) * 1e9));
      await program.methods
        .fundSol(lamports as any)
        .accounts({ payer: wallet.publicKey, pool: p, systemProgram: PublicKey.default })
        .rpc();
      log(`fund_sol 成功: ${amountSol} SOL`);
    } catch (e: any) {
      log(e?.message || String(e));
    }
  }, [program, wallet, pool, amountSol, log]);

  const onClaimSol = useCallback(async () => {
    try {
      if (!program || !wallet.publicKey) throw new Error("请先连接钱包");
      const p = new PublicKey(pool);
      await program.methods
        .claimSol()
        .accounts({ member: wallet.publicKey, pool: p, systemProgram: PublicKey.default })
        .rpc();
      log(`claim_sol 成功`);
    } catch (e: any) {
      log(e?.message || String(e));
    }
  }, [program, wallet, pool, log]);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">分账池演示（SOL）</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-500">Registry Work 地址</span>
          <input className="border rounded px-3 py-2" value={work} onChange={(e) => setWork(e.target.value)} placeholder="填写 Work PDA" />
        </label>
        <div className="flex items-end gap-2">
          <button className="px-3 py-2 rounded bg-gray-200" onClick={onDerivePool}>推导 Pool PDA</button>
          <input className="border rounded px-3 py-2 flex-1" value={pool} onChange={(e) => setPool(e.target.value)} placeholder="Pool PDA" />
        </div>
      </div>

      <div className="border rounded p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-medium text-sm">成员份额（bp，总和=10000）</div>
          <button className="px-2 py-1 text-xs rounded bg-gray-100" onClick={() => setMembers((prev) => [...prev, { address: wallet.publicKey?.toBase58() || "", bp: prev.length ? 0 : 10000 }])}>添加成员</button>
        </div>
        {members.map((m, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-end">
            <input className="border rounded px-3 py-2 col-span-8" value={m.address} onChange={(e) => setMembers((prev) => prev.map((x, idx) => (idx === i ? { ...x, address: e.target.value } : x)))} placeholder="成员地址" />
            <input className="border rounded px-3 py-2 col-span-3" type="number" value={m.bp} onChange={(e) => setMembers((prev) => prev.map((x, idx) => (idx === i ? { ...x, bp: Number(e.target.value || 0) } : x)))} placeholder="bp" />
            <button className="col-span-1 text-xs px-2 py-2 rounded bg-red-50 text-red-600" onClick={() => setMembers((prev) => prev.filter((_, idx) => idx !== i))}>删</button>
          </div>
        ))}
        <div className="text-xs text-gray-600">当前总和：{members.reduce((a, b) => a + (Number(b.bp) || 0), 0)} / 10000</div>
        <button className="px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-50" onClick={onInitPool} disabled={!wallet.connected || !work}>初始化池</button>
      </div>

      <div className="border rounded p-3 space-y-2">
        <div className="font-medium text-sm">资金操作（SOL）</div>
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-500">充值金额（SOL）</span>
            <input className="border rounded px-3 py-2" value={amountSol} onChange={(e) => setAmountSol(e.target.value)} />
          </label>
          <button className="px-3 py-2 rounded bg-indigo-600 text-white disabled:opacity-50" onClick={onFundSol} disabled={!wallet.connected || !pool}>充值</button>
          <button className="px-3 py-2 rounded bg-gray-800 text-white disabled:opacity-50" onClick={onClaimSol} disabled={!wallet.connected || !pool}>领取</button>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="font-medium mb-2">输出</h2>
        <pre className="text-xs bg-gray-100 p-3 rounded whitespace-pre-wrap break-all min-h-[120px]">{logs.join("\n")}</pre>
      </div>
    </div>
  );
}

