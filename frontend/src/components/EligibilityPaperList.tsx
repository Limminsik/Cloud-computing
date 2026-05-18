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

const EXCLUDE_REASON_LABEL: Record<string, string> = {
  study_design: '연구 설계 부적합',
  population:   '대상 집단 불일치',
  outcome:      '결과 지표 불일치',
  language:     '언어 기준 미충족',
  duplicate:    '중복 문헌',
  other:        '기타 사유',
};

const PICO_LABELS = [
  { key: 'population',    label: 'P', desc: '대상(Population)' },
  { key: 'intervention',  label: 'I', desc: '중재(Intervention)' },
  { key: 'comparison',    label: 'C', desc: '비교(Comparison)' },
  { key: 'outcome',       label: 'O', desc: '결과(Outcome)' },
] as const;

function ExcludedCard({ paper, query }: { paper: PaperDecision; query: string }) {
  const [expanded, setExpanded] = useState(false);
  const category = paper.exclude_reason_category;

  return (
    <div className="flex gap-0 rounded-xl overflow-hidden border border-red-100 bg-white hover:shadow-sm transition-all">
      {/* 왼쪽 색상 선 */}
      <div className="w-1 flex-shrink-0 bg-red-300" />

      <div className="flex-1 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-700 leading-snug">
              {paper.url
                ? <a href={paper.url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 hover:underline transition-colors">
                    {highlight(paper.title, query)}
                  </a>
                : highlight(paper.title, query)}
            </h3>
            {(paper.year || paper.venue) && (
              <p className="text-[11px] text-gray-400 mt-0.5">
                {[paper.year, paper.article_type, paper.venue].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <span className="flex-shrink-0 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-red-100 text-red-600 mt-0.5">
            제외
          </span>
        </div>

        {/* 제외 사유 카테고리 */}
        {category && (
          <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-red-500">
            <span className="w-1 h-1 rounded-full bg-red-400 inline-block" />
            {EXCLUDE_REASON_LABEL[category] ?? category}
          </div>
        )}

        {/* 판단 근거 */}
        {paper.reason && (
          <div className="mt-2">
            <p className={`text-xs text-gray-500 leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
              {highlight(paper.reason, query)}
            </p>
            {paper.reason.length > 120 && (
              <button onClick={() => setExpanded(!expanded)}
                className="text-[10px] text-gray-400 hover:text-blue-500 mt-0.5">
                {expanded ? '접기' : '더 보기'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function IncludedCard({ paper, query }: { paper: PaperDecision; query: string }) {
  const [showSnippet, setShowSnippet] = useState(false);
  const pico = paper.pico;
  const hasPico = pico && Object.values(pico).some(v => v);

  return (
    <div className="flex gap-0 rounded-xl overflow-hidden border border-green-100 bg-white hover:shadow-sm transition-all">
      {/* 왼쪽 색상 선 */}
      <div className="w-1 flex-shrink-0 bg-green-400" />

      <div className="flex-1">
        {/* 헤더 */}
        <div className="px-4 pt-3 pb-2 bg-green-50/40">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-800 leading-snug">
                {paper.url
                  ? <a href={paper.url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 hover:underline transition-colors">
                      {highlight(paper.title, query)}
                    </a>
                  : highlight(paper.title, query)}
              </h3>
              {(paper.year || paper.article_type || paper.venue) && (
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {[paper.year, paper.article_type, paper.venue].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-green-100 text-green-700">
                포함
              </span>
              {paper.full_text_available !== null && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                  paper.full_text_available
                    ? 'text-blue-500 bg-blue-50'
                    : 'text-gray-400 bg-gray-50'
                }`}>
                  {paper.full_text_available ? '📄 전문' : '📋 초록'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 판단 근거 */}
        {paper.reason && (
          <div className="px-4 py-3 border-t border-green-50">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
              포함 근거
            </p>
            <p className="text-xs text-gray-600 leading-relaxed">
              {highlight(paper.reason, query)}
            </p>
          </div>
        )}

        {/* PICO 분석 */}
        {hasPico && (
          <div className="px-4 py-3 border-t border-green-50">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              PICO 분석
            </p>
            <div className="grid grid-cols-1 gap-1.5">
              {PICO_LABELS.map(({ key, label, desc }) => {
                const val = pico?.[key];
                if (!val) return null;
                return (
                  <div key={key} className="flex gap-2 items-start">
                    <span className="flex-shrink-0 w-5 h-5 rounded bg-green-100 text-green-700 text-[10px] font-bold flex items-center justify-center mt-0.5">
                      {label}
                    </span>
                    <div>
                      <span className="text-[10px] text-gray-400">{desc}</span>
                      <p className="text-xs text-gray-700 leading-snug">{val}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 핵심 결과 */}
        {paper.key_findings && (
          <div className="px-4 py-3 border-t border-green-50">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
              핵심 결과
            </p>
            <p className="text-xs text-gray-700 leading-relaxed">
              {highlight(paper.key_findings, query)}
            </p>
          </div>
        )}

        {/* 제한점 */}
        {paper.limitations && (
          <div className="px-4 py-2 border-t border-green-50">
            <p className="text-[10px] text-gray-400">
              <span className="font-semibold">제한점:</span> {paper.limitations}
            </p>
          </div>
        )}

        {/* 전문 미리보기 */}
        {paper.full_text_snippet && (
          <div className="px-4 pb-3 border-t border-green-50">
            <button
              onClick={() => setShowSnippet(!showSnippet)}
              className="flex items-center gap-1.5 mt-2 text-[10px] text-blue-400 hover:text-blue-600 transition-colors"
            >
              <span>{showSnippet ? '▲' : '▼'}</span>
              전문 미리보기
              {paper.full_text_source && (
                <span className="text-gray-400">via {paper.full_text_source}</span>
              )}
            </button>
            {showSnippet && (
              <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <p className="text-[11px] text-gray-600 leading-relaxed whitespace-pre-wrap font-mono">
                  {paper.full_text_snippet}
                </p>
                <p className="text-[10px] text-gray-400 mt-1.5">
                  ※ 실제 평가는 최대 12,000자 기준으로 수행됨
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function EligibilityPaperList({ papers, query = '' }: Props) {
  const [filter, setFilter] = useState<'all' | 'INCLUDE' | 'EXCLUDE'>('all');

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

      {/* 요약 통계 */}
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
          <span>📄 전문 확보 {counts.ft} / {counts.all}건</span>
        </div>
      )}

      {/* 카드 목록 */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-300 text-sm">적격성 평가 결과가 없습니다.</div>
      ) : (
        filtered.map((paper, i) =>
          paper.decision === 'INCLUDE'
            ? <IncludedCard  key={i} paper={paper} query={query} />
            : <ExcludedCard key={i} paper={paper} query={query} />
        )
      )}
    </div>
  );
}
