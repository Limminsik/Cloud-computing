'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  content: string;
  query?: string;
}

export default function ReviewReport({ content, query }: Props) {
  const handlePrint = () => {
    window.print();
  };

  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <>
      {/* Print styles — injected into head via style tag */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #report-printable, #report-printable * { visibility: visible; }
          #report-printable { position: absolute; top: 0; left: 0; width: 100%; }
          .no-print { display: none !important; }
          @page { margin: 20mm; size: A4; }
        }
      `}</style>

      <div className="max-w-4xl mx-auto">
        {/* Toolbar */}
        <div className="no-print flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800">리서치 인텔리전스 보고서</h2>
            {query && <p className="text-xs text-gray-400 mt-0.5">{query}</p>}
          </div>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            PDF 저장
          </button>
        </div>

        {/* Report document */}
        <div id="report-printable" className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

          {/* Cover header */}
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-10 py-8 text-white">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium tracking-widest text-slate-400 uppercase mb-2">
                  Research Intelligence Report
                </p>
                <h1 className="text-xl font-bold leading-snug text-white">
                  {query || '리서치 인텔리전스 보고서'}
                </h1>
              </div>
              <div className="text-right text-xs text-slate-400 flex-shrink-0 ml-6">
                <p>Gachon Scholar</p>
                <p className="mt-1">{today}</p>
                <p className="mt-1">PRISMA 2020 기반</p>
              </div>
            </div>
          </div>

          {/* Report body */}
          <div className="px-10 py-8">
            <div className="
              prose prose-sm max-w-none
              prose-headings:font-semibold
              prose-h2:text-base prose-h2:text-slate-800 prose-h2:mt-8 prose-h2:mb-3
              prose-h2:pb-2 prose-h2:border-b prose-h2:border-slate-100
              prose-h3:text-sm prose-h3:text-slate-700 prose-h3:mt-4 prose-h3:mb-2
              prose-p:text-sm prose-p:text-gray-600 prose-p:leading-relaxed prose-p:my-2
              prose-li:text-sm prose-li:text-gray-600 prose-li:my-0.5
              prose-ul:my-2 prose-ol:my-2
              prose-strong:text-slate-700 prose-strong:font-semibold
              prose-blockquote:border-l-2 prose-blockquote:border-blue-200
              prose-blockquote:bg-blue-50 prose-blockquote:px-4 prose-blockquote:py-2
              prose-blockquote:rounded-r prose-blockquote:not-italic
              prose-blockquote:text-blue-800 prose-blockquote:text-xs
            ">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h2: ({ children }) => (
                    <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800
                      mt-8 mb-3 pb-2 border-b border-slate-100">
                      <span className="w-1 h-4 bg-blue-500 rounded-full flex-shrink-0" />
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-sm font-semibold text-slate-700 mt-5 mb-2">{children}</h3>
                  ),
                  li: ({ children }) => (
                    <li className="flex gap-2 items-start text-sm text-gray-600 my-1">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
                      <span>{children}</span>
                    </li>
                  ),
                  ul: ({ children }) => <ul className="list-none pl-0 my-2 space-y-0.5">{children}</ul>,
                  strong: ({ children }) => (
                    <strong className="font-semibold text-slate-700">{children}</strong>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-blue-300 bg-blue-50 px-4 py-2 rounded-r my-3 not-italic">
                      <span className="text-xs text-blue-700">{children}</span>
                    </blockquote>
                  ),
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          </div>

          {/* Footer */}
          <div className="px-10 py-4 border-t border-gray-50 bg-gray-50/50 flex items-center justify-between">
            <p className="text-[10px] text-gray-300">Generated by Gachon Scholar · PRISMA 2020</p>
            <p className="text-[10px] text-gray-300">{today}</p>
          </div>
        </div>
      </div>
    </>
  );
}
