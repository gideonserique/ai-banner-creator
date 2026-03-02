import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const ADMIN_EMAIL = 'gideongsr94@gmail.com';

async function verifyAdmin(request) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return null;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user || user.email !== ADMIN_EMAIL) return null;
    return user;
}

async function getBlockedIps() {
    const { data } = await supabaseAdmin
        .from('system_settings')
        .select('value')
        .eq('key', 'blocked_ips')
        .single();
    try {
        return data?.value ? JSON.parse(data.value) : [];
    } catch {
        return [];
    }
}

async function saveBlockedIps(list) {
    await supabaseAdmin
        .from('system_settings')
        .upsert({ key: 'blocked_ips', value: JSON.stringify(list), updated_at: new Date().toISOString() });
}

// GET: return current blocked IPs
export async function GET(request) {
    try {
        const admin = await verifyAdmin(request);
        if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        const list = await getBlockedIps();
        return NextResponse.json({ blocked_ips: list });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: add IP to block list
export async function POST(request) {
    try {
        const admin = await verifyAdmin(request);
        if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const { ip, reason } = await request.json();
        if (!ip) return NextResponse.json({ error: 'IP is required' }, { status: 400 });

        const list = await getBlockedIps();

        // Avoid duplicates
        if (list.some(entry => entry.ip === ip)) {
            return NextResponse.json({ error: 'IP already blocked' }, { status: 409 });
        }

        list.push({ ip, reason: reason || '', blocked_at: new Date().toISOString() });
        await saveBlockedIps(list);

        return NextResponse.json({ success: true, blocked_ips: list });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE: remove IP from block list
export async function DELETE(request) {
    try {
        const admin = await verifyAdmin(request);
        if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const { ip } = await request.json();
        if (!ip) return NextResponse.json({ error: 'IP is required' }, { status: 400 });

        let list = await getBlockedIps();
        list = list.filter(entry => entry.ip !== ip);
        await saveBlockedIps(list);

        return NextResponse.json({ success: true, blocked_ips: list });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
