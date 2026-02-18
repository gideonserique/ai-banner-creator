import { NextResponse } from 'next/server';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get('url');

    if (!imageUrl) {
        return new NextResponse('Missing URL', { status: 400 });
    }

    try {
        console.log('Proxying image:', imageUrl);
        const response = await fetch(imageUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            },
        });

        if (!response.ok) {
            console.error('Proxy fetch failed:', response.status, response.statusText);
            return new NextResponse(`Failed to fetch image: ${response.statusText}`, { status: response.status });
        }

        const contentType = response.headers.get('content-type');
        const buffer = await response.arrayBuffer();

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': contentType || 'image/jpeg',
                'Cache-Control': 'public, max-age=31536000, immutable',
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (error) {
        console.error('Proxy internal error:', error);
        return new NextResponse('Error proxying image', { status: 500 });
    }
}
