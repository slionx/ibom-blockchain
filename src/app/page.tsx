import ConnectWallet from "@/components/ConnectWallet";

export default function Home() {
  return (
    <div className="font-sans min-h-screen p-8 sm:p-12">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-semibold">IBOM Blockchain Demo · 导航</h1>
        <ConnectWallet />
      </header>

      <main className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <a href="/nft" className="block rounded border p-4 hover:bg-gray-50 dark:hover:bg-gray-900">
          <div className="text-lg font-medium">歌曲 NFT 发行</div>
          <ul className="mt-2 text-sm text-gray-600 space-y-1">
            <li>· 创建集合（sized）与铸造歌曲</li>
            <li>· 元数据构建器（预览/上传 IPFS）</li>
            <li>· 多成员 creators（总和=100）</li>
            <li>· 智能验证加入合集，日志诊断</li>
            <li>· 查看合集作品（需 Helius Key）</li>
            <li>· 铸造后可选登记版权合约</li>
          </ul>
        </a>

        <a href="/collection" className="block rounded border p-4 hover:bg-gray-50 dark:hover:bg-gray-900">
          <div className="text-lg font-medium">查看合集作品</div>
          <ul className="mt-2 text-sm text-gray-600 space-y-1">
            <li>· 输入 Collection Mint 列出作品</li>
            <li>· 展示 mint/name/verified/元数据链接</li>
            <li>· 使用 Helius DAS，devnet 可能有延迟</li>
          </ul>
        </a>

        <a href="/player" className="block rounded border p-4 hover:bg-gray-50 dark:hover:bg-gray-900">
          <div className="text-lg font-medium">签名播放（持有者鉴权）</div>
          <ul className="mt-2 text-sm text-gray-600 space-y-1">
            <li>· SignMessage → 获取短时签名 URL</li>
            <li>· 持有歌曲或（可选）合集资产放行</li>
            <li>· 演示版 302 到元数据音频地址</li>
          </ul>
        </a>

        <a href="/registry" className="block rounded border p-4 hover:bg-gray-50 dark:hover:bg-gray-900">
          <div className="text-lg font-medium">版权登记（前端直发）</div>
          <ul className="mt-2 text-sm text-gray-600 space-y-1">
            <li>· register/update Work（Anchor）</li>
            <li>· creators（bp）总和=10000</li>
            <li>· 可配合 /api/registry/* 服务端代签</li>
          </ul>
        </a>
      </main>

      <section className="mt-8 text-xs text-gray-600 space-y-1">
        <div className="font-medium">环境提示</div>
        <div>· Helius：设置 HELIUS_API_KEY（devnet 可加 HELIUS_DEVNET=1）</div>
        <div>· IPFS：设置 NFT_STORAGE_TOKEN 以启用“上传到 IPFS”</div>
        <div>· 媒体签名：MEDIA_SIGN_SECRET，支持 /api/media/sign & /player</div>
      </section>
    </div>
  );
}
