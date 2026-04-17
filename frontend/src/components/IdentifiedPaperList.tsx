'use client';

import { useState } from 'react';

export interface IdentifiedPaper {
  title: string;
  authors: string[];
  year?: number | null;
  url?: string | null;
  abstract: string;
  venue: string;
}

interface Props {
  papers: IdentifiedPaper[];
  query?: string;
}

function highlight(text: string, query: string) {
  if (!query || !text) return <>{text}</>;
  const terms = query.split(/\s+/).filter(Boolean);
  const regex = new RegExp(`(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part)
          ? <mark key={i} className="bg-yellow-100 text-yellow-900 rounded px-0.5">{part}</mark>
          : part
      )}
    </>
  );
}

export default function IdentifiedPaperList({ papers, query = '' }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (papers.length === 0) {
    return (
      <div className="text-center py-20 text-gray-300 text-sm">
        식별된 논문이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">Google Scholar에서 식별된 논문 {papers.length}건</p>

      {papers.map((paper, i) => (
        <div
          key={i}
          className="border border-gray-100 rounded-xl p-4 bg-white hover:shadow-sm transition-all"
        >
          {/* 제목 */}
          <div className="flex items-start gap-2 mb-1">
            {paper.url ? (
              <a
                href={paper.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-blue-700 leading-snug hover:underline flex-1"
              >
                {highlight(paper.title, query)}
              </a>
            ) : (
              <h3 className="text-sm font-semibold text-blue-700 leading-snug flex-1">
                {highlight(paper.title, query)}
              </h3>
            )}
            <span className="flex-shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              식별됨
            </span>
          </div>

          {/* 저자 + 연도 + 저널 */}
          <p className="text-[11px] text-gray-500 mb-1">
            {paper.authors.length > 0 && (
              <span>{paper.authors.slice(0, 3).join(', ')}{paper.authors.length > 3 ? ' 외' : ''}</span>
            )}
            {paper.year && <span className="ml-2 text-gray-400">({paper.year})</span>}
            {paper.venue && <span className="ml-2 text-gray-400 italic truncate">{paper.venue.slice(0, 80)}</span>}
          </p>

          {/* 초록/스니펫 */}
          {paper.abstract && (
            <>
              <p className="text-xs text-gray-500 leading-relaxed">
                {expanded === i
                  ? highlight(paper.abstract, query)
                  : highlight(paper.abstract.slice(0, 120) + (paper.abstract.length > 120 ? '…' : ''), query)
                }
              </p>
              {paper.abstract.length > 120 && (
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
      ))}
    </div>
  );
}
