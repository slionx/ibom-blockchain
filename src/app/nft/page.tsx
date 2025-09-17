"use client";
import React, { useCallback, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { publicKey as toPk, generateSigner, percentAmount, none, some } from "@metaplex-foundation/umi";
import { createNft, findMetadataPda, findMasterEditionPda } from "@metaplex-foundation/mpl-token-metadata";
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
  const [inspectMint, setInspectMint] = useState<string>("");

  const log = useCallback((m: string) => setLogs((prev) => [m, ...prev].slice(0, 200)), []);

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
        // 标记为集合 NFT：仅设置 isCollection 即可，由库自动填充 collectionDetails("V2")
        isCollection: true as any,
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
      const mint = generateSigner(umi);
      log("铸造歌曲 NFT 中…");
      await createNft(umi, {
        mint,
        name,
        uri,
        sellerFeeBasisPoints: percentAmount(royalty),
        symbol,
        isMutable: true,
        // 必须在铸造时把歌曲的 collection 指向合集（用 some 包裹 Option）
        collection: some({ key: toPk(collectionMint), verified: false }) as any,
        creators: wallet.publicKey ? [{ address: toPk(wallet.publicKey.toBase58()), verified: true, share: 100 }] : [],
      }).sendAndConfirm(umi);
      const mintPk = mint.publicKey.toString();
      log(`歌曲 NFT 铸造成功: ${mintPk}`);
      log("开始验证加入集合…");
      const metadataPda = findMetadataPda(umi, { mint: toPk(mintPk) });
      const collectionMetadataPda = findMetadataPda(umi, { mint: toPk(collectionMint) });
      const collectionMasterEditionPda = findMasterEditionPda(umi, { mint: toPk(collectionMint) });
      // 统一 sized 集合：先 verifySizedCollectionItem，失败则 setAndVerifySizedCollectionItem
      try {
        await verifySizedCollectionItem(umi, {
          metadata: metadataPda,
          collectionAuthority: toPk(wallet.publicKey.toBase58()),
          payer: toPk(wallet.publicKey.toBase58()),
          collectionMint: toPk(collectionMint),
          collection: collectionMetadataPda,
          collectionMasterEditionAccount: collectionMasterEditionPda,
        }).sendAndConfirm(umi);
        log("集合验证完成（sized）");
      } catch (e1: any) {
        log("verifySizedCollectionItem 失败，尝试 setAndVerifySizedCollectionItem …");
        await setAndVerifySizedCollectionItem(umi, {
          metadata: metadataPda,
          collectionAuthority: toPk(wallet.publicKey.toBase58()),
          payer: toPk(wallet.publicKey.toBase58()),
          updateAuthority: toPk(wallet.publicKey.toBase58()),
          collectionMint: toPk(collectionMint),
          collection: collectionMetadataPda,
          collectionMasterEditionAccount: collectionMasterEditionPda,
        }).sendAndConfirm(umi);
        log("集合设置并验证完成（sized）");
      }

      // 链上结果校验（读取歌曲 Metadata），若未 verified 则强制走 sized 修复
      try {
        const md = await fetchMetadata(umi, metadataPda);
        const coll: any = md.collection;
        const isSome = coll && coll.__option === "Some";
        const v = isSome ? coll.value : null;
        const verified = !!(v && v.verified);
        const collKey = v?.key?.toString?.() || String(v?.key || "");
        log(`链上校验: collection.verified=${verified}`);
        if (collKey) {
          const match = collKey === collectionMint;
          log(`链上校验: collection.key=${collKey} ${match ? "(匹配)" : "(不匹配)"}`);
          if (match && !verified) {
            log("检测到仍未 verified，尝试 setAndVerifySizedCollectionItem 修复…");
            await setAndVerifySizedCollectionItem(umi, {
              metadata: metadataPda,
              collectionAuthority: toPk(wallet.publicKey.toBase58()),
              payer: toPk(wallet.publicKey.toBase58()),
              updateAuthority: toPk(wallet.publicKey.toBase58()),
              collectionMint: toPk(collectionMint),
              collection: collectionMetadataPda,
              collectionMasterEditionAccount: collectionMasterEditionPda,
            }).sendAndConfirm(umi);
            const md2 = await fetchMetadata(umi, metadataPda);
            const cv2: any = md2.collection;
            const v2 = cv2 && cv2.__option === "Some" ? cv2.value : null;
            const verified2 = !!(v2 && v2.verified);
            log(`修复后链上校验: collection.verified=${verified2}`);
          }
        }
      } catch (e: any) {
        log(`读取链上 Metadata 失败: ${e.message || e}`);
      }
    } catch (e: any) {
      log(`铸造失败: ${e.message || e}`);
    }
  }, [umi, wallet, name, uri, royalty, symbol, collectionMint, log]);

  const onInspect = useCallback(async () => {
    try {
      if (!inspectMint) throw new Error("请填写要检查的 Mint 地址");
      const mdPda = findMetadataPda(umi, { mint: toPk(inspectMint) });
      const md = await fetchMetadata(umi, mdPda);
      const coll: any = md.collection;
      const isSome = coll && coll.__option === "Some";
      const v = isSome ? coll.value : null;
      const verified = !!(v && v.verified);
      const collKey = v?.key?.toString?.() || String(v?.key || "");
      log(`[检查] ${inspectMint}`);
      log(`[检查] collection.verified=${verified}`);
      if (collKey) log(`[检查] collection.key=${collKey}`);
    } catch (e: any) {
      log(`[检查失败] ${e.message || e}`);
    }
  }, [umi, inspectMint, log]);

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
      </div>

      <div className="flex gap-3">
        <button className="px-4 py-2 rounded bg-black text-white disabled:opacity-50" onClick={onCreateCollection} disabled={!wallet.connected}>
          创建集合 Collection
        </button>
        <button className="px-4 py-2 rounded bg-indigo-600 text-white disabled:opacity-50" onClick={onMintSong} disabled={!wallet.connected}>
          铸造歌曲 NFT 并加入集合
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-sm text-gray-500">检查 Mint（读取链上 Metadata）</span>
          <input className="border rounded px-3 py-2" value={inspectMint} onChange={(e) => setInspectMint(e.target.value)} placeholder="填写歌曲 Mint 地址" />
        </label>
        <button className="px-4 py-2 rounded bg-gray-800 text-white disabled:opacity-50" onClick={onInspect} disabled={!wallet.connected}>
          检查链上状态
        </button>
      </div>

      <div className="mt-6">
        <h2 className="font-medium mb-2">输出</h2>
        <pre className="text-xs bg-gray-100 p-3 rounded whitespace-pre-wrap break-all min-h-[120px]">{logs.join("\n")}</pre>
      </div>
    </div>
  );
}
