'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';

export default function Mascot() {
  const pathname = usePathname();
  const isResults = pathname?.startsWith('/results/');
  const size = isResults ? 100 : 300;

  return (
    <div className="fixed bottom-6 left-6 z-30 select-none">
      <Image
        src="/mascot.png"
        alt="Gachon Scholar 마스코트"
        width={size}
        height={size}
        className="object-contain drop-shadow-md"
        priority
      />
    </div>
  );
}
