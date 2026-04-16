'use client';

import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createResearch } from '@/lib/api';

const QUOTES = [
  '무한대를 품은 가슴만이 위대하다',
  '멍든 사과에도 햇살은 스며들듯, 너의 도전에도 빛은 머문다.',
];

export default function SearchForm() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'question' | 'keyword'>('question');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setQuoteIndex((i) => (i + 1) % QUOTES.length);
        setVisible(true);
      }, 400);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const value = input.trim();
    if (!value) {
      setError('검색어를 입력하세요.');
      return;
    }
    setLoading(true);
    try {
      const payload =
        mode === 'question'
          ? { query: value, searchTerms: [value], inclusionCriteria: [], exclusionCriteria: [] }
          : { query: value, searchTerms: value.split(/[\s,]+/).filter(Boolean), inclusionCriteria: [], exclusionCriteria: [] };

      const { sessionId } = await createResearch(payload);
      router.push(`/results/${sessionId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '요청 실패. 백엔드 연결을 확인하세요.');
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center w-full max-w-xl">
      <form onSubmit={handleSubmit} className="w-full">
        {/* 검색창 */}
        <div className="flex items-center border border-gray-300 rounded-full px-4 py-2.5 shadow-sm hover:shadow-md transition-shadow bg-white">
          <img src="/search-icon.png" alt="검색" className="w-6 h-6 mr-3 flex-shrink-0 object-cover object-center" style={{ minWidth: 24 }} />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={mode === 'question' ? '연구 질문을 입력하세요...' : '검색 키워드를 입력하세요...'}
            className="flex-1 outline-none text-sm text-gray-800 bg-transparent"
            autoFocus
          />
          <button
            type="submit"
            disabled={loading}
            className="ml-2 text-blue-600 hover:text-blue-800 disabled:opacity-40 flex-shrink-0"
          >
            {loading ? (
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
            )}
          </button>
        </div>

        {/* 모드 선택 */}
        <div className="flex justify-center gap-6 mt-3 text-sm text-gray-600">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="mode"
              value="question"
              checked={mode === 'question'}
              onChange={() => setMode('question')}
              className="accent-blue-600"
            />
            연구 질문
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="mode"
              value="keyword"
              checked={mode === 'keyword'}
              onChange={() => setMode('keyword')}
              className="accent-blue-600"
            />
            키워드 검색
          </label>
        </div>

        {/* 에러 */}
        {error && (
          <p className="mt-2 text-center text-xs text-red-500">{error}</p>
        )}
      </form>

      {/* 명언 — 고정 높이로 레이아웃 안정 */}
      <div className="h-10 flex items-center justify-center mt-6">
        <p
          className="text-sm text-blue-700 italic text-center transition-opacity duration-400"
          style={{ opacity: visible ? 1 : 0 }}
        >
          {QUOTES[quoteIndex]}
        </p>
      </div>
    </div>
  );
}
