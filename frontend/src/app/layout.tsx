import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PRISMA AI Research Agent',
  description: 'Automated systematic literature review using PRISMA methodology',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen">
        <header className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">P</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">PRISMA AI Research Agent</h1>
              <p className="text-xs text-gray-500">Automated Systematic Literature Review</p>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
