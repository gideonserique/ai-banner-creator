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
            const coupon = searchParams.get('coupon');
            const plan = searchParams.get('plan');

            const profileUrl = new URL('/profile', req.url);
            if (plan) profileUrl.searchParams.set('plan', plan);
            if (coupon) profileUrl.searchParams.set('coupon', coupon);

            console.log('[MIDDLEWARE] User logged in. Redirecting to:', profileUrl.toString());
            return NextResponse.redirect(profileUrl);
        }
    } catch (e) {
        console.error('[MIDDLEWARE] Error:', e.message);
    }

    return res;
}

export const config = {
    matcher: ['/signup', '/login'],
};
