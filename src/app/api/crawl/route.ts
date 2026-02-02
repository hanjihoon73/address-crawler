import { NextRequest, NextResponse } from 'next/server';
import { crawlNaverMap } from '@/utils/crawler';

export async function POST(req: NextRequest) {
    try {
        const { keyword, limit } = await req.json();

        if (!keyword) {
            return NextResponse.json({ error: 'Keyword is required' }, { status: 400 });
        }

        const searchLimit = limit ? parseInt(limit, 10) : 20;

        // 타임아웃 방지를 위해 긴 실행 시간을 고려해야 함.
        // Vercel 등 Serverless 배포 시 10초 제한이 있을 수 있으나, 로컬/VPS 환경 가정.
        const results = await crawlNaverMap(keyword, searchLimit);

        return NextResponse.json({ results });
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Failed to crawl data' }, { status: 500 });
    }
}
