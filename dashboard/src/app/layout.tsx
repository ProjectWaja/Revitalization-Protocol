import type { Metadata } from 'next'
import './globals.css'

const networkName = process.env.NEXT_PUBLIC_NETWORK === 'tenderly'
  ? 'Tenderly Virtual TestNet'
  : process.env.NEXT_PUBLIC_NETWORK === 'anvil'
    ? 'Local Anvil'
    : 'Sepolia Testnet'

const networkColor = process.env.NEXT_PUBLIC_NETWORK === 'tenderly'
  ? 'text-purple-400'
  : 'text-gray-400'

const dotColor = process.env.NEXT_PUBLIC_NETWORK === 'tenderly'
  ? 'bg-purple-400'
  : 'bg-green-500'

export const metadata: Metadata = {
  title: 'Revitalization Protocol — Oceanwide Plaza',
  description: 'Infrastructure project monitoring powered by Chainlink CRE, CCIP, and Proof of Reserves',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        <nav className="border-b border-gray-800 px-8 py-4">
          <div className="mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-base">
                RVP
              </div>
              <span className="text-xl font-semibold">Revitalization Protocol</span>
            </div>
            <div className="flex items-center gap-4 text-base">
              <span className={networkColor}>{networkName}</span>
              <span className={`w-2 h-2 ${dotColor} rounded-full inline-block animate-pulse`} />
            </div>
          </div>
        </nav>
        <main className="px-8 py-8">{children}</main>
      </body>
    </html>
  )
}
