# 04｜实战：部署合约（Anchor/CLI）

## 1) 选择部署路径
- Anchor（省心）：自动处理 IDL，上手简单；对网络质量敏感。
- solana CLI（稳健）：直传 .so，绕过 IDL 步骤；建议搭配 `--use-rpc`。

## 2) 准备 Program ID
- 生成 keypair：`solana-keygen new -o onchain/target/deploy/ibom_registry-keypair.json --no-bip39-passphrase --force`
- 推导 Program ID：`solana address -k onchain/target/deploy/ibom_registry-keypair.json`
- 写入源码：`onchain/programs/ibom_registry/src/lib.rs` 的 `declare_id!("<PROGRAM_ID>");`
- Anchor.toml：在 `[programs.devnet]` 写 `ibom_registry = "<PROGRAM_ID>"`

## 3) 构建
- `cd onchain && anchor build --provider.cluster devnet`
- 若失败：检查代理与版本；也可先 `solana program dump` 验证 RPC 可达。

## 4) 部署
- Anchor：`anchor deploy --provider.cluster devnet`
- CLI：
```bash
cd onchain
solana program deploy --use-rpc --commitment confirmed --max-sign-attempts 10 \
  --program-id target/deploy/ibom_registry-keypair.json \
  target/deploy/ibom_registry.so --url https://api.devnet.solana.com
```
- 验证：`solana program show <PROGRAM_ID>`

## 5) 上链 IDL（可选）
- `anchor idl init --provider.cluster devnet <PROGRAM_ID> -f target/idl/ibom_registry.json`
- 已存在则：`anchor idl upgrade --provider.cluster devnet <PROGRAM_ID> -f target/idl/ibom_registry.json`

## 6) 环境回填
- `.env.local`：
  - `REGISTRY_PROGRAM_ID=<PROGRAM_ID>`
  - `NEXT_PUBLIC_REGISTRY_PROGRAM_ID=<PROGRAM_ID>`

## 7) 排错
- 余额不足：给 `solana address` 多充值（部署一般 >1.6 SOL）。
- `Connection reset by peer`：启用代理或加 `--use-rpc`，更换稳定 RPC。
- 版本不匹配：`anchor --version` 与 `anchor-lang` 对齐（本仓库为 0.31.x）。

