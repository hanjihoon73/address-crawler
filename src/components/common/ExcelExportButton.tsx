import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { CrawlItem } from '@/hooks/useMapCrawler';
import styles from './ExcelExportButton.module.css';

interface Props {
    data: CrawlItem[];
    disabled?: boolean;
}

export default function ExcelExportButton({ data, disabled }: Props) {
    const handleDownload = () => {
        if (data.length === 0) return;

        // Formatting data for Excel
        const formattedData = data.map((item) => ({
            '번호': item.id,
            '상호명': item.name,
            '지번 주소': item.jibunAddress || '-',
            '도로명 주소': item.roadAddress || '-'
        }));

        const worksheet = XLSX.utils.json_to_sheet(formattedData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');

        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        XLSX.writeFile(workbook, `map-crawl-results-${timestamp}.xlsx`);
    };

    return (
        <button
            onClick={handleDownload}
            disabled={disabled || data.length === 0}
            className={styles.button}
        >
            <Download size={18} />
            <span>엑셀 다운로드</span>
        </button>
    );
}
