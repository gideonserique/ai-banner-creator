import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = 'gideongsr94@gmail.com';

export async function GET(request) {
    try {
        // 1. Verify the requesting user is the admin
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.replace('Bearer ', '');
        const supabaseClient = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        );

        const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
        if (authError || !user || user.email !== ADMIN_EMAIL) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // 2. Get admin's own user ID via profiles table (more reliable than auth.admin API)
        let adminId = null;
        try {
            const { data: adminProfile } = await supabaseAdmin
                .from('profiles')
                .select('id')
                .eq('id', user.id)
                .single();
            // Use the verified JWT user ID directly — most reliable
            adminId = user.id;
        } catch {
            adminId = user.id; // Fallback: still use the JWT user ID
        }

        // 3. Fetch all profiles (excluding admin)
        let profilesQuery = supabaseAdmin
            .from('profiles')
            .select('id, full_name, company_name, subscription_tier, generations_count, updated_at, whatsapp, logo_url')
            .order('updated_at', { ascending: false });
        if (adminId) profilesQuery = profilesQuery.neq('id', adminId);
        const { data: profiles = [], error: profilesError } = await profilesQuery;
        if (profilesError) {
            console.error('[ADMIN-STATS] profiles error:', profilesError);
            throw new Error(`Profiles query failed: ${profilesError.message}`);
        }

        // 4. Fetch all banners (excluding admin)
        let bannersQuery = supabaseAdmin
            .from('banners')
            .select('id, user_id, size, created_at, prompt, image_url, caption')
            .order('created_at', { ascending: false });
        if (adminId) bannersQuery = bannersQuery.neq('user_id', adminId);
        const { data: banners = [], error: bannersError } = await bannersQuery;
        if (bannersError) {
            console.error('[ADMIN-STATS] banners error:', bannersError);
            throw new Error(`Banners query failed: ${bannersError.message}`);
        }

        // 5. Fetch page views — use empty array if table doesn't exist yet
        let pageViews = [];
        try {
            const { data: pvData, error: pvError } = await supabaseAdmin
                .from('page_views')
                .select('session_id, page_path, device_type, user_id, referrer, created_at')
                .order('created_at', { ascending: false });
            if (!pvError && pvData) pageViews = pvData;
            else if (pvError) console.warn('[ADMIN-STATS] page_views not ready yet:', pvError.message);
        } catch (e) {
            console.warn('[ADMIN-STATS] page_views table missing, skipping.');
        }

        // Filter out admin's own user_id
        const filteredViews = adminId
            ? pageViews.filter(v => v.user_id !== adminId)
            : pageViews;

        // --- Traffic metrics ---
        const totalPageViews = filteredViews.length;
        const uniqueSessions = new Set(filteredViews.map(v => v.session_id)).size;
        const loggedInVisits = filteredViews.filter(v => v.user_id).length;
        const anonymousVisits = totalPageViews - loggedInVisits;

        // Device breakdown
        const deviceCount = { mobile: 0, tablet: 0, desktop: 0 };
        filteredViews.forEach(v => {
            if (deviceCount[v.device_type] !== undefined) deviceCount[v.device_type]++;
        });

        // Top pages
        const pageCount = {};
        filteredViews.forEach(v => {
            pageCount[v.page_path] = (pageCount[v.page_path] || 0) + 1;
        });
        const topPages = Object.entries(pageCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([path, count]) => ({ path, count }));

        // Top referrers
        const refCount = {};
        filteredViews.forEach(v => {
            if (v.referrer) {
                try {
                    const host = new URL(v.referrer).host;
                    refCount[host] = (refCount[host] || 0) + 1;
                } catch { /* skip malformed */ }
            }
        });
        const topReferrers = Object.entries(refCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([ref, count]) => ({ ref, count }));

        // --- Date ranges ---
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const last7dViews = filteredViews.filter(v => new Date(v.created_at) >= sevenDaysAgo);
        const uniqueVisitorsLast7d = new Set(last7dViews.map(v => v.session_id)).size;
        const pageViewsLast7d = last7dViews.length;

        // --- Daily chart data (last 30 days) ---
        const usersByDay = {};
        profiles.forEach(p => {
            const d = new Date(p.updated_at);
            if (d >= thirtyDaysAgo) {
                const key = d.toISOString().slice(0, 10);
                usersByDay[key] = (usersByDay[key] || 0) + 1;
            }
        });

        const bannersByDay = {};
        banners.forEach(b => {
            const d = new Date(b.created_at);
            if (d >= thirtyDaysAgo) {
                const key = d.toISOString().slice(0, 10);
                bannersByDay[key] = (bannersByDay[key] || 0) + 1;
            }
        });

        const visitorsByDay = {};
        const sessionsByDay = {};
        filteredViews.forEach(v => {
            const d = new Date(v.created_at);
            if (d >= thirtyDaysAgo) {
                const key = d.toISOString().slice(0, 10);
                visitorsByDay[key] = (visitorsByDay[key] || 0) + 1;
                if (!sessionsByDay[key]) sessionsByDay[key] = new Set();
                sessionsByDay[key].add(v.session_id);
            }
        });

        const daysArray = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            const key = d.toISOString().slice(0, 10);
            daysArray.push({
                date: key,
                label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
                newUsers: usersByDay[key] || 0,
                newBanners: bannersByDay[key] || 0,
                pageViews: visitorsByDay[key] || 0,
                uniqueVisitors: sessionsByDay[key]?.size || 0,
            });
        }

        // --- User-level stats ---
        const totalUsers = profiles.length;
        const totalPremium = profiles.filter(p => p.subscription_tier === 'premium').length;
        const totalFree = totalUsers - totalPremium;
        const conversionRate = totalUsers > 0 ? ((totalPremium / totalUsers) * 100).toFixed(1) : 0;
        const totalBanners = banners.length;
        const totalCaptions = banners.filter(b => b.caption).length;
        const avgBannersPerUser = totalUsers > 0 ? (totalBanners / totalUsers).toFixed(1) : 0;
        const newUsersLast7d = profiles.filter(p => new Date(p.updated_at) >= sevenDaysAgo).length;
        const newBannersLast7d = banners.filter(b => new Date(b.created_at) >= sevenDaysAgo).length;
        const usersWithBanners = new Set(banners.map(b => b.user_id));
        const usersWithNoBanners = profiles.filter(p => !usersWithBanners.has(p.id)).length;

        const sizeCount = { square: 0, portrait: 0, landscape: 0 };
        banners.forEach(b => { if (sizeCount[b.size] !== undefined) sizeCount[b.size]++; });

        const bannerCountByUser = {};
        banners.forEach(b => { bannerCountByUser[b.user_id] = (bannerCountByUser[b.user_id] || 0) + 1; });

        const enrichedProfiles = profiles.map(p => ({
            ...p,
            banner_count: bannerCountByUser[p.id] || p.generations_count || 0,
        })).sort((a, b) => b.banner_count - a.banner_count);

        const recentActivity = banners.slice(0, 20).map(b => {
            const profile = profiles.find(p => p.id === b.user_id);
            return {
                ...b,
                user_name: profile?.company_name || profile?.full_name || 'Usuário',
                subscription_tier: profile?.subscription_tier || 'free',
            };
        });

        return NextResponse.json({
            kpis: {
                totalUsers, totalPremium, totalFree, conversionRate,
                totalBanners, totalCaptions, avgBannersPerUser,
                newUsersLast7d, newBannersLast7d, usersWithNoBanners,
                // Traffic
                totalPageViews, uniqueSessions, anonymousVisits, loggedInVisits,
                uniqueVisitorsLast7d, pageViewsLast7d,
            },
            chartData: daysArray,
            profiles: enrichedProfiles,
            recentActivity,
            sizeDistribution: sizeCount,
            traffic: { deviceCount, topPages, topReferrers },
        });

    } catch (error) {
        console.error('[ADMIN-STATS] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
