# 05｜实战：发行歌曲 NFT（Umi/前端）

基于 Metaplex Token Metadata，使用前端页面完成集合与单曲 NFT 发行。

## 1) 前置
- 环境：已启动前端 `npm run dev`
- 钱包：Phantom 切换 Devnet 并有少量 SOL

## 2) 入口页面
- 路由：`/nft`
- 功能：
  - 创建 Collection NFT（合集）
  - 铸造单曲 NFT，并“验证加入合集”

## 3) 操作流程
- 打开 `/nft`，连接钱包
- 可配置：名称、符号、元数据 URI、版税（%）、Collection Mint（留空先创建）
- 按钮：
  - 创建集合 → 返回集合 Mint 地址（可复制到环境变量）
  - 铸造歌曲 NFT → 自动调用 `verifyCollectionV1`

## 4) 环境变量（可选）
- `NEXT_PUBLIC_SONGS_COLLECTION_MINT=<集合 Mint>`（留空则临时创建）

## 5) 元数据 JSON 示例（适配歌曲 NFT）
```json
{
  "name": "Artist — Song Title",
  "symbol": "SONG",
  "description": "A single from the album Example.",
  "image": "https://example.com/cover.png",                 
  "animation_url": "https://example.com/audio.mp3",           
  "external_url": "https://example.com/song",                 
  "attributes": [
    { "trait_type": "Artist", "value": "Artist Name" },
    { "trait_type": "Album", "value": "Album Name" },
    { "trait_type": "Track #", "value": "3" },
    { "trait_type": "Disc #", "value": "1" },
    { "trait_type": "Genre", "value": "Pop" },
    { "trait_type": "Year", "value": "2025" },
    { "trait_type": "Duration", "value": "03:42" },
    { "trait_type": "BPM", "value": "120" },
    { "trait_type": "Key", "value": "G Major" },
    { "trait_type": "ISRC", "value": "US-ABC-25-00001" },
    { "trait_type": "Explicit", "value": "No" },
    { "trait_type": "Language", "value": "en" }
  ],
  "properties": {
    "category": "audio",
    "files": [
      { "uri": "https://example.com/audio.mp3", "type": "audio/mpeg" },
      { "uri": "https://example.com/cover.png", "type": "image/png" }
    ]
  },
  "collection": { "name": "Songs Collection", "family": "Artist Catalog" }
}
```

说明与建议：
- image：歌曲封面，用于大多数市场的缩略图展示。
- animation_url：音频资源（mp3/wav/aac 等），多数播放控件会优先播放该链接。
- attributes：可放入曲库常见信息（艺人/专辑/曲序/时长/BPM/Key/年份/ISRC/Explicit 等），便于检索与筛选。
- properties.files：列出所有关键信息文件，并设置合适的 MIME type；可加入歌词 JSON、无损音频等扩展文件。
- external_url：歌曲/项目的外部页面（可选）。
- collection：仅作为 off-chain 描述；链上集合归属与“已验证”由 /nft 页的集合验证流程完成。
- 生产环境推荐托管到 IPFS/Arweave，并将 JSON 的 URI 粘贴到 /nft 页的“元数据 URI（JSON）”。

## 6) 验证
- 在 Solana 浏览器（devnet）查询歌曲 Mint 地址与集合关系
- 检查 `seller_fee_basis_points` 与 `creators` 分润设置

## 7) 常见问题
- 余额不足：钱包需支付铸造与元数据账户租金
- 元数据 404：确保 `image/animation_url` 可访问；生产推荐使用 IPFS/Arweave
