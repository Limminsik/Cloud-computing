'use client';

import { useState } from 'react';

export interface PaperDecision {
  title: string;
  decision: string;
  reason: string;
  stage: string;
  url?: string | null;
  study_design?: string | null;
  confidence?: string | null;
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

const confidenceColor: Record<string, string> = {
  high:     'text-green-600 bg-green-50 border-green-200',
  moderate: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  low:      'text-red-500 bg-red-50 border-red-200',
};

function ScreeningCard({ paper, i, expanded, setExpanded, query }: {
  paper: PaperDecision; i: number; expanded: number | null;
  setExpanded: (v: number | null) => void; query: string;
}) {
  return (
    <div className="border border-gray-100 rounded-xl p-4 hover:shadow-sm transition-all bg-white">
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
  );
}

function EligibilityCard({ paper, i, expanded, setExpanded, query }: {
  paper: PaperDecision; i: number; expanded: number | null;
  setExpanded: (v: number | null) => void; query: string;
}) {
  const isInclude = paper.decision === 'INCLUDE';
  const ftAvailable = paper.full_text_available;
  const conf = paper.confidence?.toLowerCase() ?? 'low';
  const [showFullText, setShowFullText] = useState(false);

  return (
    <div className={`rounded-xl border transition-all bg-white hover:shadow-sm ${
      isInclude ? 'border-green-100' : 'border-red-100'
    }`}>
      {/* 상단 헤더 */}
      <div className={`px-4 py-3 rounded-t-xl flex items-start justify-between gap-3 ${
        isInclude ? 'bg-green-50/60' : 'bg-red-50/40'
      }`}>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-blue-700 leading-snug">
            {paper.url
              ? <a href={paper.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{highlight(paper.title, query)}</a>
              : highlight(paper.title, query)}
          </h3>
        </div>
        <span className={`flex-shrink-0 text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
          isInclude ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
        }`}>
          {isInclude ? '포함' : '제외'}
        </span>
      </div>

      {/* 메타 배지 행 */}
      <div className="px-4 py-2 flex flex-wrap items-center gap-1.5 border-b border-gray-50">
        {/* 전문 확보 여부 */}
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
          ftAvailable
            ? 'bg-blue-50 text-blue-600 border-blue-200'
            : 'bg-gray-50 text-gray-400 border-gray-200'
        }`}>
          {ftAvailable ? '📄 전문 확보' : '📋 초록만'}
        </span>

        {/* 연구 설계 */}
        {paper.study_design && paper.study_design !== 'Unknown' && (
          <span className="text-[10px] px-2 py-0.5 rounded-full border bg-purple-50 text-purple-600 border-purple-200">
            {paper.study_design}
          </span>
        )}

        {/* 신뢰도 */}
        {paper.confidence && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${confidenceColor[conf] ?? confidenceColor.low}`}>
            신뢰도 {conf === 'high' ? '높음' : conf === 'moderate' ? '중간' : '낮음'}
          </span>
        )}
      </div>

      {/* 판정 이유 */}
      {paper.reason && (
        <div className="px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">평가 근거</p>
          <p className={`text-xs text-gray-600 leading-relaxed ${expanded === i ? '' : 'line-clamp-3'}`}>
            {highlight(paper.reason, query)}
          </p>
          {paper.reason.length > 180 && (
            <button onClick={() => setExpanded(expanded === i ? null : i)}
              className="text-[10px] text-blue-500 hover:underline mt-1">
              {expanded === i ? '접기' : '더 보기'}
            </button>
          )}
        </div>
      )}

      {/* 확보된 전문 내용 */}
      {paper.full_text_snippet && (
        <div className="px-4 pb-3 border-t border-gray-50">
          <button
            onClick={() => setShowFullText(!showFullText)}
            className="flex items-center gap-1.5 mt-2 text-[10px] font-semibold text-blue-500 hover:text-blue-700 transition-colors"
          >
            <span>{showFullText ? '▲' : '▼'}</span>
            확보된 전문 내용 보기
            {paper.full_text_source && (
              <span className="ml-1 font-normal text-gray-400">via {paper.full_text_source}</span>
            )}
          </button>
          {showFullText && (
            <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                전문 내용 (앞부분 미리보기)
              </p>
              <p className="text-[11px] text-gray-600 leading-relaxed whitespace-pre-wrap font-mono">
                {paper.full_text_snippet}
              </p>
              <p className="text-[10px] text-gray-400 mt-2">※ 실제 평가는 최대 12,000자 기준으로 수행됨</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PaperList({ papers, query = '', isProcessing = false }: Props) {
  const [decisionFilter, setDecisionFilter] = useState<'all' | 'INCLUDE' | 'EXCLUDE'>('all');
  const [expanded, setExpanded] = useState<number | null>(null);

  const filtered = papers.filter(p =>
    decisionFilter === 'all' || p.decision === decisionFilter
  );

  const counts = {
    all:     papers.length,
    INCLUDE: papers.filter(p => p.decision === 'INCLUDE').length,
    EXCLUDE: papers.filter(p => p.decision === 'EXCLUDE').length,
  };

  const hasEligibility = papers.some(p => p.stage === 'eligibility');

  return (
    <div className="space-y-3">
      {isProcessing && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-1.5 text-xs text-blue-600 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
          AI가 논문을 심사하고 있습니다... ({papers.length}건 처리됨)
        </div>
      )}

      {/* 인라인 필터 */}
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
        {hasEligibility && (
          <span className="ml-auto text-[10px] text-gray-400">
            전문 확보 {papers.filter(p => p.stage === 'eligibility' && p.full_text_available).length} / {papers.filter(p => p.stage === 'eligibility').length}건
          </span>
        )}
      </div>

      {/* 논문 카드 목록 */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-300 text-sm">선별된 논문이 없습니다.</div>
      ) : (
        filtered.map((paper, i) =>
          paper.stage === 'eligibility'
            ? <EligibilityCard key={i} paper={paper} i={i} expanded={expanded} setExpanded={setExpanded} query={query} />
            : <ScreeningCard   key={i} paper={paper} i={i} expanded={expanded} setExpanded={setExpanded} query={query} />
        )
      )}
    </div>
  );
}
