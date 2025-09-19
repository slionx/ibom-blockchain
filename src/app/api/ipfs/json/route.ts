import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const token = (process.env.NFT_STORAGE_TOKEN || process.env.NEXT_PUBLIC_NFT_STORAGE_TOKEN || "").trim();
    if (!token || /ReplaceWith/i.test(token)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing NFT_STORAGE_TOKEN in .env.local" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }
    const body = await req.json();
    const metadata = body?.metadata;
    if (!metadata) {
      return new Response(JSON.stringify({ ok: false, error: "metadata is required" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    const jsonStr = typeof metadata === "string" ? metadata : JSON.stringify(metadata);
    const res = await fetch("https://api.nft.storage/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        // Sending JSON content as a file; nft.storage accepts octet-stream as well.
        "content-type": "application/json",
      },
      body: jsonStr,
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) {
      const msg = j?.error?.message || `nft.storage http ${res.status}`;
      return new Response(JSON.stringify({ ok: false, error: msg }), {
        status: res.status || 500,
        headers: { "content-type": "application/json" },
      });
    }
    const cid = j?.value?.cid || j?.cid;
    const ipfsUri = `ipfs://${cid}`;
    const gatewayUri = `https://ipfs.io/ipfs/${cid}`;
    return new Response(JSON.stringify({ ok: true, cid, ipfsUri, gatewayUri }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

