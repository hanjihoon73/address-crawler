import { useState, useCallback } from 'react';

export interface CrawlItem {
    id: number;
    name: string;
    jibunAddress?: string;
    roadAddress?: string;
    category?: string;
}

export function useMapCrawler() {
    const [data, setData] = useState<CrawlItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const startCrawl = useCallback(async (keyword: string, limit: number) => {
        setIsLoading(true);
        setError(null);
        setData([]);

        try {
            const response = await fetch('/api/crawl', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ keyword, limit }),
            });

            if (!response.ok) {
                throw new Error('Crawl failed');
            }

            const result = await response.json();
            if (result.error) {
                throw new Error(result.error);
            }

            setData(result.results || []);
        } catch (err: any) {
            setError(err.message || 'Something went wrong');
        } finally {
            setIsLoading(false);
        }
    }, []);

    return {
        data,
        isLoading,
        error,
        startCrawl
    };
}
