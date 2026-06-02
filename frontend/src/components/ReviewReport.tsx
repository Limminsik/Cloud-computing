'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  content: string;
  query?: string;
  keywords?: string[];
  booleanQuery?: string;
  generatedTerms?: any;
}

export default function ReviewReport({ content, query, keywords = [], booleanQuery, generatedTerms }: Props) {
  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  // Merge LLM-generated keywords with user keywords for display
  const llmKeywords: string[] = generatedTerms?.keywords ?? [];
  const allKeywords = [...new Set([...keywords, ...llmKeywords])].filter(Boolean);
  const meshTerms: string[] = generatedTerms?.mesh_terms ?? [];

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #report-printable, #report-printable * { visibility: visible; }
          #report-printable { position: absolute; top: 0; left: 0; width: 100%; padding: 0; }
          .no-print { display: none !important; }
          @page { margin: 18mm; size: A4; }
        }
      `}</style>

      <div className="max-w-4xl mx-auto" id="report-printable">

        {/* ── 커버 헤더 ── */}
        <div className="bg-slate-800 rounded-t-2xl px-8 pt-7 pb-5 text-white">
          <div className="flex items-start justify-between gap-6">
            {/* 좌: 타이틀 */}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-medium tracking-widest text-slate-400 uppercase mb-2">
                Literature Review Report
              </p>
              <h1 className="text-lg font-bold text-white leading-snug break-words">
                {query || '문헌 검토 보고서'}
              </h1>
            </div>

            {/* 우: 날짜 + PDF 버튼 */}
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              <div className="text-right">
                <p className="text-[11px] font-semibold text-white">Gachon Scholar</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{today}</p>
              </div>
              <button
                onClick={() => window.print()}
                className="no-print flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors border border-slate-600"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                PDF 저장
              </button>
            </div>
          </div>

          {/* 연구 메타 정보 */}
          <div className="mt-5 pt-4 border-t border-slate-700 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* 연구 목적 */}
            {query && (
              <div>
                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-1">연구 목적</p>
                <p className="text-xs text-slate-300 leading-relaxed">{query}</p>
              </div>
            )}

            {/* 키워드 */}
            {allKeywords.length > 0 && (
              <div>
                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">연구 키워드</p>
                <div className="flex flex-wrap gap-1">
                  {allKeywords.slice(0, 10).map((kw, i) => (
                    <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 border border-slate-600">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 검색 키워드 (MeSH + Boolean) */}
            {(meshTerms.length > 0 || booleanQuery) && (
              <div className="sm:col-span-2">
                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">검색 전략 키워드</p>
                {meshTerms.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {meshTerms.map((t, i) => (
                      <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-300 border border-blue-800">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {booleanQuery && (
                  <p className="text-[9px] text-slate-500 font-mono leading-relaxed break-all">
                    {booleanQuery.length > 120 ? booleanQuery.slice(0, 120) + '…' : booleanQuery}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── 보고서 본문 ── */}
        <div className="bg-white border-x border-b border-gray-100 rounded-b-2xl px-8 py-8 shadow-sm">
          <div className="
            prose prose-sm max-w-none
            prose-headings:font-semibold
            prose-h2:text-sm prose-h2:text-slate-800 prose-h2:mt-8 prose-h2:mb-3
            prose-h2:pb-2 prose-h2:border-b prose-h2:border-slate-100
            prose-h3:text-sm prose-h3:text-slate-700 prose-h3:mt-4 prose-h3:mb-2
            prose-p:text-sm prose-p:text-gray-600 prose-p:leading-relaxed prose-p:my-2
            prose-li:text-sm prose-li:text-gray-600 prose-li:leading-relaxed
            prose-ul:my-2 prose-ol:my-2
            prose-strong:text-slate-700 prose-strong:font-semibold
          ">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h2: ({ children }) => (
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800 mt-8 mb-3 pb-2 border-b border-slate-100">
                    <span className="w-0.5 h-4 bg-blue-500 rounded-full flex-shrink-0" />
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mt-5 mb-2">
                    {children}
                  </h3>
                ),
                ul: ({ children }) => <ul className="list-none pl-0 my-2 space-y-1">{children}</ul>,
                li: ({ children }) => (
                  <li className="flex gap-2 items-start text-sm text-gray-600">
                    <span className="mt-2 w-1 h-1 rounded-full bg-slate-300 flex-shrink-0" />
                    <span className="leading-relaxed">{children}</span>
                  </li>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="not-italic border-l-2 border-blue-200 bg-blue-50/60 px-4 py-2.5 rounded-r my-3">
                    <span className="text-xs text-blue-700 leading-relaxed">{children}</span>
                  </blockquote>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-slate-700">{children}</strong>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        </div>

        {/* ── 푸터 ── */}
        <div className="no-print px-8 py-3 flex items-center justify-between">
          <p className="text-[10px] text-gray-300">Gachon Scholar · PRISMA 2020 기반 문헌 검토</p>
          <p className="text-[10px] text-gray-300">{today}</p>
        </div>
      </div>
    </>
  );
}
