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
}

export default function PaperList({ papers }: Props) {
  const [filter, setFilter] = useState<'all' | 'INCLUDE' | 'EXCLUDE'>('all');

  const filtered = papers.filter((p) => filter === 'all' || p.decision === filter);
  const includedCount = papers.filter((p) => p.decision === 'INCLUDE').length;
  const excludedCount = papers.filter((p) => p.decision === 'EXCLUDE').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          논문 선별 결과
        </h2>
        <div className="flex gap-2 text-xs">
          <button
            onClick={() => setFilter('all')}
            className={`px-2.5 py-1 rounded-full font-medium transition-colors ${filter === 'all' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            전체 {papers.length}
          </button>
          <button
            onClick={() => setFilter('INCLUDE')}
            className={`px-2.5 py-1 rounded-full font-medium transition-colors ${filter === 'INCLUDE' ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700'}`}
          >
            포함 {includedCount}
          </button>
          <button
            onClick={() => setFilter('EXCLUDE')}
            className={`px-2.5 py-1 rounded-full font-medium transition-colors ${filter === 'EXCLUDE' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700'}`}
          >
            제외 {excludedCount}
          </button>
        </div>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 italic text-center py-8">
            선별된 논문이 여기에 표시됩니다...
          </p>
        ) : (
          filtered.map((paper, i) => (
            <div
              key={i}
              className={`border rounded-xl p-3 transition-all duration-200 ${
                paper.decision === 'INCLUDE'
                  ? 'border-green-200 bg-green-50'
                  : 'border-red-100 bg-red-50'
              }`}
            >
              <div className="flex items-start gap-2">
                <span
                  className={
                    paper.decision === 'INCLUDE' ? 'badge-include' : 'badge-exclude'
                  }
                >
                  {paper.decision === 'INCLUDE' ? '포함' : '제외'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 leading-snug">{paper.title}</p>
                  {paper.reason && (
                    <p className="text-xs text-gray-500 mt-0.5">{paper.reason}</p>
                  )}
                  <span className="text-xs text-gray-400">{paper.stage}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
