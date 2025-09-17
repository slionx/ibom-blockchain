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

## 5) 元数据 JSON 示例
```json
{
  "name": "My Song",
  "symbol": "SONG",
  "description": "A great track.",
  "image": "https://example.com/cover.png",
  "animation_url": "https://example.com/audio.mp3",
  "attributes": [{ "trait_type": "Genre", "value": "Pop" }],
  "properties": { "files": [{ "uri": "https://example.com/audio.mp3", "type": "audio/mpeg" }] }
}
```

## 6) 验证
- 在 Solana 浏览器（devnet）查询歌曲 Mint 地址与集合关系
- 检查 `seller_fee_basis_points` 与 `creators` 分润设置

## 7) 常见问题
- 余额不足：钱包需支付铸造与元数据账户租金
- 元数据 404：确保 `image/animation_url` 可访问；生产推荐使用 IPFS/Arweave

