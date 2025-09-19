"use client";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

export default function PlayerPage() {
  const wallet = useWallet();
  const [mint, setMint] = useState("");
  const [acceptCollection, setAcceptCollection] = useState(true);
  const [message, setMessage] = useState("");
  const [signedUrl, setSignedUrl] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const log = useCallback((m: string) => setLogs((prev) => [m, ...prev].slice(0, 200)), []);

  const buildMessage = useCallback((mintAddr: string) => {
    const ts = Date.now();
    return `IBOM_MEDIA_SIGN|mint=${mintAddr}|ts=${ts}`;
  }, []);

  const onSignAndPlay = useCallback(async () => {
    try {
      if (!mint) throw new Error("请填写歌曲 Mint 地址");
      if (!wallet.publicKey) throw new Error("请先连接钱包");
      if (!wallet.signMessage) throw new Error("当前钱包不支持 SignMessage，请在钱包设置中启用或更换钱包");

      setLoading(true);
      setSignedUrl("");
      const msg = buildMessage(mint);
      setMessage(msg);
      const msgBytes = new TextEncoder().encode(msg);
      const sigBytes = await wallet.signMessage!(msgBytes);
      const sigB64 = Buffer.from(sigBytes).toString("base64");

      const url = `/api/media/sign?mint=${encodeURIComponent(mint)}&acceptCollection=${acceptCollection ? "1" : "0"}`;
      const res = await fetch(url, {
        headers: {
          "x-wallet": wallet.publicKey.toBase58(),
          "x-message": msg,
          "x-signature": sigB64,
        },
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);

      const urlSigned = j.signedUrl as string;
      setSignedUrl(urlSigned);
      log(`已获取签名链接（${new Date(j.exp).toLocaleTimeString()} 过期）`);
      if (audioRef.current) {
        audioRef.current.src = urlSigned;
        await audioRef.current.play().catch(() => {});
      }
    } catch (e: any) {
      log(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [mint, wallet, acceptCollection, buildMessage, log]);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">签名播放（持有者鉴权）</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-sm text-gray-500">歌曲 Mint</span>
          <input className="border rounded px-3 py-2" value={mint} onChange={(e) => setMint(e.target.value)} placeholder="填写歌曲 Mint 地址" />
        </label>
        <div className="flex flex-col gap-2 md:col-span-1">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={acceptCollection} onChange={(e) => setAcceptCollection(e.target.checked)} />
            <span className="text-sm text-gray-700">允许合集持有放行</span>
          </label>
          <button className="px-4 py-2 rounded bg-indigo-600 text-white disabled:opacity-50" disabled={!wallet.connected || loading || !mint} onClick={onSignAndPlay}>
            {loading ? "鉴权中…" : "签名并播放"}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs text-gray-600">消息（仅用于签名，含过期时间）：</div>
        <pre className="text-xs bg-gray-100 p-3 rounded whitespace-pre-wrap break-all min-h-[60px]">{message || "点击“签名并播放”自动生成"}</pre>
      </div>

      <div className="space-y-2">
        <div className="text-xs text-gray-600">签名 URL（短时有效）：</div>
        <pre className="text-xs bg-gray-100 p-3 rounded whitespace-pre-wrap break-all min-h-[60px]">{signedUrl}</pre>
        <audio ref={audioRef} controls className="w-full" />
      </div>

      <div className="mt-6">
        <h2 className="font-medium mb-2">输出</h2>
        <pre className="text-xs bg-gray-100 p-3 rounded whitespace-pre-wrap break-all min-h-[120px]">{logs.join("\n")}</pre>
      </div>
    </div>
  );
}

