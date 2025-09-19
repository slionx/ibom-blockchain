"use client";
import React, { useCallback, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { publicKey as toPk, generateSigner, percentAmount, some } from "@metaplex-foundation/umi";
import { createNft, findMetadataPda, findMasterEditionPda, collectionDetails, verifyCollectionV1, setAndVerifyCollection, safeFetchMetadata, createMasterEditionV3, safeFetchMasterEdition } from "@metaplex-foundation/mpl-token-metadata";
import { fetchMetadata as fetchMdAccount } from "@metaplex-foundation/mpl-token-metadata/dist/src/generated/accounts/metadata";
import { verifySizedCollectionItem } from "@metaplex-foundation/mpl-token-metadata/dist/src/generated/instructions/verifySizedCollectionItem";
import { setAndVerifySizedCollectionItem } from "@metaplex-foundation/mpl-token-metadata/dist/src/generated/instructions/setAndVerifySizedCollectionItem";
import { fetchMetadata } from "@metaplex-foundation/mpl-token-metadata/dist/src/generated/accounts/metadata";
// sized 集合相关验证指令
import { makeUmi } from "@/lib/metaplex/umi";

export default function NftPage() {
  const wallet = useWallet();
  const umi = useMemo(() => makeUmi(wallet), [wallet]);
  const [logs, setLogs] = useState<string[]>([]);
  const [collectionMint, setCollectionMint] = useState<string>(process.env.NEXT_PUBLIC_SONGS_COLLECTION_MINT || "");
  const [name, setName] = useState<string>("Song NFT");
  const [symbol, setSymbol] = useState<string>("SONG");
  const [uri, setUri] = useState<string>("https://example.com/song.json");
  const [royalty, setRoyalty] = useState<number>(5); // 5%
  // Creators 分润（总和=100）
  const [creators, setCreators] = useState<Array<{ address: string; share: number }>>([]);
  const [autoRegister, setAutoRegister] = useState<boolean>(true);
  // 元数据构建器字段
  const [artist, setArtist] = useState<string>("");
  const [album, setAlbum] = useState<string>("");
  const [trackNo, setTrackNo] = useState<string>("");
  const [discNo, setDiscNo] = useState<string>("");
  const [genre, setGenre] = useState<string>("Pop");
  const [year, setYear] = useState<string>(new Date().getFullYear().toString());
  const [duration, setDuration] = useState<string>("03:30");
  const [bpm, setBpm] = useState<string>("120");
  const [musicalKey, setMusicalKey] = useState<string>("C Major");
  const [isrc, setIsrc] = useState<string>("");
  const [explicit, setExplicit] = useState<boolean>(false);
  const [language, setLanguage] = useState<string>("en");
  const [externalUrl, setExternalUrl] = useState<string>("");
  const [coverUrl, setCoverUrl] = useState<string>("https://example.com/cover.png");
  const [audioUrl, setAudioUrl] = useState<string>("https://example.com/audio.mp3");
  const [metaPreview, setMetaPreview] = useState<string>("");
  const [builderOpen, setBuilderOpen] = useState<boolean>(false);
  // 移除手动验证方式，仅保留智能验证
  const [lastSongMint, setLastSongMint] = useState<string>("");
  const [readyState, setReadyState] = useState<{ songMd: boolean; collMd: boolean; collMe: boolean; sized: boolean; checking: boolean; songMdPda?: string; collMdPda?: string; collMePda?: string }>({ songMd: false, collMd: false, collMe: false, sized: false, checking: false });
  const [verifying, setVerifying] = useState<boolean>(false);

  // 轮询参数（可通过环境变量调整）
  const MAX_POLLS = useMemo(() => {
    const n = Number(process.env.NEXT_PUBLIC_VERIFY_MAX_POLLS || 60);
    return Number.isFinite(n) && n > 0 ? n : 60;
  }, []);
  const POLL_INTERVAL_MS = useMemo(() => {
    const n = Number(process.env.NEXT_PUBLIC_VERIFY_POLL_INTERVAL_MS || 1000);
    return Number.isFinite(n) && n > 0 ? n : 1000;
  }, []);

  const log = useCallback((m: string) => setLogs((prev) => [m, ...prev].slice(0, 200)), []);

  function errToString(e: any) {
    if (e?.message) return e.message;
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }

  // shares helpers & hashing
  function sharesSum100(list: Array<{ share: number }>) {
    const sum = list.reduce((a, b) => a + (Number(b.share) || 0), 0);
    return sum === 100;
  }
  function normalizeCreators(list: Array<{ address: string; share: number }>) {
    return (list || []).map((c) => ({ address: (c.address || "").trim(), share: Number(c.share) || 0 }));
  }
  async function sha256Hex(input: string) {
    const enc = new TextEncoder();
    const data = enc.encode(input);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function buildMetadata() {
    const attrs: any[] = [];
    if (artist) attrs.push({ trait_type: "Artist", value: artist });
    if (album) attrs.push({ trait_type: "Album", value: album });
    if (trackNo) attrs.push({ trait_type: "Track #", value: trackNo });
    if (discNo) attrs.push({ trait_type: "Disc #", value: discNo });
    if (genre) attrs.push({ trait_type: "Genre", value: genre });
    if (year) attrs.push({ trait_type: "Year", value: year });
    if (duration) attrs.push({ trait_type: "Duration", value: duration });
    if (bpm) attrs.push({ trait_type: "BPM", value: bpm });
    if (musicalKey) attrs.push({ trait_type: "Key", value: musicalKey });
    if (isrc) attrs.push({ trait_type: "ISRC", value: isrc });
    attrs.push({ trait_type: "Explicit", value: explicit ? "Yes" : "No" });
    if (language) attrs.push({ trait_type: "Language", value: language });

    const meta: any = {
      name,
      symbol,
      description: album ? `A single from the album ${album}.` : "A great track.",
      image: coverUrl || undefined,
      animation_url: audioUrl || undefined,
      external_url: externalUrl || undefined,
      attributes: attrs,
      properties: {
        category: "audio",
        files: [
          ...(audioUrl ? [{ uri: audioUrl, type: "audio/mpeg" }] : []),
          ...(coverUrl ? [{ uri: coverUrl, type: "image/png" }] : []),
        ],
      },
    };
    return meta;
  }

  const onPreviewMetadata = useCallback(() => {
    try {
      const meta = buildMetadata();
      setMetaPreview(JSON.stringify(meta, null, 2));
      log("已生成元数据预览");
    } catch (e: any) {
      log(`生成预览失败: ${e?.message || e}`);
    }
  }, [name, symbol, artist, album, trackNo, discNo, genre, year, duration, bpm, musicalKey, isrc, explicit, language, externalUrl, coverUrl, audioUrl, log]);

  const onUploadMetadata = useCallback(async () => {
    try {
      const meta = buildMetadata();
      const res = await fetch("/api/ipfs/json", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ metadata: meta }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      const ipfsUri: string = j.ipfsUri || `ipfs://${j.cid}`;
      setUri(ipfsUri);
      log(`已上传到 IPFS: ${ipfsUri}`);
    } catch (e: any) {
      log(`上传失败: ${e?.message || e}`);
    }
  }, [name, symbol, artist, album, trackNo, discNo, genre, year, duration, bpm, musicalKey, isrc, explicit, language, externalUrl, coverUrl, audioUrl]);

  const onCreateCollection = useCallback(async () => {
    try {
      if (!wallet.publicKey) throw new Error("请先连接钱包");
      const mint = generateSigner(umi);
      log("创建集合中…");
      await createNft(umi, {
        mint,
        name: name || "Songs Collection",
        uri: uri || "https://example.com/collection.json",
        sellerFeeBasisPoints: percentAmount(royalty),
        symbol: symbol || "SONGS",
        isMutable: true,
        // 明确创建为 sized 集合（含 collectionDetails），便于使用 sized 验证指令
        isCollection: true as any,
        collectionDetails: collectionDetails("V1", { size: 0 }) as any,
        creators: wallet.publicKey ? [{ address: toPk(wallet.publicKey.toBase58()), verified: true, share: 100 }] : [],
      } as any).sendAndConfirm(umi);
      const mintPk = mint.publicKey.toString();
      setCollectionMint(mintPk);
      log(`集合创建成功: ${mintPk}`);
    } catch (e: any) {
      log(`集合创建失败: ${e.message || e}`);
    }
  }, [umi, wallet, name, uri, symbol, royalty, log]);

  const onMintSong = useCallback(async () => {
    try {
      if (!wallet.publicKey) throw new Error("请先连接钱包");
      if (!collectionMint) throw new Error("请先创建或填写 Collection Mint");
      const list = normalizeCreators(creators);
      if (!list.length) throw new Error("请至少添加一位分润成员");
      if (!sharesSum100(list)) throw new Error("Creators 分润总和需等于 100");
      if (!list.every((c) => c.address)) throw new Error("Creators 需填写 address");

      const mint = generateSigner(umi);
      log("铸造歌曲 NFT 中…");
      // 转换 creators 到 on-chain Metadata 结构
      const creatorsForOnchain = list.map((c) => ({
        address: toPk(c.address),
        verified: !!(wallet.publicKey && c.address === wallet.publicKey.toBase58()),
        share: Number(c.share),
      }));

      await createNft(umi, {
        mint,
        name,
        uri,
        sellerFeeBasisPoints: percentAmount(royalty),
        symbol,
        isMutable: true,
        // 必须在铸造时把歌曲的 collection 指向合集（用 some 包裹 Option）
        collection: some({ key: toPk(collectionMint), verified: false }) as any,
        creators: creatorsForOnchain as any,
      }).sendAndConfirm(umi);
      const mintPk = mint.publicKey.toString();
      setLastSongMint(mintPk);
      log(`歌曲 NFT 铸造成功: ${mintPk}`);
      log("开始验证加入集合…");
      await onSmartVerify(mintPk);
      const metadataPda = findMetadataPda(umi, { mint: toPk(mintPk) });
      const collectionMetadataPda = findMetadataPda(umi, { mint: toPk(collectionMint) });
      const collectionMasterEditionPda = findMasterEditionPda(umi, { mint: toPk(collectionMint) });
      log(`PDA: song.metadata=${metadataPda.toString()}`);
      log(`PDA: collection.metadata=${collectionMetadataPda.toString()}`);
      log(`PDA: collection.masterEdition=${collectionMasterEditionPda.toString()}`);

      // 将 PDA 写入状态，便于 UI 显示
      setReadyState((s) => ({ ...s, songMdPda: metadataPda.toString(), collMdPda: collectionMetadataPda.toString(), collMePda: collectionMasterEditionPda.toString() }));

      // 等待歌曲 Metadata 账户可读，避免立即验证时报 NotFound/Incorrect owner
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 10; i++) {
        try {
          const md = await safeFetchMetadata(umi as any, metadataPda);
          if (md) break;
        } catch {}
        await wait(500);
      }
      // 等待集合 MasterEdition 账号就绪（部分 RPC 同步慢时需要）
      for (let i = 0; i < 10; i++) {
        try {
          const acc = await (umi as any).rpc.getAccount(collectionMasterEditionPda);
          if (acc?.exists) break;
        } catch {}
        await wait(500);
      }
      // 防呆：避免用集合 Mint 作为歌曲 Mint
      if (collectionMint && collectionMint === mintPk) {
        log("错误：当前歌曲 Mint 与 Collection Mint 相同。请确认歌曲 Mint 是否填写正确。");
        return;
      }
      // 自动登记版权：将此歌曲的份额表登记到 ibom_registry
      if (autoRegister) {
        try {
          const fingerprintHashHex = await sha256Hex(uri);
          const workIdHex = await sha256Hex(mintPk);
          const payload = {
            workIdHex,
            metadataUri: uri,
            fingerprintHashHex,
            creators: list.map((c) => ({ address: c.address, share: Number(c.share) * 100 })), // 100 -> 10000 bp
          };
          const headers: Record<string, string> = { "content-type": "application/json" };
          const apiKey = process.env.NEXT_PUBLIC_REGISTRY_API_KEY as string | undefined;
          if (apiKey) headers["x-ibom-api-key"] = apiKey;
          const res = await fetch("/api/registry/register", { method: "POST", headers, body: JSON.stringify(payload) });
          const j = await res.json();
          if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);
          log(`已登记版权：sig=${j.signature} work=${j.work}`);
        } catch (e: any) {
          log(`登记版权失败: ${e?.message || e}`);
        }
      }
      // onMintSong 统一走智能验证，移除其它手动路径
    } catch (e: any) {
      const logs = (typeof (e as any).getLogs === "function") ? await (e as any).getLogs().catch(() => null) : null;
      log(`铸造失败: ${errToString(e)}`);
      if (logs && Array.isArray(logs)) {
        log(`Program Logs: \n${logs.map((l: string)=>`| ${l}`).join("\n")}`);
      }
    }
  }, [umi, wallet, name, uri, royalty, symbol, collectionMint, creators, autoRegister, log]);

  

  // 智能验证：自动等待就绪并执行验证
  const onSmartVerify = useCallback(async (mintOverride?: string) => {
    try {
      if (!wallet.publicKey) throw new Error("请先连接钱包");
      const songMint = mintOverride || lastSongMint;
      if (!songMint) throw new Error("请填写歌曲 Mint，或先完成一次铸造");
      if (!collectionMint) throw new Error("请先创建或填写 Collection Mint");
      if (songMint === collectionMint) throw new Error("填写的是集合 Mint，请改为歌曲 Mint");

      setVerifying(true);
      const mdPda = findMetadataPda(umi, { mint: toPk(songMint) });
      const collMdPda = findMetadataPda(umi, { mint: toPk(collectionMint) });
      const collMePda = findMasterEditionPda(umi, { mint: toPk(collectionMint) });
      setReadyState((s) => ({ ...s, checking: true, songMdPda: mdPda.toString(), collMdPda: collMdPda.toString(), collMePda: collMePda.toString() }));

      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      let songOk = false, collOk = false, meOk = false, sized = false;
      for (let i = 0; i < MAX_POLLS; i++) {
        try { songOk = !!(await safeFetchMetadata(umi as any, mdPda)); } catch { songOk = false; }
        try { const md = await safeFetchMetadata(umi as any, collMdPda); collOk = !!md; if (md) { try { const cd: any = (md as any).collectionDetails; sized = !!(cd && (cd.__option === 'Some' || cd.option === 'Some')); } catch {} } } catch { collOk = false; }
        try { const acc = await (umi as any).rpc.getAccount(collMePda); meOk = !!acc?.exists; } catch { meOk = false; }
        setReadyState({ songMd: songOk, collMd: collOk, collMe: meOk, sized, checking: i < MAX_POLLS - 1, songMdPda: mdPda.toString(), collMdPda: collMdPda.toString(), collMePda: collMePda.toString() });
        if (songOk && collOk && meOk) break;
        await wait(POLL_INTERVAL_MS);
      }
      // 若仅 MasterEdition 未就绪，尝试主动创建（集合创建后偶发未生成时）
      if (songOk && collOk && !meOk) {
        try {
          log("集合 MasterEdition 未就绪，尝试自动创建…");
          const sig = await createMasterEditionV3(umi, {
            mint: toPk(collectionMint),
            updateAuthority: toPk(wallet.publicKey.toBase58()),
            mintAuthority: toPk(wallet.publicKey.toBase58()),
            payer: toPk(wallet.publicKey.toBase58()),
            metadata: collMdPda,
            edition: collMePda,
            maxSupply: null as any,
          }).sendAndConfirm(umi);
          try { await (umi as any).rpc.confirmTransaction?.(sig); } catch {}
          // 再次读取 MasterEdition
          try { const acc = await (umi as any).rpc.getAccount(collMePda); meOk = !!acc?.exists; } catch { meOk = false; }
          setReadyState((s) => ({ ...s, collMe: meOk }));
          if (!meOk) throw new Error("自动创建 MasterEdition 失败");
          log("已自动创建集合 MasterEdition");
        } catch (e: any) {
          log(`自动创建 MasterEdition 失败: ${e?.message || e}`);
        }
      }
      if (!(songOk && collOk && meOk)) throw new Error("账户未就绪，请稍后再试");

      // 读取当前歌曲的 collection 状态，避免重复验证/错误迁移
      let currentKey = '';
      let currentVerified = false;
      try {
        const cur = await fetchMetadata(umi, mdPda);
        const coll: any = cur.collection;
        const v = coll && coll.__option === 'Some' ? coll.value : null;
        currentVerified = !!(v && v.verified);
        currentKey = v?.key?.toString?.() || String(v?.key || '');
        if (currentKey) log(`[检查] collection.key=${currentKey}`);
        log(`[检查] collection.verified=${currentVerified}`);
        // 若已对目标集合 verified，则直接成功返回
        if (currentVerified && currentKey === collectionMint) {
          log('已是 verified（目标合集），跳过重复验证。');
          return;
        }
      } catch {}

      // 执行验证（根据集合类型选择 + 是否已绑定同一合集）
      if (sized) {
        try {
          const tx = currentKey === collectionMint
            ? verifySizedCollectionItem(umi, {
                metadata: mdPda,
                collectionAuthority: toPk(wallet.publicKey.toBase58()),
                payer: toPk(wallet.publicKey.toBase58()),
                collectionMint: toPk(collectionMint),
                collection: collMdPda,
                collectionMasterEditionAccount: collMePda,
              })
            : setAndVerifySizedCollectionItem(umi, {
                metadata: mdPda,
                collectionAuthority: toPk(wallet.publicKey.toBase58()),
                payer: toPk(wallet.publicKey.toBase58()),
                updateAuthority: toPk(wallet.publicKey.toBase58()),
                collectionMint: toPk(collectionMint),
                collection: collMdPda,
                collectionMasterEditionAccount: collMePda,
              });
          const sig2 = await tx.sendAndConfirm(umi);
          try { await (umi as any).rpc.confirmTransaction?.(sig2); } catch {}
          log(currentKey === collectionMint ? "集合验证完成（sized）" : "集合设置并验证完成（sized）");
        } catch (e2: any) {
          const msg = e2?.message || String(e2);
          if (/already verified/i.test(msg) || /0x72/.test(msg)) {
            log('已是 verified（目标合集），跳过重复验证。');
            return;
          }
          log(`sized 验证失败: ${msg}`);
        }
      } else {
        try {
          const tx = currentKey === collectionMint
            ? verifyCollectionV1(umi, {
                metadata: mdPda,
                collectionMint: toPk(collectionMint),
              })
            : setAndVerifyCollection(umi, {
                metadata: mdPda,
                collectionAuthority: toPk(wallet.publicKey.toBase58()),
                payer: toPk(wallet.publicKey.toBase58()),
                updateAuthority: toPk(wallet.publicKey.toBase58()),
                collectionMint: toPk(collectionMint),
                collection: collMdPda,
                collectionMasterEditionAccount: collMePda,
              });
          const sig2 = await tx.sendAndConfirm(umi);
          try { await (umi as any).rpc.confirmTransaction?.(sig2); } catch {}
          log(currentKey === collectionMint ? "集合验证完成（unsized）" : "集合设置并验证完成（unsized）");
        } catch (e2: any) {
          const msg = e2?.message || String(e2);
          if (/already verified/i.test(msg) || /0x72/.test(msg)) {
            log('已是 verified（目标合集），跳过重复验证。');
            return;
          }
          log(`unsized 验证失败: ${msg}`);
        }
      }

      // 最终状态读取
      try {
        const md = await fetchMetadata(umi, mdPda);
        const coll: any = md.collection;
        const isSome = coll && coll.__option === "Some";
        const v = isSome ? coll.value : null;
        const verified = !!(v && v.verified);
        const collKey = v?.key?.toString?.() || String(v?.key || "");
        log(`[检查] ${songMint}`);
        log(`[检查] collection.verified=${verified}`);
        if (collKey) log(`[检查] collection.key=${collKey}`);
      } catch {}
    } catch (e: any) {
      log(`智能验证失败: ${e?.message || e}`);
    } finally {
      setVerifying(false);
      setReadyState((s) => ({ ...s, checking: false }));
    }
  }, [wallet, lastSongMint, collectionMint, MAX_POLLS, POLL_INTERVAL_MS, umi, log]);

  // 小工具：复制与打开浏览器
  const copy = useCallback(async (text: string) => {
    try { await navigator.clipboard?.writeText(text); log(`已复制: ${text}`); } catch {}
  }, [log]);
  const openExplorer = useCallback((addr: string) => {
    if (!addr) return;
    const url = `https://explorer.solana.com/address/${addr}?cluster=devnet`;
    window.open(url, "_blank");
  }, []);

  // 查看合集作品：调用后端 API 并将结果打印到日志
  const onListCollectionItems = useCallback(async () => {
    try {
      if (!collectionMint) throw new Error("请先填写 Collection Mint");
      log(`查询合集作品: ${collectionMint}`);
      const res = await fetch(`/api/collections/${collectionMint}/items`);
      const j = await res.json();
      if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      const items = Array.isArray(j.items) ? j.items : [];
      log(`[合集] 总数: ${j.count ?? items.length}`);
      items.forEach((it: any, i: number) => {
        const name = it?.name || "(no name)";
        const sym = it?.symbol ? ` · ${it.symbol}` : "";
        const v = it?.verified ? "verified" : "unverified";
        const mint = it?.mint || it?.id || "";
        log(`[${i + 1}/${items.length}] ${name}${sym} | ${mint} | ${v}`);
      });
      if (!items.length) log("[合集] 暂无作品");
      if (items.some((it: any) => it?.verified === false)) {
        log("[提示] 若刚完成验证，索引可能有延迟；稍后重试查询。");
      }
    } catch (e: any) {
      log(`[合集查询失败] ${e?.message || e}`);
    }
  }, [collectionMint, log]);

  // 移除 onInspect

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">歌曲 NFT 发行</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-500">名称 name</span>
          <input className="border rounded px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-500">符号 symbol</span>
          <input className="border rounded px-3 py-2" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-sm text-gray-500">元数据 URI（JSON）</span>
          <input className="border rounded px-3 py-2" value={uri} onChange={(e) => setUri(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-500">版税（%）</span>
          <input className="border rounded px-3 py-2" type="number" value={royalty} onChange={(e) => setRoyalty(parseFloat(e.target.value || "0"))} />
        </label>
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-sm text-gray-500">Collection Mint（留空则可先创建）</span>
          <input className="border rounded px-3 py-2" value={collectionMint} onChange={(e) => setCollectionMint(e.target.value)} />
        </label>
        {/* Creators 分润设置 */}
        <div className="md:col-span-2 border rounded p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-medium text-sm">分润成员 Creators（总和需等于 100）</div>
            <button
              className="px-2 py-1 text-xs rounded bg-gray-100"
              onClick={() => setCreators((prev) => [...prev, { address: wallet.publicKey?.toBase58() || "", share: prev.length ? 0 : 100 }])}
            >
              添加成员
            </button>
          </div>
          <div className="space-y-2">
            {creators.map((c, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                <label className="flex flex-col gap-1 col-span-8">
                  <span className="text-xs text-gray-500">成员地址 Address</span>
                  <input className="border rounded px-3 py-2" value={c.address}
                    onChange={(e) => setCreators((prev) => prev.map((x, i) => (i === idx ? { ...x, address: e.target.value } : x)))} />
                </label>
                <label className="flex flex-col gap-1 col-span-3">
                  <span className="text-xs text-gray-500">分成 Share (%)</span>
                  <input className="border rounded px-3 py-2" type="number" min={0} max={100} value={c.share}
                    onChange={(e) => setCreators((prev) => prev.map((x, i) => (i === idx ? { ...x, share: Number(e.target.value || 0) } : x)))} />
                </label>
                <button
                  className="col-span-1 text-xs px-2 py-2 rounded bg-red-50 text-red-600"
                  onClick={() => setCreators((prev) => prev.filter((_, i) => i !== idx))}
                  disabled={creators.length <= 1}
                >
                  删
                </button>
              </div>
            ))}
          </div>
          <div className="text-xs text-gray-600">
            当前总和：{creators.reduce((a, b) => a + (Number(b.share) || 0), 0)} / 100
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={autoRegister} onChange={(e) => setAutoRegister(e.target.checked)} />
            <span className="text-sm text-gray-700">铸造后登记到版权合约（/api/registry/register）</span>
          </div>
        </div>
        {/* 元数据构建器（可选，默认折叠） */}
        <div className="md:col-span-2 border rounded">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="font-medium text-sm">元数据构建器（可选，不影响直接使用 URI）</div>
            <button className="text-xs px-2 py-1 rounded bg-gray-100" onClick={() => setBuilderOpen((v) => !v)}>
              {builderOpen ? "收起" : "展开"}
            </button>
          </div>
          {builderOpen && (
            <div className="p-3 space-y-3 border-t">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-gray-500">艺人 Artist</span>
              <input className="border rounded px-3 py-2" value={artist} onChange={(e) => setArtist(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-gray-500">专辑 Album</span>
              <input className="border rounded px-3 py-2" value={album} onChange={(e) => setAlbum(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-gray-500">曲序 Track #</span>
              <input className="border rounded px-3 py-2" value={trackNo} onChange={(e) => setTrackNo(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-gray-500">碟序 Disc #</span>
              <input className="border rounded px-3 py-2" value={discNo} onChange={(e) => setDiscNo(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-gray-500">流派 Genre</span>
              <input className="border rounded px-3 py-2" value={genre} onChange={(e) => setGenre(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-gray-500">年份 Year</span>
              <input className="border rounded px-3 py-2" value={year} onChange={(e) => setYear(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-gray-500">时长 Duration (mm:ss)</span>
              <input className="border rounded px-3 py-2" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-gray-500">BPM</span>
              <input className="border rounded px-3 py-2" value={bpm} onChange={(e) => setBpm(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-gray-500">调式 Key</span>
              <input className="border rounded px-3 py-2" value={musicalKey} onChange={(e) => setMusicalKey(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-gray-500">ISRC</span>
              <input className="border rounded px-3 py-2" value={isrc} onChange={(e) => setIsrc(e.target.value)} />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={explicit} onChange={(e) => setExplicit(e.target.checked)} />
              <span className="text-sm text-gray-700">Explicit（含敏感词）</span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-gray-500">语言 Language</span>
              <input className="border rounded px-3 py-2" value={language} onChange={(e) => setLanguage(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="text-sm text-gray-500">外链 External URL</span>
              <input className="border rounded px-3 py-2" value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="text-sm text-gray-500">封面 Image URL</span>
              <input className="border rounded px-3 py-2" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="text-sm text-gray-500">音频 Audio URL</span>
              <input className="border rounded px-3 py-2" value={audioUrl} onChange={(e) => setAudioUrl(e.target.value)} />
            </label>
              </div>
              <div className="flex gap-2">
                <button className="px-3 py-1 rounded bg-gray-800 text-white" onClick={onPreviewMetadata}>生成预览</button>
                <button className="px-3 py-1 rounded bg-green-600 text-white" onClick={onUploadMetadata}>上传到 IPFS 并填入 URI</button>
              </div>
              <textarea className="w-full border rounded p-2 text-xs font-mono min-h-[140px]" readOnly value={metaPreview} placeholder="点击生成预览以查看元数据 JSON" />
            </div>
          )}
        </div>
        
        {lastSongMint ? (
          <div className="md:col-span-2 text-xs text-gray-600 flex items-center gap-2">
            <span>最近歌曲 Mint:</span>
            <span className="font-mono break-all">{lastSongMint}</span>
            <button className="px-2 py-1 text-xs bg-gray-200 rounded" onClick={() => copy(lastSongMint)}>复制</button>
            <button className="px-2 py-1 text-xs bg-gray-200 rounded" onClick={() => openExplorer(lastSongMint)}>浏览器</button>
          </div>
        ) : null}
        {collectionMint ? (
          <div className="md:col-span-2 text-xs text-gray-600 flex items-center gap-2">
            <span>当前 Collection Mint:</span>
            <span className="font-mono break-all">{collectionMint}</span>
            <button className="px-2 py-1 text-xs bg-gray-200 rounded" onClick={() => copy(collectionMint)}>复制</button>
            <button className="px-2 py-1 text-xs bg-gray-200 rounded" onClick={() => openExplorer(collectionMint)}>浏览器</button>
          </div>
        ) : null}
      </div>

      <div className="flex gap-3">
        <button className="px-4 py-2 rounded bg-black text-white disabled:opacity-50" onClick={onCreateCollection} disabled={!wallet.connected}>
          创建集合 Collection
        </button>
        <button className="px-4 py-2 rounded bg-indigo-600 text-white disabled:opacity-50" onClick={onMintSong} disabled={!wallet.connected}>
          铸造歌曲 NFT 并加入集合
        </button>
      </div>

      <div className="mt-6 flex gap-3 flex-wrap">
        <button
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
          onClick={() => onSmartVerify()}
          disabled={!wallet.connected || verifying || !lastSongMint}
          title={!wallet.connected ? "请先连接钱包" : (!lastSongMint ? "请先铸造歌曲" : (verifying ? "正在智能验证…" : "自动等待账户就绪并验证"))}
        >
          智能验证（自动等待）
        </button>
        <button
          className="px-4 py-2 rounded bg-gray-800 text-white disabled:opacity-50"
          onClick={onListCollectionItems}
          disabled={!collectionMint}
          title={!collectionMint ? "请先填写或创建 Collection Mint" : "查询合集作品并输出到日志"}
        >
          查看合集作品（日志输出）
        </button>
      </div>

      {/* 就绪状态面板 */}
      <div className="mt-4 border rounded p-3 text-xs space-y-2">
        <div className="font-medium">就绪状态</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div>
            <span className={`inline-block w-2 h-2 rounded-full mr-2 ${readyState.songMd ? 'bg-green-500' : 'bg-red-400'}`}></span>
            歌曲 Metadata: {readyState.songMd ? '可读' : '未就绪'}{readyState.songMdPda ? ` (${readyState.songMdPda})` : ''}
          </div>
          <div>
            <span className={`inline-block w-2 h-2 rounded-full mr-2 ${readyState.collMd ? 'bg-green-500' : 'bg-red-400'}`}></span>
            集合 Metadata: {readyState.collMd ? '可读' : '未就绪'}{readyState.collMdPda ? ` (${readyState.collMdPda})` : ''}
          </div>
          <div>
            <span className={`inline-block w-2 h-2 rounded-full mr-2 ${readyState.collMe ? 'bg-green-500' : 'bg-red-400'}`}></span>
            集合 MasterEdition: {readyState.collMe ? '存在' : '未就绪'}{readyState.collMePda ? ` (${readyState.collMePda})` : ''}
          </div>
          <div>
            集合类型: {readyState.sized ? 'sized' : 'unsized'}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="font-medium mb-2">输出</h2>
        <div className="flex gap-2 mb-2">
          <button className="px-3 py-1 text-xs bg-gray-200 rounded" onClick={() => setLogs([])}>清空输出</button>
          <button className="px-3 py-1 text-xs bg-gray-200 rounded" onClick={() => copy(logs.join('\n'))}>复制输出</button>
        </div>
        <pre className="text-xs bg-gray-100 p-3 rounded whitespace-pre-wrap break-all min-h-[120px]">{logs.join("\n")}</pre>
      </div>
    </div>
  );
}
