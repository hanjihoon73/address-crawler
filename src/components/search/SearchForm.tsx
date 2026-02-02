import { Search, MapPin } from 'lucide-react';
import { FormEvent, useState } from 'react';
import styles from './SearchForm.module.css';

interface Props {
    onSearch: (keyword: string, limit: number) => void;
    isLoading: boolean;
}

export default function SearchForm({ onSearch, isLoading }: Props) {
    const [keyword, setKeyword] = useState('');
    const [limit, setLimit] = useState(20);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!keyword.trim()) return;
        onSearch(keyword, limit);
    };

    return (
        <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.row}>
                <div className={styles.inputGroup}>
                    <div className={styles.iconWrapper}>
                        <Search size={20} />
                    </div>
                    <input
                        type="text"
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        placeholder="키워드를 입력하세요."
                        className={styles.input}
                        disabled={isLoading}
                    />
                </div>

                <div className={styles.limitGroup}>
                    <div className={styles.limitInputWrapper}>
                        <input
                            type="number"
                            min="1"
                            max="500"
                            step="1"
                            value={limit}
                            onChange={(e) => setLimit(Number(e.target.value))}
                            className={styles.limitInput}
                            disabled={isLoading}
                        />
                        <span className={styles.unit}>개</span>
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={isLoading || !keyword.trim()}
                    className={styles.submitBtn}
                >
                    {isLoading ? (
                        <div className={styles.spinner} />
                    ) : (
                        <>
                            <MapPin size={18} />
                            <span>수집 시작</span>
                        </>
                    )}
                </button>
            </div>
            <p className={styles.helpText}>
                * 한 번에 최대 500개까지 수집 가능합니다. 수집량이 클 수록 시간이 많이 소요됩니다.
            </p>
        </form>
    );
}
