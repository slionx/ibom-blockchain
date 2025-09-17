# 01｜环境安装与验证（含重装与网络代理）

适用平台：macOS（Apple Silicon/Intel）。目标：可在 Devnet 构建与部署，并运行前端/API。

## 1. 代理配置（可选但强烈建议）
- 临时生效：
  - `export http_proxy=http://127.0.0.1:7890`
  - `export https_proxy=http://127.0.0.1:7890`
  - `export HTTP_PROXY=$http_proxy; export HTTPS_PROXY=$https_proxy`
- 验证联网：`curl -I https://api.devnet.solana.com`

## 2. Node & 包管理
- 安装 nvm：
  - `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash`
  - `exec zsh`
- 安装 Node LTS：`nvm install --lts && nvm use --lts`
- 验证：`node -v`（≥18）

## 3. Rust & Cargo
- 安装：`curl https://sh.rustup.rs -sSf | sh -s -- -y && source $HOME/.cargo/env`
- 验证：`rustc --version && cargo --version`

## 4. Solana CLI
- 推荐（官方脚本）：
  - `sh -c "$(curl -sSfL https://release.solana.com/stable/install)"`
  - 将 PATH 加入 `~/.zshrc`：
    - `echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.zshrc && exec zsh`
- 或 Homebrew：`brew install solana`
- 验证：
  - `which solana`
  - `solana --version`
  - `solana-keygen --version`
  - `solana-test-validator --version`

## 5. Anchor CLI（avm）
- 安装 AVM：`cargo install --git https://github.com/coral-xyz/anchor avm --locked`
- 安装/使用 Anchor 0.31.x：
  - `avm install 0.31.1`
  - `avm use 0.31.1`
  - `anchor --version`（应为 0.31.x）
- 工程依赖已对齐：`onchain/Cargo.toml` 使用 `anchor-lang = "0.31.1"`

## 6. 验证 Devnet 连接
- 设置 devnet：`solana config set --url https://api.devnet.solana.com`
- 检查：`solana cluster-version && solana ping -c 1`
- 账户：
  - 生成/覆盖：`solana-keygen new --no-bip39-passphrase --force`
  - 地址：`solana address`
  - 余额：`solana balance`
  - 空投（可能限流，多试或用钱包转账）：`solana airdrop 2`

## 7. 项目依赖与启动
- 安装依赖：`npm install`
- 复制配置：`cp .env.local.example .env.local`
- 最小配置（devnet）：
  - `NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com`
  - `SOLANA_RPC_URL=https://api.devnet.solana.com`
- 启动前端：`npm run dev` → http://localhost:3000

## 8. 常见问题
- compinit 提示目录不安全：按提示 `compaudit` 并 `chmod go-w <目录>`；或修复 Homebrew 的 `share/zsh` 权限。
- `Connection reset by peer`：网络未走代理或被拦截；设置代理并更换更稳的 RPC。
- Anchor 与 anchor-lang 版本不一致：按本篇对齐到 0.31.x。

## 9. 重装/清理指南（遇到异常时）
- 移除 Solana 脚本安装：`rm -rf ~/.local/share/solana`（注意 PATH）
- Homebrew 卸载：`brew uninstall solana`
- AVM/Anchor：`rm -rf ~/.avm && cargo uninstall anchor-cli || true`
- Rustup：可选 `rustup self uninstall`（需重装 Rust）
- 清理后按本篇重新安装。

