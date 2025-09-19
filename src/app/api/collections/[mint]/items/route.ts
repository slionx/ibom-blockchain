import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { mint: string } }) {
  try {
    const collectionMint = params?.mint;
    if (!collectionMint) return new Response(JSON.stringify({ ok: false, error: "missing collection mint" }), { status: 400 });
    const apiKeyRaw = process.env.HELIUS_API_KEY || process.env.NEXT_PUBLIC_HELIUS_API_KEY;
    if (!apiKeyRaw) return new Response(JSON.stringify({ ok: false, error: "missing HELIUS_API_KEY" }), { status: 400 });
    const apiKey = apiKeyRaw.replace(/ReplaceWithHeliusApiKey/i, "").trim();
    if (!apiKey) return new Response(JSON.stringify({ ok: false, error: "invalid HELIUS_API_KEY (placeholder not replaced)" }), { status: 400 });

    const endpoint = (process.env.HELIUS_DEVNET === "1" || (process.env.SOLANA_RPC_URL || "").includes("devnet"))
      ? `https://devnet.helius-rpc.com/?api-key=${apiKey}`
      : `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;

    const body = {
      jsonrpc: "2.0",
      id: "ibom-collection-items",
      method: "getAssetsByGroup",
      params: {
        groupKey: "collection",
        groupValue: collectionMint,
        page: 1,
        limit: 1000,
        sortBy: { sortBy: "created", sortDirection: "asc" },
      },
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      if (res.status === 401) {
        return new Response(
          JSON.stringify({ ok: false, error: "Helius 401 Unauthorized: invalid API key. Set HELIUS_API_KEY in .env.local" }),
          { status: 401, headers: { "content-type": "application/json" } }
        );
      }
      throw new Error(`Helius http ${res.status}`);
    }
    const json = await res.json();
    const items = (json?.result?.items || []).map((it: any) => {
      const coll = it?.content?.metadata?.collection;
      const verified = !!(coll && coll.key === collectionMint && coll.verified === true);
      return {
        id: it?.id,
        mint: it?.id,
        name: it?.content?.metadata?.name,
        symbol: it?.content?.metadata?.symbol,
        verified,
        updateAuthority: it?.authority,
        creators: it?.content?.metadata?.creators || [],
        metadataUri: it?.content?.json_uri,
      };
    });

    return new Response(JSON.stringify({ ok: true, count: items.length, items }), {
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
