import SearchForm from '@/components/SearchForm';

export default function HomePage() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center pb-16">
      {/* 로고 */}
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-light tracking-tight" style={{ fontFamily: "var(--font-iris), 'Noto Sans KR', sans-serif" }}>
          <span style={{ color: '#1A3C8F' }}>G</span>
          <span style={{ color: '#1A3C8F' }}>a</span>
          <span style={{ color: '#F37021' }}>c</span>
          <span style={{ color: '#F37021' }}>h</span>
          <span style={{ color: '#6DBE45' }}>o</span>
          <span style={{ color: '#6DBE45' }}>n</span>
          <span style={{ color: '#000000' }}> Scholar</span>
        </h1>
      </div>

      {/* 검색 폼 */}
      <SearchForm />
    </div>
  );
}
