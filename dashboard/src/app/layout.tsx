import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Revitalization Protocol — Dashboard',
  description: 'Infrastructure project monitoring powered by Chainlink CRE, CCIP, and Proof of Reserves',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        <nav className="border-b border-gray-800 px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-sm">
                RVP
              </div>
              <span className="text-lg font-semibold">Revitalization Protocol</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-400">
              <span>Sepolia Testnet</span>
              <span className="w-2 h-2 bg-green-500 rounded-full inline-block" />
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  )
}
