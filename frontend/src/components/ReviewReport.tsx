'use client';

import { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  content: string;
  query?: string;
  keywords?: string[];
  booleanQuery?: string;
  generatedTerms?: any;
}

function stripLeadingTitle(content: string): string {
  // Remove LLM-generated title lines at the start (# or ## heading before first real section)
  return content.replace(/^(#{1,2}[^\n]*\n+)+/, (match) => {
    // Keep if it looks like a real section (문헌, 핵심, 분석, 주요, 시사, 한계, 참고)
    const keepKeywords = ['문헌', '핵심', '분석', '주요', '시사', '한계', '참고'];
    if (keepKeywords.some(k => match.includes(k))) return match;
    return '';
  });
}

export default function ReviewReport({ content, query, keywords = [], generatedTerms }: Props) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const today = new Date();
  const todayStr = today.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const dateCode = [
    String(today.getFullYear()).slice(2),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('');

  const llmKeywords: string[] = generatedTerms?.keywords ?? [];
  const allKeywords = [...new Set([...keywords, ...llmKeywords])].filter(Boolean);
  const meshTerms: string[] = generatedTerms?.mesh_terms ?? [];

  const cleanContent = stripLeadingTitle(content);

  // PDF filename: "Data Quality Management_260602"
  const safeQuery = (query || 'Report').replace(/[^a-zA-Z0-9가-힣 ]/g, '').trim().slice(0, 50);
  const pdfFilename = `${safeQuery}_${dateCode}`;

  const handleExportPdf = () => {
    if (!reportRef.current || exporting) return;
    setExporting(true);

    const printWin = window.open('', '_blank', 'width=900,height=1200');
    if (!printWin) { setExporting(false); return; }

    // Collect all stylesheets from the current page
    const styles = Array.from(document.styleSheets)
      .map(sheet => {
        try {
          return Array.from(sheet.cssRules).map(r => r.cssText).join('\n');
        } catch { return ''; }
      })
      .join('\n');

    const html = reportRef.current.outerHTML;

    printWin.document.write(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8"/>
  <title>${pdfFilename}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <style>
    ${styles}
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: 'Noto Sans KR', sans-serif; background: #fff; margin: 0; padding: 20px; }
    @page { size: A4; margin: 15mm; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>${html}</body>
</html>`);
    printWin.document.close();

    // Wait for fonts to load then print
    printWin.onload = () => {
      setTimeout(() => {
        printWin.focus();
        printWin.print();
        printWin.close();
        setExporting(false);
      }, 800);
    };
    // Fallback if onload doesn't fire
    setTimeout(() => {
      try { printWin.focus(); printWin.print(); printWin.close(); } catch {}
      setExporting(false);
    }, 2500);
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Report document — captured for PDF */}
      <div ref={reportRef} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

        {/* Cover header */}
        <div className="bg-slate-800 px-8 pt-7 pb-5 text-white">
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-white leading-snug break-words">
                {query || '문헌 검토 보고서'}
              </h1>
            </div>
            <div className="flex flex-col items-end gap-2.5 flex-shrink-0">
              <div className="text-right">
                <p className="text-[11px] font-semibold text-white">Gachon Scholar</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{todayStr}</p>
              </div>
              <button
                onClick={handleExportPdf}
                disabled={exporting}
                className="flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors border border-slate-600 disabled:opacity-50"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {exporting ? '생성 중...' : 'PDF 저장'}
              </button>
            </div>
          </div>

          {/* Meta info */}
          <div className="mt-5 pt-4 border-t border-slate-700 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {query && (
              <div>
                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-1">연구 목적</p>
                <p className="text-xs text-slate-300 leading-relaxed">{query}</p>
              </div>
            )}
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
          </div>
        </div>

        {/* Body */}
        <div className="px-8 py-8">
          <div className="
            prose prose-sm max-w-none
            prose-h2:text-sm prose-h2:font-semibold prose-h2:text-slate-800
            prose-h2:mt-8 prose-h2:mb-3 prose-h2:pb-2 prose-h2:border-b prose-h2:border-slate-100
            prose-h3:text-xs prose-h3:font-semibold prose-h3:text-slate-600
            prose-h3:uppercase prose-h3:tracking-wider prose-h3:mt-5 prose-h3:mb-2
            prose-p:text-sm prose-p:text-gray-600 prose-p:leading-relaxed prose-p:my-2
            prose-li:text-sm prose-li:text-gray-600 prose-li:leading-relaxed
            prose-ul:my-2 prose-ol:my-2
            prose-strong:text-slate-700 prose-strong:font-semibold
          ">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: () => null, // suppress any LLM-generated H1 title
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
              {cleanContent}
            </ReactMarkdown>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-3 border-t border-gray-50 bg-gray-50/50 flex items-center justify-between">
          <p className="text-[10px] text-gray-300">Gachon Scholar · PRISMA 2020 기반 문헌 검토</p>
          <p className="text-[10px] text-gray-300">{todayStr}</p>
        </div>
      </div>
    </div>
  );
}
