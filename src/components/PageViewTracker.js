'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const ADMIN_EMAIL = 'gideongsr94@gmail.com';

function getSessionId() {
    if (typeof window === 'undefined') return null;
    let sid = sessionStorage.getItem('_bsid');
    if (!sid) {
        sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
        sessionStorage.setItem('_bsid', sid);
    }
    return sid;
}

function parseDevice(ua = '') {
    if (/Mobile|Android|iPhone|iPad/.test(ua)) return 'mobile';
    if (/Tablet|iPad/.test(ua)) return 'tablet';
    return 'desktop';
}

export default function PageViewTracker() {
    const pathname = usePathname();
    const lastTracked = useRef('');

    useEffect(() => {
        // Don't track same path twice in a row
        if (pathname === lastTracked.current) return;
        lastTracked.current = pathname;

        // Don't track admin pages
        if (pathname.startsWith('/admin')) return;

        async function track() {
            try {
                // Skip if admin is logged in
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user?.email === ADMIN_EMAIL) return;

                const sessionId = getSessionId();
                const ua = navigator.userAgent;

                await supabase.from('page_views').insert({
                    session_id: sessionId,
                    page_path: pathname,
                    user_id: session?.user?.id || null,
                    device_type: parseDevice(ua),
                    referrer: document.referrer || null,
                    user_agent: ua.slice(0, 255),
                });
            } catch {
                // Silently fail — tracking should never break the app
            }
        }

        track();
    }, [pathname]);

    return null;
}
