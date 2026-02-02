import { useState } from 'react';
import { CrawlItem } from '@/hooks/useMapCrawler';
import { ChevronLeft, ChevronRight, Copy, Check } from 'lucide-react';
import styles from './ResultTable.module.css';

interface Props {
    data: CrawlItem[];
}

export default function ResultTable({ data }: Props) {
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    const totalPages = Math.ceil(data.length / itemsPerPage);
    const currentData = data.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const [copiedId, setCopiedId] = useState<number | null>(null);

    const copyToClipboard = (text: string, id: number) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    if (data.length === 0) return null;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h3 className={styles.title}>
                    검색 결과 <span className={styles.count}>{data.length}</span>건
                </h3>
                <div className={styles.pageInfo}>
                    페이지 {currentPage} / {totalPages}
                </div>
            </div>

            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th style={{ width: '4rem', textAlign: 'center' }}>No.</th>
                            <th>상호명</th>
                            <th>지번 주소</th>
                            <th>도로명 주소</th>
                        </tr>
                    </thead>
                    <tbody>
                        {currentData.map((item, index) => {
                            const globalIndex = (currentPage - 1) * itemsPerPage + index + 1;

                            return (
                                <tr key={item.id}>
                                    <td style={{ textAlign: 'center', color: '#64748b' }}>
                                        {globalIndex}
                                    </td>
                                    <td>
                                        <div className={styles.name}>{item.name}</div>
                                        {item.category && <div className={styles.category}>{item.category}</div>}
                                    </td>
                                    <td>
                                        <div className={styles.addressRow}>
                                            <span className={styles.addressText}>{item.jibunAddress || '-'}</span>
                                            {item.jibunAddress && (
                                                <button
                                                    onClick={() => copyToClipboard(item.jibunAddress!, item.id * 10)}
                                                    className={styles.copyBtn}
                                                    title="복사"
                                                >
                                                    {copiedId === item.id * 10 ? <Check size={14} /> : <Copy size={14} />}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                    <td>
                                        <div className={styles.addressRow}>
                                            <span className={styles.addressText}>{item.roadAddress || '-'}</span>
                                            {item.roadAddress && (
                                                <button
                                                    onClick={() => copyToClipboard(item.roadAddress!, item.id * 10 + 1)}
                                                    className={styles.copyBtn}
                                                >
                                                    {copiedId === item.id * 10 + 1 ? <Check size={14} /> : <Copy size={14} />}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {totalPages > 1 && (
                <div className={styles.pagination}>
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className={styles.navBtn}
                    >
                        <ChevronLeft size={20} />
                    </button>

                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                            <button
                                key={page}
                                onClick={() => setCurrentPage(page)}
                                className={`${styles.pageBtn} ${currentPage === page ? styles.active : ''}`}
                            >
                                {page}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className={styles.navBtn}
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>
            )}
        </div>
    );
}
