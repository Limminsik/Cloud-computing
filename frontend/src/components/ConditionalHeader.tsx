'use client';

import { usePathname } from 'next/navigation';
import Image from 'next/image';
import HistorySidebar from '@/components/HistorySidebar';

export default function ConditionalHeader() {
  const pathname = usePathname();
  const isResults = pathname?.startsWith('/results/');

  if (isResults) return null;

  return (
    <header className="flex items-center justify-between px-6 py-3">
      <a href="https://www.gachon.ac.kr/sites/kor/index..do" target="_blank" rel="noopener noreferrer">
        <Image
          src="/gachon-logo.png"
          alt="가천대학교"
          width={140}
          height={40}
          className="object-contain"
          priority
        />
      </a>
      <nav className="flex items-center gap-4 text-sm text-gray-600">
        <HistorySidebar />
        <a href="#" className="hover:text-blue-700">내 서재</a>
        <a href="#" className="hover:text-blue-700">설정</a>
      </nav>
    </header>
  );
}
