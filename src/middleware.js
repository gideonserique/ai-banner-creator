import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';

export async function middleware(req) {
    const res = NextResponse.next();

    try {
        const supabase = createMiddlewareClient({ req, res });
        const { data: { session } } = await supabase.auth.getSession();

        const { pathname, searchParams } = req.nextUrl;
        const isAuthPage = pathname === '/signup' || pathname === '/login';

        if (session?.user && isAuthPage) {
            console.log('[MIDDLEWARE] User already logged in. Redirecting to home.');
            return NextResponse.redirect(new URL('/', req.url));
        }
    } catch (e) {
        console.error('[MIDDLEWARE] Error:', e.message);
    }

    return res;
}

export const config = {
    matcher: ['/signup', '/login'],
};
