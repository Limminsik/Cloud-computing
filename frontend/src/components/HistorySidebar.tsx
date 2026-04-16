'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { listSessions, ResearchSession } from '@/lib/api';

export default function HistorySidebar() {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<ResearchSession[]>([]);

  useEffect(() => {
    if (open) {
      listSessions()
        .then(setSessions)
        .catch(() => setSessions([]));
    }
  }, [open]);

  const statusLabel = (s: string) => {
    if (s === 'done') return <span className="text-green-600 text-xs">완료</span>;
    if (s === 'running') return <span className="text-blue-500 text-xs animate-pulse">실행 중</span>;
    if (s === 'error') return <span className="text-red-500 text-xs">오류</span>;
    return <span className="text-gray-400 text-xs">{s}</span>;
  };

  return (
    <>
      {/* 내 연구 버튼 */}
      <button
        onClick={() => setOpen(true)}
        className="hover:text-blue-700 text-sm text-gray-600 transition-colors"
      >
        내 연구
      </button>

      {/* 오버레이 */}
      {open && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* 사이드바 패널 */}
      <div
        className={`fixed right-0 top-0 h-full w-72 bg-white shadow-xl z-50 transform transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">내 연구</h2>
          <button
            onClick={() => setOpen(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto h-[calc(100%-56px)]">
          {sessions.length === 0 ? (
            <p className="text-center text-sm text-gray-400 mt-10">검색 기록이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {sessions.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/results/${s.id}`}
                    onClick={() => setOpen(false)}
                    className="block px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <p className="text-sm text-gray-800 font-medium truncate">{s.query}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-gray-400">
                        {new Date(s.createdAt).toLocaleString('ko-KR', {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                      {statusLabel(s.status)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
