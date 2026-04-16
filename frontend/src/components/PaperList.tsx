'use client';

import { useState } from 'react';

export interface PaperDecision {
  title: string;
  decision: string;
  reason: string;
  stage: string;
}

interface Props {
  papers: PaperDecision[];
  query?: string;
}

const stageLabel: Record<string, string> = {
  identified: '식별',
  screened: '선별',
  eligible: '적격',
  included: '포함',
};

const stageOrder = ['identified', 'screened', 'eligible', 'included'];

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

export default function PaperList({ papers, query = '' }: Props) {
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [decisionFilter, setDecisionFilter] = useState<string>('all');
  const [expanded, setExpanded] = useState<number | null>(null);

  const filtered = papers.filter((p) => {
    const stageOk = stageFilter === 'all' || p.stage === stageFilter;
    const decisionOk = decisionFilter === 'all' || p.decision === decisionFilter;
    return stageOk && decisionOk;
  });

  const counts = {
    all: papers.length,
    INCLUDE: papers.filter(p => p.decision === 'INCLUDE').length,
    EXCLUDE: papers.filter(p => p.decision === 'EXCLUDE').length,
  };

  const stageCounts = stageOrder.reduce((acc, s) => {
    acc[s] = papers.filter(p => p.stage === s).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="flex gap-4">
      {/* 좌측 필터 패널 */}
      <aside className="w-44 flex-shrink-0 space-y-5">
        {/* PRISMA 단계 필터 */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">PRISMA 단계</p>
          <ul className="space-y-1">
            <li>
              <button
                onClick={() => setStageFilter('all')}
                className={`w-full text-left text-xs px-2 py-1 rounded-lg flex justify-between items-center transition-colors ${stageFilter === 'all' ? 'bg-gray-100 font-semibold text-gray-800' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                전체 <span className="text-gray-400">{papers.length}</span>
              </button>
            </li>
            {stageOrder.map(s => (
              <li key={s}>
                <button
                  onClick={() => setStageFilter(s)}
                  className={`w-full text-left text-xs px-2 py-1 rounded-lg flex justify-between items-center transition-colors ${stageFilter === s ? 'bg-blue-50 font-semibold text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  {stageLabel[s]} <span className="text-gray-400">{stageCounts[s] || 0}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* 판정 필터 */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">판정</p>
          <ul className="space-y-1">
            {(['all', 'INCLUDE', 'EXCLUDE'] as const).map(d => (
              <li key={d}>
                <button
                  onClick={() => setDecisionFilter(d)}
                  className={`w-full text-left text-xs px-2 py-1 rounded-lg flex justify-between items-center transition-colors ${
                    decisionFilter === d
                      ? d === 'INCLUDE' ? 'bg-green-50 text-green-700 font-semibold'
                        : d === 'EXCLUDE' ? 'bg-red-50 text-red-700 font-semibold'
                        : 'bg-gray-100 text-gray-800 font-semibold'
                      : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {d === 'all' ? '전체' : d === 'INCLUDE' ? '포함' : '제외'}
                  <span className="text-gray-400">{d === 'all' ? counts.all : counts[d]}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* 논문 카드 목록 */}
      <div className="flex-1 space-y-3 min-w-0">
        <p className="text-xs text-gray-400">
          {filtered.length}건 표시 중 (전체 {papers.length}건)
        </p>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-300 text-sm">
            선별된 논문이 없습니다.
          </div>
        ) : (
          filtered.map((paper, i) => (
            <div
              key={i}
              className="border border-gray-100 rounded-xl p-4 hover:shadow-sm transition-all bg-white"
            >
              {/* 제목 + 배지 */}
              <div className="flex items-start justify-between gap-3 mb-1">
                <h3 className="text-sm font-semibold text-blue-700 leading-snug flex-1">
                  {highlight(paper.title, query)}
                </h3>
                <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  paper.decision === 'INCLUDE'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-600'
                }`}>
                  {paper.decision === 'INCLUDE' ? '포함' : '제외'}
                </span>
              </div>

              {/* 단계 */}
              <p className="text-[10px] text-gray-400 mb-2">
                PRISMA 단계: <span className="font-medium text-gray-500">{stageLabel[paper.stage] || paper.stage}</span>
              </p>

              {/* 판정 이유 (토글) */}
              {paper.reason && (
                <>
                  <p className={`text-xs text-gray-500 leading-relaxed ${expanded === i ? '' : 'line-clamp-2'}`}>
                    {highlight(paper.reason, query)}
                  </p>
                  {paper.reason.length > 120 && (
                    <button
                      onClick={() => setExpanded(expanded === i ? null : i)}
                      className="text-[10px] text-blue-500 hover:underline mt-1"
                    >
                      {expanded === i ? '접기' : '더 보기'}
                    </button>
                  )}
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
