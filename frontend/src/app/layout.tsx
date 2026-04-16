import type { Metadata } from 'next';
import './globals.css';
import Mascot from '@/components/Mascot';
import ConditionalHeader from '@/components/ConditionalHeader';
import localFont from 'next/font/local';

const iris = localFont({
  src: '../../public/fonts/Pretendard-SemiBold.otf',
  variable: '--font-iris',
});

export const metadata: Metadata = {
  title: 'Gachon Scholar',
  description: 'AI 기반 체계적 문헌 고찰 자동화',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`min-h-screen bg-white ${iris.variable}`}>
        <ConditionalHeader />
        <main>{children}</main>
        <Mascot />
        <footer className="fixed bottom-0 left-0 right-0 flex justify-end px-6 py-2 text-[11px] text-gray-400">
          © {new Date().getFullYear()} 가천대학교 일반대학원
        </footer>
      </body>
    </html>
  );
}
