import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'DeFi LP Dashboard | Uniswap v3 Analytics',
  description: 'AI-powered analytics platform for Uniswap v3 liquidity providers',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
          {/* Header */}
          <header className="bg-white shadow-sm border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-blue-600 rounded-lg flex items-center justify-center">
                    <span className="text-white text-xl font-bold">LP</span>
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">DeFi LP Dashboard</h1>
                    <p className="text-sm text-gray-500">Uniswap v3 Analytics</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                    Beta
                  </span>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>

          {/* Footer */}
          <footer className="mt-16 bg-white border-t border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <p className="text-center text-sm text-gray-500">
                Built with ❤️ for DeFi liquidity providers | Powered by DeBank & Uniswap
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  )
}
