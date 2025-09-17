import { NextRequest } from "next/server";
import { makeRegistryProgram, parseBytes32, parseCreators, creatorsShareSumOk, workPda, makeServerWallet } from "@/lib/solana/server";

export const runtime = "nodejs";

function requireApiKey(req: NextRequest) {
  const expected = process.env.REGISTRY_API_KEY;
  if (!expected) return; // no auth enforced if not set
  const got = req.headers.get("x-ibom-api-key");
  if (!got || got !== expected) {
    throw new Error("Unauthorized: invalid API key");
  }
}

export async function POST(req: NextRequest) {
  try {
    requireApiKey(req);
    const body = await req.json();
    const metadataUri: string = body?.metadataUri;
    if (!metadataUri || typeof metadataUri !== "string") throw new Error("metadataUri is required");
    const workId = parseBytes32(body?.workIdHex ?? body?.workIdBase64 ?? body?.workId, "workId");
    const fingerprintHash = parseBytes32(
      body?.fingerprintHashHex ?? body?.fingerprintHashBase64 ?? body?.fingerprintHash,
      "fingerprintHash"
    );
    const creators = parseCreators(body?.creators);
    if (!creatorsShareSumOk(creators)) throw new Error("sum(creators.share) must equal 10000");

    const { program } = await makeRegistryProgram();
    const { wallet } = await makeServerWallet();
    const authority = wallet.publicKey;
    const pda = workPda(program.programId, authority, workId);

    const txSig = await program.methods
      .updateWork(metadataUri, fingerprintHash as any, creators as any)
      .accounts({ authority, work: pda })
      .rpc();

    return new Response(
      JSON.stringify({ ok: true, signature: txSig, work: pda.toBase58(), authority: authority.toBase58() }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (e: any) {
    const msg = e?.message || String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: msg?.startsWith("Unauthorized") ? 401 : 400,
      headers: { "content-type": "application/json" },
    });
  }
}

