# IBOM 项目区块链（Solana）落地方案

本方案面向 ibom-demo 前端项目，指导如何基于 Solana 完成 BOM（物料清单）相关的可信记录与对账能力，兼顾透明性、可审计性与成本控制。

## 目录
- 快速总览（TL;DR）
- 核心能力导览
- 核心能力（音乐版权/歌曲 NFT/稳定币）
- 架构总览
- 开发环境准备
- 合约设计（Anchor）
- 前端集成（ibom-demo 与 Next.js）
- 数据与成本策略
- 安全与合规要点
- 支付/结算（可选扩展）
- 监控与运维
- 里程碑拆分
- 附录 A：SPL Token 发币与治理
- 环境变量清单（Next.js）
## 快速总览（TL;DR）

## 核心能力导览
- 能力一：上链版权登记（见下文“上链版权信息（Registry）”）
- 能力二：歌曲 NFT 发行（见下文“为不同歌曲发布 NFT（Metaplex）”）
- 能力三：稳定币结算与关联（见下文“发布稳定币并与歌曲 NFT 关联”与‘附录 A’）

说明：本文其余章节（架构、环境、安全等）均服务于上述三大能力。

1) 用 Anchor 实现最小上链（项目/物料/哈希）并部署到 devnet。
2) 前端接入钱包 + Program 调用（本仓库已集成 Next.js 与 Wallet Adapter）。
3) 发币与结算：如需代币/稳定币，按文末章节完成 Mint/多签/金库配置。
4) 音乐三大功能：先登记版权（Registry），再发行歌曲 NFT（Metaplex），最后用稳定币/代币做标价与结算（Auction House/Escrow）。


## 目标与原则
- 目标：
  - 在链上记录项目/物料关键状态，达成可审计、防篡改。
  - 结合离链存储（如 IPFS/Arweave）降低成本，保留完整细节。
  - 为后续结算与激励（SPL Token/ SOL 支付、托管）预留扩展点。
- 原则：
  - 最小必要上链：关键信息与哈希指纹上链；大体量明细离链。
  - 合约简洁可审计：使用 Anchor 约束校验与 PDA 设计规范。
  - 前后端分层清晰：前端仅签名与调用；密钥与私有逻辑不上链。

---

## 架构总览
- 前端（ibom-demo）：React + `@solana/wallet-adapter` + `@coral-xyz/anchor`，负责连接钱包、发起交易、读取合约数据。
- 合约（on-chain Program）：使用 Anchor 开发，存储项目与物料的最小状态与校验哈希，暴露初始化、增改、归档等指令。
- 离链存储：IPFS/Arweave 存 BOM 明细与附件，链上存其哈希与 URI。
- RPC 与索引：选择高可用 RPC（Helius/QuickNode/Triton/官方）并可选事件索引（Webhook/自建 Indexer）。

---

## 开发环境准备
1) 基础依赖
- Node.js 18+ / 20+
- Rust + Cargo（用于 Anchor）
- Solana CLI（建议 stable 通道）
- Anchor CLI（通过 AVM 安装）

2) 安装示例（macOS/Linux）
```bash
# Solana CLI（stable）
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
solana --version

# Anchor / AVM（推荐）
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm --version
avm install latest
avm use latest
anchor --version

# 可选：pnpm 或 npm
npm i -g pnpm
```

3) 本地链与账户
```bash
# 本地测试链
solana-test-validator -r
# 设置 config 使用本地或 devnet
solana config set --url localhost # 本地
solana config set --url devnet   # 或者 devnet
# 生成本地开发用密钥
solana-keygen new --force
solana airdrop 2 # devnet 领水
```

---

## 合约设计（Anchor）
建议新建 Anchor 工程，例如 `ibom-program`：
```bash
anchor init ibom-program --typescript
```

数据建模（最小必要上链）：
- 账户 `Project`（PDA: ["project", authority, project_seed]）
  - `authority: Pubkey` 项目拥有者/维护者
  - `name: String` 项目名（限制长度）
  - `item_count: u32` 物料条目计数
  - `metadata_uri: String` 离链项目元数据（可选）
  - `bom_hash: [u8; 32]` 当前 BOM 明细的哈希指纹（可选）
- 账户 `Item`（PDA: ["item", project_pubkey, index_le]）
  - `project: Pubkey`
  - `index: u32`
  - `name: String`（限制长度）
  - `quantity: u64`
  - `unit_price: u64`
  - `metadata_uri: String`（离链明细/附件）
  - `row_hash: [u8; 32]` 单行明细哈希（可选）

核心指令（示例）：
- `init_project(name, metadata_uri)` -> 初始化 `Project` 账户。
- `add_item(name, quantity, unit_price, metadata_uri)` -> 创建 `Item` PDA，`item_count += 1`。
- `update_item(index, quantity?, unit_price?, metadata_uri?)` -> 仅维护者可改。
- `finalize(bom_hash)` -> 固化 BOM 指纹，作为审计基线。

Anchor 校验要点：
- `#[account(mut, has_one = authority)]` 约束变更权限。
- PDA 种子固定、长度受限，序列化预估空间确保 `rent_exempt`。
- 如非必要，避免存储大文本；用哈希 + URI。

---

### 面向音乐场景的模块化合约设计（落地建议）

本项目建议将“登记/定价/分账”拆为独立职责，避免巨石合约：

- 版权登记 Registry（已具备 ibom_registry，可做轻量扩展）
  - 现有：`register_work(work_id, metadata_uri, fingerprint_hash, creators_bp)` 与 `update_work(...)`。
  - 建议新增字段（可选）：
    - `linked_mint: Option<Pubkey>`：与作品绑定的 NFT Mint（便于检索/映射）。
    - `collection: Option<Pubkey>`：归属合集（便于按合集查 Work）。
    - `payment_mint: Option<Pubkey>`：建议结算币种（如 USDC）。
    - `price: Option<u64>`：建议价格（以最小单位，USDC 为 6 位）。
  - 备注：保持 Registry 为“权威分润表”，二级市场版税仍以 on-chain Metadata 的 `creators/share` 与 `seller_fee_basis_points` 为准。

- 最小分账 Splitter（新增 Program，MVP）
  - 目标：将销售/分发等收入打入池子，成员按份额可领取（SOL/SPL）。
  - 账户草图：
    ```rust
    #[account]
    pub struct Pool {
      pub bump: u8,
      pub authority: Pubkey,         // 管理员/维护者
      pub registry_work: Pubkey,     // 关联的作品（可选）
      pub token_mint: Option<Pubkey>,// None 表示 SOL；Some 为 SPL mint
      pub shares: Vec<MemberShare>,  // { pubkey, bp } 和为 10000
      pub total_received: u64,       // 已入金总额
      pub claimed: Vec<MemberClaim>, // 每成员已领取
      pub version: u32,
    }

    #[derive(AnchorSerialize, AnchorDeserialize, Clone)]
    pub struct MemberShare { pub pubkey: Pubkey, pub bp: u16 }
    #[derive(AnchorSerialize, AnchorDeserialize, Clone)]
    pub struct MemberClaim { pub pubkey: Pubkey, pub amount: u64 }
    ```
  - 指令草图：
    ```rust
    // 初始化池，按 registry 的 creators_bp 写入份额
    init_pool(work: Pubkey, token_mint: Option<Pubkey>, shares: Vec<MemberShare>)
    // 入金（SOL）
    fund_sol(amount: u64)
    // 入金（SPL），从 payer ATA 转入池子 ATA
    fund_spl(amount: u64)
    // 成员按可提金额领取（SOL）
    claim_sol(member)
    // 成员按可提金额领取（SPL）
    claim_spl(member)
    // 更新份额（仅 authority，需版本号/冻结窗口）
    set_shares(new_shares)
    ```
  - 结算要点：可提金额 = `total_received * bp/10000 - already_claimed`，需要对 `claimed` 做累加存档。

- 定价/上架（可选）
  - 轻量：将 `payment_mint/price` 存在 Registry，前端/后端遵守即可。
  - 完整：对接 Auction House 做上架/成交；成交后将资金打入 Splitter 的池子再行领取。

> 说明：NFT 与 Registry/分账保持解耦。on-chain Metadata 的 `creators/share` 用于生态（版税显示/二级市场），Registry 的 `creators_bp` 作为你们结算的“权威份额表”。

---

## 本地测试与部署
本地测试：
```bash
solana-test-validator -r  # 另一个终端持续跑
anchor test               # 运行合约测试（/tests）
```

devnet 部署：
```bash
solana config set --url devnet
solana airdrop 2
anchor build
anchor deploy
# 记录 Program ID（Anchor 部署输出会给出），并更新 Anchor.toml 与 IDL 引用
```

---

## 前端集成（ibom-demo 与 Next.js）
1) 依赖安装（在 ibom-demo 根目录）：
```bash
npm i @solana/web3.js @coral-xyz/anchor \
  @solana/wallet-adapter-react @solana/wallet-adapter-wallets \
  @solana/wallet-adapter-react-ui
```

2) 环境变量
- Vite 工程：使用 `VITE_` 前缀；Next.js 使用 `NEXT_PUBLIC_` 前缀。
- 建议添加：
```
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com  # 或你的专用 RPC
VITE_SOLANA_COMMITMENT=confirmed
VITE_IBOM_PROGRAM_ID=<部署得到的 Program ID>
```

3) 目录与文件建议
- `src/solana/idl/ibom_program.json`：从 Anchor `target/idl/ibom_program.json` 复制。
- `src/solana/provider.ts`：创建连接、Provider、Program 实例。
- `src/solana/wallet/`：封装钱包适配器上下文与 UI。

4) 示例代码
`src/solana/provider.ts`：
```ts
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { AnchorProvider, Idl, Program } from '@coral-xyz/anchor';

const RPC = import.meta.env.VITE_SOLANA_RPC_URL || clusterApiUrl('devnet');
const COMMITMENT = (import.meta.env.VITE_SOLANA_COMMITMENT as any) || 'confirmed';

export function makeConnection() {
  return new Connection(RPC, COMMITMENT);
}

export function makeProvider(wallet: any) {
  const connection = makeConnection();
  return new AnchorProvider(connection, wallet, { commitment: COMMITMENT });
}

export function makeProgram(idl: Idl, wallet: any) {
  const provider = makeProvider(wallet);
  const programId = new PublicKey(import.meta.env.VITE_IBOM_PROGRAM_ID!);
  return new Program(idl, programId, provider);
}
```

钱包上下文（简化示例）：
```tsx
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import '@solana/wallet-adapter-react-ui/styles.css';

const endpoint = import.meta.env.VITE_SOLANA_RPC_URL;

export function SolanaWallet({ children }: { children: React.ReactNode }) {
  const wallets = [new PhantomWalletAdapter(), new SolflareWalletAdapter()];
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
```

调用合约（示例）：
```ts
import idl from './idl/ibom_program.json';
import { makeProgram } from './provider';

export async function initProject(wallet: any, name: string, metadataUri: string) {
  const program = makeProgram(idl as any, wallet);
  // 根据 Anchor 合约实际 accounts / seeds 调用：
  // const [projectPda] = PublicKey.findProgramAddressSync([...], program.programId);
  return program.methods
    .initProject(name, metadataUri)
    .accounts({ /* project: projectPda, authority: wallet.publicKey, ... */ })
    .rpc();
}
```

UI 集成：
- 在应用根用 `SolanaWallet` 包装。
- 提供“连接钱包”“初始化项目”“添加物料”“归档 BOM”等按钮，调用上面方法。

注：若使用本仓库（Next.js），请参考：
- src/components/SolanaWalletProvider.tsx
- src/components/ConnectWallet.tsx
- src/lib/solana/provider.ts
- .env.local.example（NEXT_PUBLIC_* 变量）


---

## 数据与成本策略
- 上链：存项目/物料关键字段与哈希指纹；可基于行级哈希 + 总哈希（Merkle 可选）。
- 离链：明细、附件、合同等通过 IPFS/Arweave；将 URI 与哈希写入链上账户。
- 成本控制：
  - 将可变字段尽量放离链，仅保留哈希 + 校验字段上链。
  - 合同内避免动态过大字符串；限定长度并在客户端裁剪/校验。

---

## 安全与合规要点
- 权限控制：所有修改指令 `has_one = authority`，并校验 `signer`。
- PDA 设计：种子不含用户可控任意字符串；使用固定标签 + 上下文主键。
- 租金与空间：预估账户空间，保证 `rent_exempt`；避免频繁重建账户。
- 升级策略：开发阶段保留升级权限；上线后可交给 DAO 或选择弃权。
- 风险提示：对外暴露的“更新”指令需严谨约束，避免任意覆盖。

---

## Solana 与 EVM（ERC）对照与差异简述
- 状态模型：EVM 合约自带 storage；Solana Program 无状态，数据放独立账户（PDA），指令需要显式带入读写账户。
- 权限/约束：Solana 通过 `has_one/signers/seeds/bump`、PDA 种子与账户元信息约束；租金/空间需预估。
- 标准：ERC20/721/1155 ↔ SPL Token/Token-2022 + Metaplex Token Metadata（NFT/pNFT）。
- 交易：Solana 支持多指令与多签名者组合，fee-payer 可与业务签名者不同。
- 事件/索引：无原生 event log，依靠程序日志与 indexer（如 Helius）。

> 可将“职责/概念”视为一致（登记、定价、支付、分账），但实现细节与约束不同，需要以 PDA/账户驱动的方式建模与实现。

---

## 支付/结算（可选扩展）
- 直接 SOL 转账（`SystemProgram::transfer`）。
- 使用 SPL Token：
  - 使用 ATA（Associated Token Account）。
  - PDA 作为临时托管账户，释放条件上链（里程碑验收）。

---

## 监控与运维
- RPC：建议主/备双路 RPC，发生限流自动切换。
- 日志与索引：
  - 监听程序日志（`connection.onLogs`）。
  - 或用 Helius Webhook / 自建 indexer 入库（Postgres/ClickHouse）。
- 确认策略：前台读 `confirmed/finalized`，关键流转取 `finalized`。

---

## 里程碑拆分
1) S1（1 周）：Anchor PoC + 本地/Devnet 交易跑通，完成 IDL。
2) S2（1–2 周）：前端钱包接入与读写、基本 UI 完成；离链存储打通。
3) S3（1 周）：权限与约束完善、事件/索引、支付/托管 PoC。
4) S4（1 周）：安全检查、文档与演示、准备上线（如主网或企业内测网）。

---

## 与 ibom-demo 的对接清单
- 新增：
  - `src/solana/idl/ibom_program.json`
  - `src/solana/provider.ts`
  - `src/solana/wallet/*`
- 修改：
  - `.env` 增加 `VITE_SOLANA_RPC_URL`, `VITE_IBOM_PROGRAM_ID`。
  - 页面集成“连接钱包/上链记录”的交互。
- 文档：
  - 本 README 作为落地方案；合约细节补充在 `ibom-program/README.md`。

---

## 快速校验（TL;DR）
1) 按“开发环境准备”安装 Solana/Anchor。
2) `anchor init ibom-program` 并实现 `init_project/add_item/...` 指令。
3) `anchor build && anchor deploy` 获取 Program ID。
4) 将 `target/idl/ibom_program.json` 拷贝到前端 `src/solana/idl/`。
5) 前端设置 `.env` 的 RPC 与 Program ID，安装钱包适配器依赖。
6) 在页面调用示例方法，完成 devnet 上的初始化/添加物料/读取数据。

---

如需我基于此文档帮助你：
- 搭建 Anchor 合约骨架并提交到仓库；
- 在 `ibom-demo` 中创建 `src/solana` 目录与示例代码；
- 提供可运行的 PoC 页面；
请告诉我你的偏好（Vite/Next、RPC 提供商、是否需要支付/托管）。


---

## 附录 A：SPL Token 发币与治理

本节补充基于 SPL Token 的发币与与 ibom 的集成落地，覆盖技术选型、创建与治理、分发与解锁、支付/托管对接到 ibom 的完整路径。

### 1) 目标与定位
- 结算单位：在 BOM 交易中以代币作为结算/抵押单位；支持与 USDC 等稳定币并行。
- 激励工具：对完成任务、交付里程碑的参与方发放代币奖励。
- 治理与权限：作为 DAO 治理或权限加权（可选）。

### 2) 技术选型
- 标准：优先使用标准 SPL Token（Program ID: `Tokenkeg…`），兼容性最高。
- Token-2022（可选）：如果需要“转账费率/冻结/利息”等扩展，可使用 Token-2022（Program ID: `TokenzQd…`），但需评估钱包/生态支持度。
- 元数据：使用 Metaplex Token Metadata 为代币添加图标/名称/简介（推荐）。

### 3) 关键参数设计
- 符号/名称：如 `IBOM` / `iBOM Token`。
- 精度 `decimals`：常见 6 或 9，建议与 USDC/USDT 对齐（6）。
- 初始供应/增发策略：总量上限、是否后续增发；明确铸造权限变更计划。
- 权限：
  - `mint authority`：建议设为多签（2/3 或 3/5）；上线后可交由治理合约或时间锁。
  - `freeze authority`（可选）：控制冻结账户的权限；若不需要，建议置空以防滥用。
- 金库地址：团队金库/运营金库各自独立 ATA，便于审计。

### 4) 创建流程（CLI 示例）
安装工具：
```bash
cargo install spl-token-cli --locked # 或按官方文档安装
```

选择网络并准备账户：
```bash
solana config set --url devnet
solana-keygen new --force
solana airdrop 2
```

创建代币（SPL 标准，decimals=6）：
```bash
spl-token create-token --decimals 6
# 输出: 新的 Mint 地址 <MINT>
```

创建金库的关联账户（ATA）：
```bash
spl-token create-account <MINT>
# 输出: 金库 ATA 地址 <TREASURY_ATA>
```

铸造初始供应（例：1000 万，decimals=6 → 10000000000000 最小单位）：
```bash
spl-token mint <MINT> 10000000000000 <TREASURY_ATA>
```

设置权限（推荐多签）：
```bash
# 创建 2/3 多签（请替换三把公钥）
spl-token create-multisig 2 <PK1> <PK2> <PK3>
# 输出: <MULTISIG>

# 将多签设为铸造权限
spl-token authorize <MINT> mint <MULTISIG>

# 如无需冻结，直接清空冻结权限
spl-token authorize <MINT> freeze --disable
```

Token-2022（可选）创建方式：
```bash
# 注意：需指定 token-2022 的 Program ID（TokenzQd…），并按需开启扩展
spl-token create-token --decimals 6 \
  --enable-metadata --token-program-id TokenzQdBNbLqP4YEEbbYGhCKRBb9hE6Ycz9waST1d
```

记录关键信息：
- `MINT`：代币 Mint 地址（写入 `.env.local`）。
- `TREASURY_ATA`：金库账户。
- `MULTISIG`：多签地址及 M/N 规则。

### 5) 分发与解锁
- 空投/运营分发：运营脚本或前端工具按名单批量转账（建议每笔链上备注）。
- 线性/悬崖式解锁（Vesting）：
  - 方案 A：离链排程 + 周期性释放到收款人 ATA。
  - 方案 B：链上托管（Escrow/Vesting Program）按区块时间/里程碑释放。
- 黑名单/冻结（可选）：若法规需要，可用 Token-2022 冻结扩展，但需评估合规与体验。

### 6) 与 ibom 的集成
- 价格与计价：
  - 在 BOM 明细中允许以 `IBOM` 计价，或同步维护与 USDC 的估值。
  - 为每个项目或订单记录“支付代币 Mint 地址”。
- 托管与结算：
  - 买家将代币打入项目 PDA 托管账户（Program 作为托管人）。
  - 交付验收通过后，合约从托管释放到卖家的 ATA。
  - 未通过则退款（可配置手续费/仲裁）。
- 激励与罚没：
  - 完成里程碑自动发放奖励代币；逾期/违约触发罚没（从押金里扣除）。
- 前端与变量：
  - `.env.local` 增加 `NEXT_PUBLIC_IBOM_TOKEN_MINT=<Mint>`。
  - 前端使用 `@solana/spl-token` 获取余额 / 创建 ATA / 转账。

前端示例（仅示意）：
```ts
import { getAssociatedTokenAddress, getOrCreateAssociatedTokenAccount, transfer, createTransferInstruction } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';

const MINT = new PublicKey(process.env.NEXT_PUBLIC_IBOM_TOKEN_MINT!);

export async function ensureAtaAndBalance(connection, payer, owner) {
  const ata = await getOrCreateAssociatedTokenAccount(connection, payer, MINT, owner);
  return ata;
}
```

### 7) 治理与合规要点
- 多签必备：铸造/铸造权交接均需多签；避免单点风险。
- 权限收敛：上线后考虑移除冻结权、时间锁或交给 DAO/Timelock。
- 披露与审计：公开代币经济、持仓与解锁；关键交易附备注方便审计。
- 区域法规：如面向公众发售，务必遵循当地合规要求（KYC/AML 等）。

### 8) 快速清单（TL;DR）
1. 设计代币参数（符号、精度、权限、多签）。
2. `spl-token create-token --decimals 6` 获取 `MINT`。
3. 创建金库 ATA 并铸造初始供应。
4. 设置多签为 `mint authority`，冻结权限按需禁用。
5. 在 `ibom` 合约和前端配置 `MINT`，实现托管/结算/激励流程。
6. 制定分发与解锁计划，保留审计与告警。


---

## 核心能力（音乐版权/歌曲 NFT/稳定币）

本章节聚焦音乐业务的三大核心能力：
- 上链版权信息：为每首歌/作品建立不可篡改的版权登记与指纹校验。
- 歌曲 NFT 发行：按歌曲或版本（Demo/Studio/Live）发行 NFT，支持收藏或权益映射。
- 稳定币关联结算：发行或选用稳定币，作为歌曲 NFT 的标价、结算与分润介质。

### 0) 总体架构与选型
- 版权登记：Anchor Program “Registry”，最小上链（哈希 + URI + 权属/分润），大文件走 IPFS/Arweave。
- 歌曲 NFT：采用 Metaplex Token Metadata 标准（可选 pNFT），以“合集 Collection NFT + 歌曲 NFT”模式组织。
- 支付结算：优先使用现有稳定币（USDC）；如需自有稳定币（见前文 SPL Token 章节）。
- 交易撮合：采用 Metaplex Auction House（支持任意 SPL 支付），或自研 Escrow 合约实现里程碑式托管释放。

### 1) 上链版权信息（Registry）
建议为“作品 Work”设计最小上链账户（PDA: ["work", authority, work_id_hash]）：
- `authority: Pubkey`：登记发起人/主控权所有者。
- `work_id: [u8; 32]`：作品唯一标识（如 `sha256(title+iswc+extra)`）。
- `metadata_uri: String`：IPFS/Arweave 的作品元数据 JSON。
- `fingerprint_hash: [u8; 32]`：音频指纹（如 Chromaprint/自研特征）的哈希。
- `creators: Vec<{pubkey: Pubkey, share: u16}>`：作者/权利人分润比例（总和=10000）。
- `registered_at: i64`：登记时间（unix）。

流程：
1. 生成作品元数据 JSON（示例见下），上传至 IPFS/Arweave，得到 `metadata_uri`。
2. 计算 `work_id` 与 `fingerprint_hash`（客户端完成）。
3. 调用 `registry::register_work` 指令写入链上；如需更新，限制为 `authority` 并保留历史（可追加 `version` 字段）。
4. 可选：铸造一枚“版权登记 NFT（SBT 风格，禁转）”作为可视化凭证。

后端对接（HTTP 接口）：
- 已抽离为独立文档，见 `docs/api/registry.md`（包含认证、环境变量、请求/响应示例、OpenAPI 草案）。

作品元数据示例（离链 JSON）：
```json
{
  "title": "Song Title",
  "isrc": "US-ABC-24-00001",
  "iswc": "T-123.456.789-0",
  "creators": [
    { "address": "<creator1_pubkey>", "share": 7000 },
    { "address": "<creator2_pubkey>", "share": 3000 }
  ],
  "rights_note": "Master: Label A, Publishing: Pub B",
  "files": [
    { "url": "ipfs://<audio_cid>", "type": "audio/mpeg" },
    { "url": "ipfs://<cover_cid>", "type": "image/png" }
  ],
  "fingerprint": "sha256:<fingerprint_hex>"
}
```

### 2) 为不同歌曲发布 NFT（Metaplex）
发行策略：
- 合集（Collection）+ 单曲 NFT：先铸造 Collection NFT，随后每首歌铸造 1 枚或 N 枚 NFT，并“验证加入合集”。
- 元数据标准：使用 Token Metadata（名称、描述、封面、外链、属性、`seller_fee_basis_points` 版税）。
- 批量/售卖：
  - 少量自铸：直接用 SDK（`@metaplex-foundation/js`）创建与验证。
  - 批量/预售：使用 Candy Machine 创建并按白名单/时间窗铸造。
- 可选 pNFT：如需转移权限、授权播放等复杂规则，采用 pNFT（Programmable NFT）与 RuleSet。

实施步骤（自铸示意）：
1. 创建 Collection NFT（包含合集封面与说明）。
2. 对 Collection 进行“集合验证”。
3. 为每首歌生成离链元数据（含音频/封面链接与版权引用），铸造歌对应的 NFT，并设置 `collection` 指向上一步合集。
4. 将 `seller_fee_basis_points` 设置为版税（如 500=5%）；`creators` 里可写多地址分润。

前端已内置发行页（Next）：
- 路由：`src/app/nft/page.tsx`
- SDK：Metaplex Umi（`@metaplex-foundation/umi` + `mpl-token-metadata`）
- 入口：连接钱包后可一键“创建集合”与“铸造歌曲 NFT 并加入集合”。
- 默认 Collection 来自环境变量：`NEXT_PUBLIC_SONGS_COLLECTION_MINT`

元数据 JSON 示例（离链 URI 指向此结构）：
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

### 3) 发布稳定币并与歌曲 NFT 关联
目标与关系：
- 价格与结算：用稳定币（推荐 USDC）标价歌的 NFT 或访问权；购买、分润与退款流程均以稳定币计价结算。
- 关联方式：
  - Listing 层面：创建以 `paymentMint`=稳定币 的上架（Auction House），直接用稳定币买卖。
  - 合约映射：在 Registry/业务合约内为 `collection` 或 `nft_mint` 记录 `payment_mint` 与定价/策略。

两种稳定币来源：
- 直接使用 USDC：最简单、生态兼容最佳，推荐主网使用。
- 自有稳定币（见前文 SPL Token 章节）：仅在有真实抵押/合规能力时采用；否则建议仅做内部记账/实验网用途。

资金流与托管：
- 使用 Auction House：买家以稳定币下单，资金进入 AH 托管；成交后自动结算给卖家及版税地址。
- 自研 Escrow（可选）：PDA 托管稳定币，按“购买→交付→验收”流程释放或退款；结合 `creators` 进行多方分润。

合规与风控提示：
- 若“自发稳定币”，需准备储备证明、审计与法务合规；强烈建议使用 USDC/USDT 等成熟稳定币。
- 明确二级市场版税策略（部分市场可能跳过版税）。

### 4) 环境变量与前端集成要点
- `NEXT_PUBLIC_SONGS_COLLECTION_MINT`：歌曲合集 Collection 的 Mint 地址。
- `NEXT_PUBLIC_PAYMENT_MINT`：选用的稳定币 Mint（优先 USDC；或你的自有稳定币）。
- `NEXT_PUBLIC_IBOM_TOKEN_MINT`：如采用项目代币参与结算/激励（已在上文添加）。

前端建议：
- 读取 Registry 的作品信息与 `collection` 映射，展示歌曲详情、版权、价格与支付代币。
- 使用 `@metaplex-foundation/js` 读取 NFT 元数据与集合关系；使用 `@solana/spl-token` 查询余额/创建 ATA/执行转账。

### 5) 里程碑（音乐场景）
1. 版权登记 MVP：完成 Registry 合约与前端登记/查询；离链指纹与哈希校验。
2. NFT 发行：创建 Collection 与单曲 NFT，支持基本版税与合集验证。
3. 稳定币结算：以 USDC（或自有稳定币）完成上架/购买/分润；落地托管与退款逻辑。
4. 扩展与治理：引入 pNFT 权限、白名单销售、DAO 多签金库与告警审计。


---

### 环境变量清单（Next.js）
- NEXT_PUBLIC_SOLANA_RPC_URL: RPC 端点（默认 devnet）。
- NEXT_PUBLIC_SOLANA_COMMITMENT: 读写确认级别（confirmed/finalized）。
- NEXT_PUBLIC_IBOM_PROGRAM_ID: 部署后的 Anchor Program ID。
- NEXT_PUBLIC_IBOM_TOKEN_MINT: 项目代币的 Mint（如启用代币/激励）。
- NEXT_PUBLIC_SONGS_COLLECTION_MINT: 歌曲合集 Collection 的 Mint。
- NEXT_PUBLIC_PAYMENT_MINT: 稳定币的 Mint（推荐 USDC）。
- REGISTRY_PROGRAM_ID / NEXT_PUBLIC_REGISTRY_PROGRAM_ID: ibom_registry 的 Program ID（服务端/前端）。
- SOLANA_RPC_URL / SOLANA_COMMITMENT: 服务端 RPC 配置（默认继承 NEXT_PUBLIC_*）。
- Helius：HELIUS_API_KEY（可选，DAS/索引），HELIUS_DEVNET=1（devnet）。
- IPFS：NFT_STORAGE_TOKEN（可选，“上传到 IPFS”）。
- 媒体签名：MEDIA_SIGN_SECRET、MEDIA_SIGN_TTL_MS、MEDIA_STREAM_TTL_MS（可选，签名播放）。

参考代码：onchain/programs/ibom_registry/src/lib.rs
