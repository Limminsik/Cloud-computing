'use client';

import { useState, FormEvent, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createResearch, generateTerms, previewSearch, SearchTerms } from '@/lib/api';

const QUOTES = [
  '무한대를 품은 가슴만이 위대하다',
  '멍든 사과에도 햇살은 스며들듯, 너의 도전에도 빛은 머문다.',
];

type Phase = 'input' | 'generating' | 'review' | 'previewing' | 'preview' | 'searching';

interface PreviewCounts {
  pubmed: number | null;
  semantic_scholar: number | null;
}

export default function SearchForm() {
  const router = useRouter();

  const [researchQuestion, setResearchQuestion] = useState('');
  const [keywordsInput, setKeywordsInput]       = useState('');
  const [phase, setPhase]                       = useState<Phase>('input');
  const [error, setError]                       = useState('');
  const [terms, setTerms]                       = useState<SearchTerms | null>(null);
  const [editedQuery, setEditedQuery]           = useState('');
  const [isStarting, setIsStarting]             = useState(false);
  const [quoteIndex, setQuoteIndex]             = useState(0);
  const [visible, setVisible]                   = useState(true);
  const [preview, setPreview]                   = useState<PreviewCounts | null>(null);
  const keywordsRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => { setQuoteIndex(i => (i + 1) % QUOTES.length); setVisible(true); }, 400);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const parsedKeywords = keywordsInput
    .split(/[,\n]/)
    .map(k => k.trim())
    .filter(Boolean);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const question = researchQuestion.trim();
    if (!question) { setError('연구 목적을 입력하세요.'); return; }
    setError('');
    setPhase('generating');
    try {
      const res = await generateTerms(question, parsedKeywords);
      if (res.status === 'ok' && res.terms) {
        setTerms(res.terms);
        setEditedQuery(res.terms.boolean_query || question);
      } else {
        setEditedQuery(question);
        setTerms(null);
      }
    } catch {
      setEditedQuery(question);
      setTerms(null);
    }
    setPhase('review');
  };

  const handlePreview = async () => {
    setPhase('previewing');
    try {
      const res = await previewSearch(editedQuery.trim(), researchQuestion.trim());
      setPreview(res.counts);
    } catch {
      setPreview({ pubmed: null, semantic_scholar: null });
    }
    setPhase('preview');
  };

  const handleStartSearch = async () => {
    setIsStarting(true);
    setPhase('searching');
    try {
      const { sessionId } = await createResearch({
        query: researchQuestion.trim(),
        keywords: parsedKeywords,
        booleanQuery: editedQuery.trim(),
        searchTerms: [],
        inclusionCriteria: [],
        exclusionCriteria: [],
      });
      router.push(`/results/${sessionId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '요청 실패. 백엔드 연결을 확인하세요.');
      setIsStarting(false);
      setPhase('preview');
    }
  };

  const handleReset = () => {
    setPhase('input');
    setTerms(null);
    setPreview(null);
    setError('');
  };

  const handleBackToReview = () => {
    setPhase('review');
    setPreview(null);
    setError('');
  };

  // ── input ───────────────────────────────────────────────────────────────────
  if (phase === 'input') {
    return (
      <div className="flex flex-col items-center w-full max-w-xl gap-3">
        <form onSubmit={handleSubmit} className="w-full space-y-2">
          <div className="border border-gray-300 rounded-2xl px-4 py-3 bg-white shadow-sm hover:shadow-md transition-shadow">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">연구 목적</p>
            <input
              type="text"
              value={researchQuestion}
              onChange={e => setResearchQuestion(e.target.value)}
              onKeyDown={e => { if (e.key === 'Tab') { e.preventDefault(); keywordsRef.current?.focus(); } }}
              placeholder="예: ECG signal quality assessment methods in wearable devices"
              className="w-full outline-none text-sm text-gray-800 bg-transparent placeholder-gray-300"
              autoFocus
            />
          </div>

          <div className="border border-gray-200 rounded-2xl px-4 py-3 bg-white shadow-sm hover:shadow-md transition-shadow">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">연구 키워드</p>
            <input
              ref={keywordsRef}
              type="text"
              value={keywordsInput}
              onChange={e => setKeywordsInput(e.target.value)}
              placeholder="예: ECG, signal quality, noise, artifact  (쉼표로 구분)"
              className="w-full outline-none text-sm text-gray-800 bg-transparent placeholder-gray-300"
            />
            {parsedKeywords.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {parsedKeywords.map((k, i) => (
                  <span key={i} className="text-[10px] bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">{k}</span>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-500 text-center">{error}</p>}

          <button
            type="submit"
            disabled={!researchQuestion.trim()}
            className="w-full py-2.5 rounded-full bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-40"
          >
            Search Terms 생성 →
          </button>
        </form>

        <div className="h-8 flex items-center justify-center">
          <p className="text-sm text-blue-700 italic text-center transition-opacity duration-400" style={{ opacity: visible ? 1 : 0 }}>
            {QUOTES[quoteIndex]}
          </p>
        </div>
      </div>
    );
  }

  // ── generating ──────────────────────────────────────────────────────────────
  if (phase === 'generating') {
    return (
      <div className="w-full max-w-xl border border-gray-200 rounded-2xl p-5 bg-white shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-ping inline-block flex-shrink-0" />
          <p className="text-sm font-semibold text-gray-700">Search Terms 생성 중...</p>
        </div>
        <p className="text-xs text-gray-400 mb-3">PICO 분석 · MeSH Terms · Search Terms 생성</p>
        <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-1">
          <p className="text-xs text-gray-500 italic">"{researchQuestion}"</p>
          {parsedKeywords.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {parsedKeywords.map((k, i) => (
                <span key={i} className="text-[10px] bg-blue-50 text-blue-500 border border-blue-100 rounded-full px-2 py-0.5">{k}</span>
              ))}
            </div>
          )}
        </div>
        <div className="mt-4 space-y-2">
          {['PICO 분석', 'MeSH Terms 매핑', 'Search Terms 구성'].map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-pulse flex-shrink-0" style={{ animationDelay: `${i * 0.3}s` }} />
              <p className="text-xs text-gray-400">{step}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── review ──────────────────────────────────────────────────────────────────
  if (phase === 'review') {
    return (
      <div className="flex flex-col items-center w-full max-w-2xl space-y-3">
        <div className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3 flex items-start gap-3">
          <button onClick={handleReset} className="text-gray-400 hover:text-gray-600 flex-shrink-0 mt-0.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 space-y-1 min-w-0">
            <p className="text-sm text-gray-700">
              <span className="text-[10px] font-semibold text-gray-400 uppercase mr-2">연구 목적</span>
              {researchQuestion}
            </p>
            {parsedKeywords.length > 0 && (
              <div className="flex flex-wrap gap-1 items-center">
                <span className="text-[10px] font-semibold text-gray-400 uppercase mr-1">키워드</span>
                {parsedKeywords.map((k, i) => (
                  <span key={i} className="text-[10px] bg-gray-200 text-gray-600 rounded-full px-2 py-0.5">{k}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {terms ? (
          <div className="w-full bg-white border border-blue-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-blue-50 px-5 py-4 border-b border-blue-100">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                <p className="text-sm font-bold text-blue-800">{terms.domain || 'Search Terms 분석 완료'}</p>
                <span className="text-[10px] text-blue-400 ml-auto">Identification Agent</span>
              </div>
              {terms.reasoning && (
                <p className="text-sm text-blue-700 leading-relaxed">{terms.reasoning}</p>
              )}
            </div>

            <div className="p-5 space-y-4">
              {terms.concept_groups && terms.concept_groups.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">개념 확장</p>
                  <div className="space-y-2.5">
                    {terms.concept_groups.map((g, i) => (
                      <div key={i} className="flex items-start gap-2 border-l-2 border-blue-200 pl-2.5">
                        <span className="text-[11px] font-semibold text-gray-700 whitespace-nowrap leading-5 flex-shrink-0 min-w-[80px]">{g.concept}</span>
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {g.synonyms.map((s, j) => (
                            <span key={j} className="text-[10px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 leading-4">{s}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {terms.mesh_terms && terms.mesh_terms.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">MeSH Terms</p>
                  <div className="flex flex-wrap gap-1.5">
                    {terms.mesh_terms.map((t, i) => (
                      <span key={i} className="text-[10px] bg-purple-50 border border-purple-200 text-purple-700 rounded-full px-2.5 py-0.5">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Search Terms
                  <span className="ml-1 text-gray-400 font-normal normal-case">(직접 수정 가능)</span>
                </p>
                <textarea
                  value={editedQuery}
                  onChange={e => {
                    setEditedQuery(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                  }}
                  ref={el => {
                    if (el) {
                      el.style.height = 'auto';
                      el.style.height = el.scrollHeight + 'px';
                    }
                  }}
                  rows={3}
                  className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-300 bg-gray-50 font-mono text-gray-700 overflow-hidden"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-700">
            Search Terms 자동 생성에 실패했습니다. 원문으로 검색합니다.
          </div>
        )}

        <div className="w-full flex gap-3">
          <button
            onClick={handleReset}
            className="flex-1 py-2.5 rounded-full border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
          >
            다시 입력
          </button>
          <button
            onClick={handlePreview}
            className="flex-[2] py-2.5 rounded-full bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            검색 범위 미리보기 →
          </button>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  // ── previewing ──────────────────────────────────────────────────────────────
  if (phase === 'previewing') {
    return (
      <div className="w-full max-w-xl border border-gray-200 rounded-2xl p-5 bg-white shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-ping inline-block flex-shrink-0" />
          <p className="text-sm font-semibold text-gray-700">검색 범위 확인 중...</p>
        </div>
        <div className="space-y-2">
          {['PubMed', 'Semantic Scholar'].map((db, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-xl">
              <span className="text-xs text-gray-600">{db}</span>
              <span className="w-16 h-3 bg-gray-200 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── preview result ──────────────────────────────────────────────────────────
  if (phase === 'preview') {
    const counts = preview ?? { pubmed: null, semantic_scholar: null };
    const total  = (counts.pubmed ?? 0) + (counts.semantic_scholar ?? 0);
    const isNarrow = total > 0 && total < 100;
    const isBroad  = total > 50000;

    return (
      <div className="flex flex-col items-center w-full max-w-xl gap-3">
        <div className="w-full border border-gray-200 rounded-2xl p-5 bg-white shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">DB 검색 미리보기</p>

          <div className="space-y-2 mb-4">
            {[
              { label: 'PubMed',           count: counts.pubmed,           color: 'bg-blue-400' },
              { label: 'Semantic Scholar', count: counts.semantic_scholar, color: 'bg-indigo-400' },
            ].map(({ label, count, color }) => {
              const pct = total > 0 && count !== null ? Math.round((count / total) * 100) : 0;
              return (
                <div key={label} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">{label}</span>
                    <span className="text-xs font-semibold text-gray-700">
                      {count !== null ? count.toLocaleString() + '건' : '조회 실패'}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className={`rounded-xl px-3 py-2 text-xs ${
            isBroad  ? 'bg-amber-50 text-amber-700' :
            isNarrow ? 'bg-red-50 text-red-600' :
                       'bg-green-50 text-green-700'
          }`}>
            {isBroad
              ? `총 ${total.toLocaleString()}건 — 검색 범위가 넓습니다. Search Terms를 좁히는 것을 권장합니다.`
              : isNarrow
              ? `총 ${total.toLocaleString()}건 — 검색 결과가 적습니다. Search Terms를 넓히는 것을 권장합니다.`
              : `총 ${total.toLocaleString()}건 — 적절한 검색 범위입니다.`}
          </div>
        </div>

        <div className="w-full flex gap-3">
          <button
            onClick={handleBackToReview}
            className="flex-1 py-2.5 rounded-full border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
          >
            ← 검색어 수정
          </button>
          <button
            onClick={handleStartSearch}
            disabled={isStarting}
            className="flex-[2] py-2.5 rounded-full bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isStarting ? '검색 시작 중...' : '이 검색어로 논문 검색 시작 →'}
          </button>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  // ── searching ───────────────────────────────────────────────────────────────
  return (
    <div className="flex items-center gap-3">
      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping inline-block" />
      <p className="text-sm text-gray-600">DB 검색을 시작하고 있습니다...</p>
    </div>
  );
}
