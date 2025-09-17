# IBOM Registry API

面向 ibom 后台（或受信任的服务）调用，用于将版权登记数据写入 Solana 链上（Anchor Program: `ibom_registry`）。接口由服务器钱包签名并发送交易。

## 基础信息
- 基础路径: 你的前端服务域名（Next.js）
- 前缀: 无（Next App Router）
- Program: `ibom_registry`
- 网络: 由服务器环境变量配置（默认 `devnet`）

## 认证
- 可选 API Key: 在服务端设置 `REGISTRY_API_KEY` 后，请求头需带 `x-ibom-api-key: <同值>`

## 服务端环境变量
- `REGISTRY_PROGRAM_ID`: 已部署的 `ibom_registry` Program ID（必填）
- `SOLANA_RPC_URL`: RPC 端点（默认 `https://api.devnet.solana.com`）
- `SOLANA_COMMITMENT`: `confirmed|finalized`（默认 `confirmed`）
- 服务器钱包（三选一，必填其一）
  - `REGISTRY_AUTHORITY_SECRET_KEY=[...]`: JSON 数组（与 `id.json` 同格式）
  - `REGISTRY_AUTHORITY_SECRET_KEY=<BASE64>`: base64 编码的密钥
  - `REGISTRY_AUTHORITY_KEYPAIR_PATH=/path/to/id.json`: 指向密钥文件
- `REGISTRY_API_KEY`: 可选，用于开启请求鉴权

> 注意：切勿将以上敏感变量放到 `NEXT_PUBLIC_*` 前缀中。

## 数据类型约定
- `workId` 与 `fingerprintHash`（32 字节）支持三种输入形式，任选其一：
  - `...Hex`: 64 位 hex 字符串（不带 0x）
  - `...Base64`: base64 字符串
  - 原始数组：`number[32]`
- `creators`: 数组，元素 `{ address: string(base58 pubkey), share: number }`，且 `sum(share) = 10000`（等于 100%）。
- `metadataUri`: 最长 200 字节，建议为 IPFS/Arweave 的 JSON URI。

## 接口列表

### POST /api/registry/register
在服务器钱包名下，创建一条新的 `Work` 账户（PDA: `["work", authority, work_id]`）。

请求体（任意 `workId*`、`fingerprintHash*` 形式均可）：
```json
{
  "workIdHex": "<64 hex>",
  "metadataUri": "ipfs://...",
  "fingerprintHashHex": "<64 hex>",
  "creators": [
    { "address": "<base58 pubkey>", "share": 7000 },
    { "address": "<base58 pubkey>", "share": 3000 }
  ]
}
```

成功响应：
```json
{ "ok": true, "signature": "<txSig>", "work": "<workPda>", "authority": "<serverAuthority>" }
```

可能的错误：
- 400: 参数校验失败（hex/base64/长度、share 求和不为 10000、URI 超长等）
- 401: 缺少或错误的 `x-ibom-api-key`（开启鉴权时）
- 409: 目标账户已存在（当前实现由链上报错，客户端会看到 400，建议按错误消息判断）

示例（curl）：
```bash
curl -X POST http://localhost:3000/api/registry/register \
  -H 'content-type: application/json' \
  -H 'x-ibom-api-key: YOUR_API_KEY' \
  -d '{
    "workIdHex": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "metadataUri": "ipfs://bafy.../work.json",
    "fingerprintHashHex": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "creators": [
      {"address":"<PK1>","share":7000},
      {"address":"<PK2>","share":3000}
    ]
  }'
```

### POST /api/registry/update
更新已存在的 `Work`（必须由同一 `authority` 发起，即服务器钱包）。

请求体：
```json
{
  "workIdHex": "<64 hex>",
  "metadataUri": "ipfs://...",
  "fingerprintHashHex": "<64 hex>",
  "creators": [ { "address": "<pubkey>", "share": 10000 } ]
}
```

成功响应：
```json
{ "ok": true, "signature": "<txSig>", "work": "<workPda>", "authority": "<serverAuthority>" }
```

可能的错误：
- 400: 参数或合约校验失败（`has_one = authority`、URI/creators 约束等）
- 401: 鉴权失败
- 404: 账户不存在（当前实现由链上报错，客户端会看到 400，建议按错误消息判断）

示例（curl）：
```bash
curl -X POST http://localhost:3000/api/registry/update \
  -H 'content-type: application/json' \
  -H 'x-ibom-api-key: YOUR_API_KEY' \
  -d '{
    "workIdHex": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "metadataUri": "ipfs://bafy.../work-v2.json",
    "fingerprintHashHex": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    "creators": [
      {"address":"<PK1>","share":6000},
      {"address":"<PK2>","share":4000}
    ]
  }'
```

## OpenAPI（简化）
```yaml
openapi: 3.0.0
info:
  title: IBOM Registry API
  version: 0.1.0
paths:
  /api/registry/register:
    post:
      security:
        - apiKey: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/RegisterRequest'
      responses:
        '200': { description: OK }
        '400': { description: Bad Request }
        '401': { description: Unauthorized }
  /api/registry/update:
    post:
      security:
        - apiKey: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UpdateRequest'
      responses:
        '200': { description: OK }
        '400': { description: Bad Request }
        '401': { description: Unauthorized }
components:
  securitySchemes:
    apiKey:
      type: apiKey
      in: header
      name: x-ibom-api-key
  schemas:
    Creator:
      type: object
      properties:
        address: { type: string, description: base58 public key }
        share: { type: integer, minimum: 0, maximum: 10000 }
      required: [address, share]
    RegisterRequest:
      type: object
      properties:
        workIdHex: { type: string }
        workIdBase64: { type: string }
        workId: { type: array, items: { type: integer }, minItems: 32, maxItems: 32 }
        metadataUri: { type: string }
        fingerprintHashHex: { type: string }
        fingerprintHashBase64: { type: string }
        fingerprintHash: { type: array, items: { type: integer }, minItems: 32, maxItems: 32 }
        creators:
          type: array
          items: { $ref: '#/components/schemas/Creator' }
      required: [metadataUri, creators]
    UpdateRequest:
      allOf:
        - $ref: '#/components/schemas/RegisterRequest'
```

## 使用建议
- 幂等：`register` 若账户已存在会失败；推荐先查（未来可提供 GET），或在失败时根据错误信息切换至 `update`。
- 事务追踪：拿到 `signature` 后，可用区块浏览器/RPC 追踪确认状态。
- 可靠性：建议在 API 网关层做超时/重试限流，服务内部避免重复发送同一事务。

