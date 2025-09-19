import { NextRequest } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { findMetadataPda, fetchMetadata } from "@metaplex-foundation/mpl-token-metadata";

export const runtime = "nodejs";

function conn() {
  const rpc = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
  return new Connection(rpc, (process.env.SOLANA_COMMITMENT as any) || "confirmed");
}

function nowMs() { return Date.now(); }

function hmac(data: string, secret: string) {
  const crypto = require("node:crypto");
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

async function verifyMintOwnership(owner: PublicKey, mint: PublicKey) {
  const c = conn();
  const r = await c.getParsedTokenAccountsByOwner(owner, { mint });
  const ok = r.value.some((acc) => {
    const info: any = acc.account.data;
    const amt = Number(info?.parsed?.info?.tokenAmount?.amount || 0);
    return amt > 0;
  });
  return ok;
}

async function readCollectionMintOf(mint: PublicKey) {
  try {
    const umi = createUmi(process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com");
    const pda = findMetadataPda(umi, { mint: mint as any });
    const md = await fetchMetadata(umi, pda);
    const coll: any = (md as any).collection;
    if (!coll || coll.__option !== "Some") return { key: null, verified: false };
    const v = coll.value;
    return { key: v?.key?.toString?.() || String(v?.key || ""), verified: !!v?.verified };
  } catch { return { key: null, verified: false }; }
}

async function ownerHasVerifiedInCollection(owner: string, collectionMint: string) {
  const apiKey = process.env.HELIUS_API_KEY || process.env.NEXT_PUBLIC_HELIUS_API_KEY;
  if (!apiKey) return false;
  const endpoint = (process.env.HELIUS_DEVNET === "1" || (process.env.SOLANA_RPC_URL || "").includes("devnet"))
    ? `https://devnet.helius-rpc.com/?api-key=${apiKey}`
    : `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
  const body = {
    jsonrpc: "2.0",
    id: "ibom-owner-assets",
    method: "getAssetsByOwner",
    params: {
      ownerAddress: owner,
      page: 1,
      limit: 1000,
    },
  };
  const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) return false;
  const j = await res.json();
  const items: any[] = j?.result?.items || [];
  return items.some((it) => (it?.content?.metadata?.collection?.key === collectionMint) && it?.content?.metadata?.collection?.verified === true);
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const mintStr = url.searchParams.get("mint");
    if (!mintStr) return new Response(JSON.stringify({ ok: false, error: "missing mint" }), { status: 400 });
    const acceptCollection = url.searchParams.get("acceptCollection") === "1";

    const walletStr = (req.headers.get("x-wallet") || url.searchParams.get("wallet") || "").trim();
    const sigStr = (req.headers.get("x-signature") || url.searchParams.get("sig") || "").trim();
    const msg = (req.headers.get("x-message") || url.searchParams.get("msg") || "").trim();
    if (!walletStr || !sigStr || !msg) return new Response(JSON.stringify({ ok: false, error: "missing wallet/sig/msg" }), { status: 400 });

    // verify message pattern and ttl
    const ttlMs = Number(process.env.MEDIA_SIGN_TTL_MS || 120000);
    // expect: IBOM_MEDIA_SIGN|mint=<mint>|ts=<epoch_ms>
    if (!msg.includes(`mint=${mintStr}`) || !msg.includes("IBOM_MEDIA_SIGN")) {
      return new Response(JSON.stringify({ ok: false, error: "invalid message content" }), { status: 400 });
    }
    const tsMatch = /ts=(\d+)/.exec(msg);
    const ts = tsMatch ? Number(tsMatch[1]) : 0;
    if (!ts || nowMs() - ts > ttlMs) return new Response(JSON.stringify({ ok: false, error: "message expired" }), { status: 400 });

    // verify signature
    const pk = new PublicKey(walletStr);
    const msgBytes = new TextEncoder().encode(msg);
    let sigBytes: Uint8Array;
    try { sigBytes = Buffer.from(sigStr, "base64"); } catch { try { sigBytes = bs58.decode(sigStr); } catch { return new Response(JSON.stringify({ ok: false, error: "invalid signature encoding" }), { status: 400 }); } }
    const ok = nacl.sign.detached.verify(msgBytes, sigBytes, pk.toBytes());
    if (!ok) return new Response(JSON.stringify({ ok: false, error: "signature verify failed" }), { status: 401 });

    // ownership check
    const ownerPk = pk;
    const mintPk = new PublicKey(mintStr);
    let authorized = await verifyMintOwnership(ownerPk, mintPk);
    let collectionKey: string | null = null;
    if (!authorized && acceptCollection) {
      const coll = await readCollectionMintOf(mintPk);
      collectionKey = coll.key;
      if (coll.key && coll.verified) {
        authorized = await ownerHasVerifiedInCollection(ownerPk.toBase58(), coll.key);
      }
    }
    if (!authorized) return new Response(JSON.stringify({ ok: false, error: "not a holder" }), { status: 403 });

    // Make signed URL (pseudo): /api/media/stream?mint=&owner=&exp=&token=
    const expMs = nowMs() + Number(process.env.MEDIA_STREAM_TTL_MS || 60000);
    const secret = (process.env.MEDIA_SIGN_SECRET || "dev-secret").trim();
    const token = hmac(`${mintStr}:${ownerPk.toBase58()}:${expMs}`, secret);
    const signedUrl = `${url.origin}/api/media/stream?mint=${mintStr}&owner=${ownerPk.toBase58()}&exp=${expMs}&token=${token}`;

    return new Response(JSON.stringify({ ok: true, signedUrl, exp: expMs, scope: authorized ? (collectionKey ? "collection" : "mint") : "" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), { status: 500, headers: { "content-type": "application/json" } });
  }
}

