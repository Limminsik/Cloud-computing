'use client';

import { useState } from 'react';
import { PaperDecision } from './PaperList';

interface Props {
  papers: PaperDecision[];
  query?: string;
}

function highlight(text: string, query: string) {
  if (!query || !text) return text;
  const terms = query.split(/\s+/).filter(Boolean);
  const regex = new RegExp(`(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part)
      ? <mark key={i} className="bg-yellow-100 text-yellow-900 rounded px-0.5">{part}</mark>
      : part
  );
}

const confidenceMeta: Record<string, { label: string; cls: string }> = {
  high:     { label: '높음',  cls: 'bg-green-50 text-green-700 border-green-200' },
  moderate: { label: '중간',  cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  low:      { label: '낮음',  cls: 'bg-red-50 text-red-500 border-red-200' },
};

export default function EligibilityPaperList({ papers, query = ''}: Props) {
  const [filter, setFilter] = useState<'all' | 'INCLUDE' | 'EXCLUDE'>('all');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showSnippet, setShowSnippet] = useState<Set<number>>(new Set());

  const toggle = (i: number) =>
    setExpanded(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s; });

  const toggleSnippet = (i: number) =>
    setShowSnippet(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s; });

  const eligPapers = papers.filter(p => p.stage === 'eligibility');
  const filtered   = eligPapers.filter(p => filter === 'all' || p.decision === filter);

  const counts = {
    all:     eligPapers.length,
    INCLUDE: eligPapers.filter(p => p.decision === 'INCLUDE').length,
    EXCLUDE: eligPapers.filter(p => p.decision === 'EXCLUDE').length,
    ft:      eligPapers.filter(p => p.full_text_available).length,
  };

  return (
    <div className="space-y-3">
      {/* 필터 버튼 */}
      <div className="flex items-center gap-2">
        {(['all', 'INCLUDE', 'EXCLUDE'] as const).map(d => (
          <button key={d} onClick={() => setFilter(d)}
            className={`text-[11px] px-2.5 py-0.5 rounded-full border transition-colors ${
              filter === d
                ? d === 'INCLUDE' ? 'bg-green-50 text-green-700 border-green-200 font-semibold'
                  : d === 'EXCLUDE' ? 'bg-red-50 text-red-600 border-red-200 font-semibold'
                  : 'bg-gray-100 text-gray-700 border-gray-200 font-semibold'
                : 'text-gray-400 border-gray-100 hover:bg-gray-50'
            }`}>
            {d === 'all' ? `전체 ${counts.all}` : d === 'INCLUDE' ? `포함 ${counts.INCLUDE}` : `제외 ${counts.EXCLUDE}`}
          </button>
        ))}
      </div>

      {/* 요약 통계 — 필터 아래 */}
      {eligPapers.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-1 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
            <span className="text-green-600">{counts.INCLUDE}건 포함</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
            <span className="text-red-500">{counts.EXCLUDE}건 제외</span>
          </span>
          <span className="flex items-center gap-1 text-gray-400">
            📄 전문 확보 {counts.ft} / {counts.all}건
          </span>
        </div>
      )}

      {/* 카드 목록 */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-300 text-sm">적격성 평가 결과가 없습니다.</div>
      ) : (
        filtered.map((paper, i) => {
          const isInclude  = paper.decision === 'INCLUDE';
          const ft         = paper.full_text_available;
          const conf       = (paper.confidence ?? 'low').toLowerCase();
          const confMeta   = confidenceMeta[conf] ?? confidenceMeta.low;
          const isExpanded = expanded.has(i);
          const snippetOpen = showSnippet.has(i);

          return (
            <div key={i} className={`rounded-xl border bg-white overflow-hidden transition-all hover:shadow-sm ${
              isInclude ? 'border-green-100' : 'border-red-100'
            }`}>

              {/* 카드 헤더 */}
              <div className={`px-4 pt-3 pb-2 ${isInclude ? 'bg-green-50/50' : 'bg-red-50/30'}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-blue-700 leading-snug">
                      {paper.url
                        ? <a href={paper.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            {highlight(paper.title, query)}
                          </a>
                        : highlight(paper.title, query)}
                    </h3>
                  </div>
                  <span className={`flex-shrink-0 text-[10px] font-bold px-2.5 py-0.5 rounded-full mt-0.5 ${
                    isInclude ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                  }`}>
                    {isInclude ? '포함' : '제외'}
                  </span>
                </div>

                {/* 메타 배지 */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                    ft ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-gray-50 text-gray-400 border-gray-200'
                  }`}>
                    {ft ? '📄 전문 확보' : '📋 초록만'}
                  </span>

                  {paper.study_design && paper.study_design !== 'Unknown' && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full border bg-purple-50 text-purple-600 border-purple-200">
                      {paper.study_design}
                    </span>
                  )}

                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${confMeta.cls}`}>
                    신뢰도 {confMeta.label}
                  </span>
                </div>
              </div>

              {/* 평가 근거 */}
              {paper.reason && (
                <div className="px-4 py-3 border-t border-gray-50">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                    평가 근거
                  </p>
                  <p className={`text-xs text-gray-600 leading-relaxed ${isExpanded ? '' : 'line-clamp-3'}`}>
                    {highlight(paper.reason, query)}
                  </p>
                  {paper.reason.length > 200 && (
                    <button onClick={() => toggle(i)}
                      className="text-[10px] text-blue-500 hover:underline mt-1.5">
                      {isExpanded ? '접기' : '전체 보기'}
                    </button>
                  )}
                </div>
              )}

              {/* 확보된 전문 내용 */}
              {paper.full_text_snippet && (
                <div className="px-4 pb-3 border-t border-gray-50">
                  <button
                    onClick={() => toggleSnippet(i)}
                    className="flex items-center gap-1.5 mt-2 text-[10px] font-semibold text-blue-500 hover:text-blue-700 transition-colors"
                  >
                    <span>{snippetOpen ? '▲' : '▼'}</span>
                    확보된 전문 내용 보기
                    {paper.full_text_source && (
                      <span className="ml-1 font-normal text-gray-400">via {paper.full_text_source}</span>
                    )}
                  </button>
                  {snippetOpen && (
                    <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                        전문 내용 (앞부분 미리보기)
                      </p>
                      <p className="text-[11px] text-gray-600 leading-relaxed whitespace-pre-wrap font-mono">
                        {paper.full_text_snippet}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-2">
                        ※ 실제 평가는 최대 12,000자 기준으로 수행됨
                      </p>
                    </div>
                  )}
                </div>
              )}

            </div>
          );
        })
      )}
    </div>
  );
}
