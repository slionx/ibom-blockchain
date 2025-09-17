# 02｜常用命令与操作流程

覆盖 Solana/Anchor 必备命令、RPC/代理、部署/调试与脚本化操作。

## 1) 基础命令
- 切换网络：`solana config set --url devnet|https://api.devnet.solana.com`
- 查看配置：`solana config get`
- 地址/余额：`solana address`，`solana balance`
- 空投：`solana airdrop 2`（可能限流）
- 版本：`solana --version`，`anchor --version`

## 2) 代理与稳定 RPC
- 代理：
  - `export http_proxy=http://127.0.0.1:7890; export https_proxy=http://127.0.0.1:7890`
  - 亦可设置大写 `HTTP_PROXY/HTTPS_PROXY`
- 专用 RPC（可选）：`solana config set --url 'https://devnet.helius-rpc.com/?api-key=<KEY>'`

## 3) Program ID 与 declare_id
- 生成程序 keypair：`solana-keygen new -o onchain/target/deploy/ibom_registry-keypair.json --no-bip39-passphrase --force`
- 推导 Program ID：`solana address -k onchain/target/deploy/ibom_registry-keypair.json`
- 回写 declare_id：编辑 `onchain/programs/ibom_registry/src/lib.rs` 的 `declare_id!("<PROGRAM_ID>");`
- Anchor.toml：在 `[programs.devnet]` 配置 `ibom_registry = "<PROGRAM_ID>"`
- 本次使用的 Program ID：`6rozMzrUPYqBkvmrc5VXJEP2d4Kc4AK1oXz9PDi8bBas`


## 4) 构建与部署（两种方式）
- Anchor（自动处理 IDL）：
  - `anchor build --provider.cluster devnet`
  - `anchor deploy --provider.cluster devnet`
- 仅用 solana CLI（更抗网络波动）：
  - `cd onchain`
  - `solana program deploy --use-rpc --commitment confirmed --max-sign-attempts 10 --program-id target/deploy/ibom_registry-keypair.json target/deploy/ibom_registry.so --url https://api.devnet.solana.com`
  - 验证：`solana program show <PROGRAM_ID>`
  - 本次使用的 验证Program ID：`solana program show 6rozMzrUPYqBkvmrc5VXJEP2d4Kc4AK1oXz9PDi8bBas`
- 上链 IDL（可选 意义在于让客户端/工具可在线发现合约接口）：
  - `anchor idl init --provider.cluster devnet <PROGRAM_ID> -f target/idl/ibom_registry.json`
  - 已存在则：`anchor idl upgrade --provider.cluster devnet <PROGRAM_ID> -f target/idl/ibom_registry.json`

## 5) 读取与调试
- 确认交易：`solana confirm <SIGNATURE>`
- 查看日志：`solana logs --url <RPC>`（或前端 `connection.onLogs`）
- 账户：`solana account <PUBKEY>`

## 6) 项目脚本（已内置）
- 一键部署 devnet：`./scripts/deploy_devnet.sh`
- 生成服务器钱包：`node scripts/gen-keypair.mjs > /tmp/k.txt`
- 批量空投并归集：`SOLANA_URL=https://api.devnet.solana.com ./scripts/fund_target_from_airdrops.sh <TARGET> 3 1.9`

## 7) 常见错误与定位
- `Connection reset by peer`：加代理或改 `--use-rpc`，或换私有 RPC。
- 余额不足：给 `solana address` 地址充值；部署通常需 >1.6 SOL（devnet）。
- Anchor/IDL 不匹配：将 `onchain/Cargo.toml` 的 `anchor-lang` 与 `anchor --version` 对齐；必要时用 CLI 直部署。

## 集合验证策略（本项目统一 sized）
- 我们统一使用“sized 集合”。创建集合时即写入 `collectionDetails`（SDK 会自动处理），后续验证按 sized 路径执行。
- 铸造歌曲时：务必将 `collection` 字段设置为 Option.Some({ key, verified:false })。
- 验证顺序（前端已内置）：
  - 首选 `verifySizedCollectionItem`
  - 失败则 `setAndVerifySizedCollectionItem`
  - 验证后读取 Metadata，若 `collection.verified` 仍为 false，则再次执行 `setAndVerifySizedCollectionItem` 修复
- 不再使用仅适用于 unsized 的 `verifyCollectionV1 / setAndVerifyCollection` 作为常规路径，避免“返回 OK 但 verified 仍为 false”的情况。

## QA：Program ID 相关

- Program ID 是什么？
  - 部署到链上的“程序地址”，本质是一个公钥（base58）。在可升级程序下，还会存在 ProgramData 地址和 Upgrade Authority（升级权限）地址。

- Program ID 从哪里来？
  - 由“程序 keypair”推导：`solana address -k onchain/target/deploy/<program>-keypair.json`
  - 初次部署需要该 keypair 作为签名者；后续升级只需 Upgrade Authority 签名。

- Program ID 和钱包地址有什么区别？
  - 都是公钥地址，但语义不同：Program ID 表示合约程序账户；钱包地址表示普通账户/签名者。部署时通常由你的 CLI 钱包（fee payer/upgrade authority）支付费用，而 Program ID 来源于程序 keypair。

- declare_id/Anchor.toml 要如何配置？
  - 源码中：`onchain/programs/<name>/src/lib.rs` 的 `declare_id!("<PROGRAM_ID>");`
  - Anchor.toml：`[programs.devnet] <name> = "<PROGRAM_ID>"`
  - 二者需与“程序 keypair 推导出的地址”一致，否则构建/部署会失败或行为异常。

- 我能修改 Program ID 吗？
  - 可以，但相当于“换一个新程序”：需重新生成程序 keypair、回写 declare_id/Anchor.toml，并重新部署。旧 Program ID 上的状态不自动迁移。

- 可升级程序相关的几个地址？
  - Program（Program ID）：可执行入口地址
  - ProgramData：存放程序数据（.so）与升级信息
  - Upgrade Authority：拥有升级权限的钱包地址
  - `solana program show <PROGRAM_ID>` 可查看三者及余额、Data Length 等信息。

- 如何从部署产物快速拿到 Program ID？
  - `solana address -k onchain/target/deploy/<name>-keypair.json`
  - 或看 `anchor deploy` 的输出 `Program Id: ...`

- 前端/SDK 需要 Program ID 吗？
  - 需要。前端使用 Program ID 搭建 Program 客户端。Anchor 0.31 起，构造 Program 时还需在 IDL 中携带 `address` 字段（本仓库已在封装里自动注入）。

- Program ID 与 Helius/QuickNode 的 API Key 有关系吗？
  - 没关系。API Key 是访问第三方 RPC 的凭证，Program ID 是链上程序地址。不要把 Program ID 填进 `?api-key=` 参数，否则会得到 401 Unauthorized。
