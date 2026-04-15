'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createResearch } from '@/lib/api';

export default function SearchForm() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [searchTerms, setSearchTerms] = useState<string[]>(['']);
  const [inclusionCriteria, setInclusionCriteria] = useState<string[]>(['']);
  const [exclusionCriteria, setExclusionCriteria] = useState<string[]>(['']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const updateList = (
    list: string[],
    setList: (v: string[]) => void,
    idx: number,
    value: string,
  ) => {
    const next = [...list];
    next[idx] = value;
    setList(next);
  };

  const addItem = (list: string[], setList: (v: string[]) => void) =>
    setList([...list, '']);

  const removeItem = (list: string[], setList: (v: string[]) => void, idx: number) =>
    setList(list.filter((_, i) => i !== idx));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const cleanTerms = searchTerms.filter((t) => t.trim());
    const cleanInc = inclusionCriteria.filter((c) => c.trim());
    const cleanExc = exclusionCriteria.filter((c) => c.trim());

    if (!query.trim() || cleanTerms.length === 0) {
      setError('연구 질문과 최소 1개의 검색어를 입력하세요.');
      return;
    }

    setLoading(true);
    try {
      const { sessionId } = await createResearch({
        query: query.trim(),
        searchTerms: cleanTerms,
        inclusionCriteria: cleanInc,
        exclusionCriteria: cleanExc,
      });
      router.push(`/results/${sessionId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '요청 실패. 백엔드 연결을 확인하세요.');
      setLoading(false);
    }
  };

  const CriteriaSection = ({
    label,
    color,
    items,
    setItems,
  }: {
    label: string;
    color: string;
    items: string[];
    setItems: (v: string[]) => void;
  }) => (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-2">
        {label}
      </label>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2">
            <input
              type="text"
              value={item}
              onChange={(e) => updateList(items, setItems, i, e.target.value)}
              placeholder={`기준 ${i + 1}`}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => removeItem(items, setItems, i)}
                className="text-gray-400 hover:text-red-500 px-2"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => addItem(items, setItems)}
        className={`mt-2 text-xs ${color} hover:underline`}
      >
        + 기준 추가
      </button>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Research Query */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          연구 질문 (Research Question)
        </label>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="예: transformer models in natural language processing"
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
      </div>

      {/* Search Terms */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          검색어 (Search Terms)
        </label>
        <div className="space-y-2">
          {searchTerms.map((term, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                value={term}
                onChange={(e) => updateList(searchTerms, setSearchTerms, i, e.target.value)}
                placeholder={`검색어 ${i + 1} (예: BERT GPT attention)`}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searchTerms.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(searchTerms, setSearchTerms, i)}
                  className="text-gray-400 hover:text-red-500 px-2"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => addItem(searchTerms, setSearchTerms)}
          className="mt-2 text-xs text-blue-600 hover:underline"
        >
          + 검색어 추가
        </button>
      </div>

      {/* Inclusion / Exclusion Criteria */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <CriteriaSection
          label="포함 기준 (Inclusion Criteria)"
          color="text-green-600"
          items={inclusionCriteria}
          setItems={setInclusionCriteria}
        />
        <CriteriaSection
          label="제외 기준 (Exclusion Criteria)"
          color="text-red-600"
          items={exclusionCriteria}
          setItems={setExclusionCriteria}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{error}</p>
      )}

      <button type="submit" disabled={loading} className="btn-primary w-full text-base py-3">
        {loading ? '파이프라인 시작 중...' : 'AI 연구 시작'}
      </button>
    </form>
  );
}
