# 03｜实战：数据上链（版权登记）

目标：将“作品 Work”上链，记录 metadataUri、指纹与分润。

## 0) 前置
- `.env.local`（服务器/API）：
  - `SOLANA_RPC_URL=https://api.devnet.solana.com`
  - `REGISTRY_PROGRAM_ID=<Program Id>`
  - 服务器钱包：三选一（建议 keypair 路径）
    - `REGISTRY_AUTHORITY_KEYPAIR_PATH=/Users/<you>/.config/solana/id.json`
    - 或 `REGISTRY_AUTHORITY_SECRET_KEY=[...]`（JSON 数组）
    - 或 `REGISTRY_AUTHORITY_SECRET_KEY=<BASE64>`
  - 可选：`REGISTRY_API_KEY=<强口令>`（启用后请求需带 `x-ibom-api-key`）

## 1) 方式 A：前端钱包直发（页面）
- 启动：`npm run dev` → http://localhost:3000/registry
- 连接 Devnet 钱包（Phantom）
- 填写或留空（留空自动随机 32 字节）：
  - workIdHex、fingerprintHex（64 位 hex）
  - metadataUri（建议 IPFS/Arweave）
- 点击“发起登记”，输出将包含：
  - 成功: `<signature>`
  - PDA: `<work_pda>`

## 2) 方式 B：后台 API 代签
- 请求
```bash
curl -X POST http://localhost:3000/api/registry/register \
  -H 'content-type: application/json' \
  -H 'x-ibom-api-key: YOUR_API_KEY' \
  -d '{
    "workIdHex": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "metadataUri": "ipfs://bafy.../work.json",
    "fingerprintHashHex": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "creators": [ {"address":"<PUBKEY>","share":10000} ]
  }'
```
- 响应：`{ ok, signature, work, authority }`

> 字段说明与 OpenAPI 见：`docs/api/registry.md`

## 3) 验证与读取
- 交易确认：`solana confirm <signature> --url https://api.devnet.solana.com`
- 打印账户：`solana account <work_pda> --url https://api.devnet.solana.com`

## 4) 常见问题
- `sum(creators.share) != 10000`：分润和需为 100%（10000 bp）。
- `metadata_uri exceeds MAX_URI_LEN`：URI ≤ 200 字节。
- 权限：仅 `authority` 可更新，且 PDA 种子包含 `authority` 与 `work_id`。

