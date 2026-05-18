'use client';

import { useState } from 'react';

export interface PaperDecision {
  title: string;
  decision: string;
  reason: string;
  stage: string;
  url?: string | null;
  year?: number | null;
  venue?: string | null;
  // eligibility structured fields
  article_type?: string | null;
  exclude_reason_category?: string | null;
  pico?: { population?: string | null; intervention?: string | null; comparison?: string | null; outcome?: string | null } | null;
  key_findings?: string | null;
  limitations?: string | null;
  full_text_available?: boolean | null;
  full_text_source?: string | null;
  full_text_snippet?: string | null;
}

interface Props {
  papers: PaperDecision[];
  query?: string;
  isProcessing?: boolean;
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

export default function PaperList({ papers, query = '', isProcessing = false }: Props) {
  const [decisionFilter, setDecisionFilter] = useState<'all' | 'INCLUDE' | 'EXCLUDE'>('all');
  const [expanded, setExpanded] = useState<number | null>(null);

  const screeningPapers = papers.filter(p => p.stage === 'screening');
  const filtered = screeningPapers.filter(p =>
    decisionFilter === 'all' || p.decision === decisionFilter
  );

  const counts = {
    all:     screeningPapers.length,
    INCLUDE: screeningPapers.filter(p => p.decision === 'INCLUDE').length,
    EXCLUDE: screeningPapers.filter(p => p.decision === 'EXCLUDE').length,
  };

  return (
    <div className="space-y-3">
      {isProcessing && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-1.5 text-xs text-blue-600 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
          AI가 논문을 심사하고 있습니다... ({screeningPapers.length}건 처리됨)
        </div>
      )}

      {/* 필터 */}
      <div className="flex items-center gap-2">
        {(['all', 'INCLUDE', 'EXCLUDE'] as const).map(d => (
          <button key={d} onClick={() => setDecisionFilter(d)}
            className={`text-[11px] px-2.5 py-0.5 rounded-full border transition-colors ${
              decisionFilter === d
                ? d === 'INCLUDE' ? 'bg-green-50 text-green-700 border-green-200 font-semibold'
                  : d === 'EXCLUDE' ? 'bg-red-50 text-red-600 border-red-200 font-semibold'
                  : 'bg-gray-100 text-gray-700 border-gray-200 font-semibold'
                : 'text-gray-400 border-gray-100 hover:bg-gray-50'
            }`}>
            {d === 'all' ? `전체 ${counts.all}` : d === 'INCLUDE' ? `포함 ${counts.INCLUDE}` : `제외 ${counts.EXCLUDE}`}
          </button>
        ))}
      </div>

      {/* 카드 목록 */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-300 text-sm">선별된 논문이 없습니다.</div>
      ) : (
        filtered.map((paper, i) => (
          <div key={i} className="border border-gray-100 rounded-xl p-4 hover:shadow-sm transition-all bg-white">
            <div className="flex items-start justify-between gap-3 mb-1">
              <h3 className="text-sm font-semibold text-blue-700 leading-snug flex-1">
                {paper.url
                  ? <a href={paper.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{highlight(paper.title, query)}</a>
                  : highlight(paper.title, query)}
              </h3>
              <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                paper.decision === 'INCLUDE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
              }`}>
                {paper.decision === 'INCLUDE' ? '포함' : '제외'}
              </span>
            </div>
            {paper.reason && (
              <>
                <p className={`text-xs text-gray-500 leading-relaxed ${expanded === i ? '' : 'line-clamp-2'}`}>
                  {highlight(paper.reason, query)}
                </p>
                {paper.reason.length > 120 && (
                  <button onClick={() => setExpanded(expanded === i ? null : i)}
                    className="text-[10px] text-blue-500 hover:underline mt-1">
                    {expanded === i ? '접기' : '더 보기'}
                  </button>
                )}
              </>
            )}
          </div>
        ))
      )}
    </div>
  );
}
