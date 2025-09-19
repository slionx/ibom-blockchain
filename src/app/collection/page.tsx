"use client";
import React, { useCallback, useState } from "react";

export default function CollectionItemsPage() {
  const [mint, setMint] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<any[]>([]);

  const onFetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setItems([]);
      const res = await fetch(`/api/collections/${mint}/items`);
      const j = await res.json();
      if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setItems(j.items || []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [mint]);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">查看合集作品</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-sm text-gray-500">Collection Mint</span>
          <input className="border rounded px-3 py-2" value={mint} onChange={(e) => setMint(e.target.value)} placeholder="填写合集 Mint 地址" />
        </label>
        <button className="px-4 py-2 rounded bg-indigo-600 text-white disabled:opacity-50" onClick={onFetch} disabled={!mint || loading}>
          {loading ? "查询中…" : "查询"}
        </button>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <div className="border rounded">
        <div className="flex justify-between items-center px-3 py-2 text-xs text-gray-600">
          <span>共 {items.length} 条</span>
        </div>
        <div className="divide-y">
          {items.map((it) => (
            <div key={it.mint} className="px-3 py-2 text-sm flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="font-mono break-all">{it.mint}</span>
                {it.verified ? <span className="text-green-600 text-xs">verified</span> : <span className="text-gray-500 text-xs">unverified</span>}
              </div>
              <div className="text-gray-600">{it.name || "(no name)"} {it.symbol ? `· ${it.symbol}` : ""}</div>
              {it.metadataUri ? (
                <a className="text-xs text-blue-600" href={it.metadataUri} target="_blank" rel="noreferrer">
                  {it.metadataUri}
                </a>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

