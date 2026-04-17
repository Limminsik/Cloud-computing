'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createResearch } from '@/lib/api';

interface Props {
  defaultValue?: string;
}

export default function HeaderSearchBar({ defaultValue = '' }: Props) {
  const router = useRouter();
  const [input, setInput] = useState(defaultValue);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const value = input.trim();
    if (!value || loading) return;
    setLoading(true);
    try {
      const { sessionId } = await createResearch({
        query: value,
        searchTerms: value.split(/[\s,]+/).filter(Boolean),
        inclusionCriteria: [],
        exclusionCriteria: [],
      });
      router.push(`/results/${sessionId}`);
    } catch {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center border border-gray-300 rounded-full px-4 py-1.5 flex-1 max-w-2xl bg-white shadow-sm hover:shadow-md transition-shadow">
      <img src="/search-icon.png" alt="" className="w-5 h-5 mr-2 flex-shrink-0 object-cover" />
      <input
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        className="flex-1 text-sm text-gray-700 bg-transparent outline-none"
        placeholder="새로운 검색어 입력..."
      />
      <button
        type="submit"
        disabled={loading}
        className="ml-2 text-blue-600 hover:text-blue-800 disabled:opacity-40 flex-shrink-0"
      >
        {loading ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
        )}
      </button>
    </form>
  );
}
