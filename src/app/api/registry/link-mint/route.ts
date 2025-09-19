import { NextRequest } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { makeServerProvider, makeServerWallet, workPda } from "@/lib/solana/server";
import idl from "@/solana/idl/ibom_registry.json" assert { type: "json" };
import { Idl, Program } from "@coral-xyz/anchor";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const nftMint = new PublicKey(body?.nftMint);
    const collectionMint = body?.collectionMint ? new PublicKey(body.collectionMint) : null;
    const workIdHex: string | undefined = body?.workIdHex;
    if (!nftMint) throw new Error("nftMint is required");
    if (!workIdHex) throw new Error("workIdHex is required");
    if (!/^[0-9a-fA-F]{64}$/.test(workIdHex)) throw new Error("workIdHex must be 64-hex");
    const workId = new Uint8Array(workIdHex.match(/.{2}/g).map((h: string) => parseInt(h, 16)));

    const provider = await makeServerProvider();
    const programId = new PublicKey(process.env.REGISTRY_PROGRAM_ID || process.env.NEXT_PUBLIC_REGISTRY_PROGRAM_ID!);
    const idlWithAddr: any = { ...(idl as any), address: programId.toBase58() };
    const program = new Program(idlWithAddr as Idl, provider);
    const { wallet } = await makeServerWallet();
    const authority = wallet.publicKey;
    const work = workPda(program.programId, authority, Array.from(workId));

    const tx = await program.methods
      .linkMint(nftMint, collectionMint as any)
      .accounts({ authority, work })
      .rpc();

    return new Response(JSON.stringify({ ok: true, signature: tx, work: work.toBase58() }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
}

