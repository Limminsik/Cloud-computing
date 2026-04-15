'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  content: string;
}

export default function ReviewReport({ content }: Props) {
  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `systematic_review_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-800">최종 리뷰 논문</h2>
        <button onClick={handleDownload} className="btn-secondary text-sm">
          Markdown 다운로드
        </button>
      </div>
      <div className="prose prose-sm prose-gray max-w-none bg-white border border-gray-200 rounded-xl p-6 max-h-screen overflow-y-auto">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
