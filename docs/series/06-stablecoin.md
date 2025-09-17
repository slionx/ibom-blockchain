# 06｜实战：发行稳定币（SPL Token 与多签）

使用 SPL-Token CLI 在 devnet 发行代币，并配置多签、金库与分发。

## 1) 前置
- `solana --version` 可用，CLI 钱包余额充足（devnet）
- 安装：`cargo install spl-token-cli --locked`（或按官方文档）

## 2) 创建代币与金库
```bash
solana config set --url https://api.devnet.solana.com
spl-token create-token --decimals 6            # 输出 Mint <MINT>
spl-token create-account <MINT>                # 输出金库 ATA <TREASURY_ATA>
spl-token mint <MINT> 1000000000 <TREASURY_ATA>  # 铸造 1000 枚(6位)
```

## 3) 多签与权限
```bash
# 创建 2/3 多签
spl-token create-multisig 2 <PK1> <PK2> <PK3>     # 输出 <MULTISIG>
# 设为 mint authority
spl-token authorize <MINT> mint <MULTISIG>
# 可选：移除冻结权限
spl-token authorize <MINT> freeze null
```

## 4) 分发与解锁
- 运营分发：`spl-token transfer <MINT> <AMOUNT> <RECIPIENT_ATA>`
- 线性/悬崖解锁：
  - 方案 A：离链排程 + 定期转账
  - 方案 B：链上 Vesting/Escrow Program（按时间或里程碑释放）

## 5) 与前端/合约集成
- 环境变量：
  - `NEXT_PUBLIC_PAYMENT_MINT=<MINT>`（前端读取余额/支付）
  - 如参与激励：`NEXT_PUBLIC_IBOM_TOKEN_MINT=<MINT>`
- 前端（`@solana/spl-token`）示意：
```ts
import { getOrCreateAssociatedTokenAccount, transfer } from '@solana/spl-token';
```

## 6) 注意事项
- Token-2022 提供扩展功能（转账费率/冻结等），生态兼容需评估
- 多签强烈建议，避免单点风险；上线后权限收敛（移除冻结、交给治理）

