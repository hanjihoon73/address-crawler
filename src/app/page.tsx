'use client';

import { useMapCrawler } from '@/hooks/useMapCrawler';
import SearchForm from '@/components/search/SearchForm';
import ResultTable from '@/components/result/ResultTable';
import ExcelExportButton from '@/components/common/ExcelExportButton';
import styles from './page.module.css';

export default function Home() {
  const { data, isLoading, error, startCrawl } = useMapCrawler();

  return (
    <main className={styles.main}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.logoArea}>
            <div className={styles.logoIcon}>N</div>
            <h1 className={styles.logoTitle}>Address Crawler</h1>
          </div>
          <div>
            <ExcelExportButton data={data} />
          </div>
        </div>
      </header>

      {/* Content */}
      <div className={styles.content}>
        {/* Search Section */}
        <div className={styles.searchSection}>
          <div className={styles.heroText}>
            <h2 className={styles.heroTitle}>
              원하는 키워드의 주소를 빠르게 수집하세요
            </h2>
            <p className={styles.heroSubtitle}>
              상호명, 지번 주소, 도로명 주소를 엑셀로 한 번에 다운로드할 수 있습니다.
            </p>
          </div>

          <SearchForm onSearch={startCrawl} isLoading={isLoading} />
        </div>

        {/* Error Message */}
        {error && (
          <div className={styles.error}>
            <svg style={{ width: 20, height: 20 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Loading Indicator */}
        {isLoading && data.length === 0 && (
          <div className={styles.loading}>
            <div className={styles.loadingSpinner} />
            <p className={styles.pulse}>데이터를 수집하고 있습니다. 잠시만 기다려주세요...</p>
            <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>브라우저가 실행되며 수집 과정이 진행됩니다.</p>
          </div>
        )}

        {/* Results */}
        <ResultTable data={data} />
      </div>
    </main>
  );
}
