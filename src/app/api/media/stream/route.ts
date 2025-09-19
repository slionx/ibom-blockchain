import { NextRequest } from "next/server";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { findMetadataPda, fetchMetadata } from "@metaplex-foundation/mpl-token-metadata";

export const runtime = "nodejs";

function hmac(data: string, secret: string) {
  const crypto = require("node:crypto");
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

export async function GET(req: NextRequest) {
  try {
    const u = new URL(req.url);
    const mint = (u.searchParams.get("mint") || "").trim();
    const owner = (u.searchParams.get("owner") || "").trim();
    const token = (u.searchParams.get("token") || "").trim();
    const exp = Number(u.searchParams.get("exp") || 0);
    if (!mint || !owner || !token || !exp) return new Response("bad request", { status: 400 });
    if (Date.now() > exp) return new Response("link expired", { status: 403 });
    const secret = (process.env.MEDIA_SIGN_SECRET || "dev-secret").trim();
    const expect = hmac(`${mint}:${owner}:${exp}`, secret);
    if (expect !== token) return new Response("invalid token", { status: 403 });

    // Fetch on-chain metadata to locate the media URL
    const umi = createUmi(process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com");
    const pda = findMetadataPda(umi, { mint: mint as any });
    const md = await fetchMetadata(umi, pda);
    const uri: string = (md as any).uri || "";
    if (!uri) return new Response("metadata uri missing", { status: 500 });

    // Resolve JSON and pick a media URL (demo: use animation_url or first audio file)
    const metaRes = await fetch(uri);
    const meta = await metaRes.json().catch(() => null);
    let media = meta?.animation_url || "";
    if (!media && Array.isArray(meta?.properties?.files)) {
      const audio = meta.properties.files.find((f: any) => typeof f?.type === "string" && f.type.startsWith("audio/"));
      media = audio?.uri || "";
    }
    if (!media) return new Response("media not found in metadata", { status: 404 });

    // For demo: 302 redirect to the media URL. In production, proxy-stream with range support.
    return new Response(null, { status: 302, headers: { Location: media } });
  } catch (e: any) {
    return new Response(e?.message || String(e), { status: 500 });
  }
}

