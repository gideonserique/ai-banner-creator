import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const ADMIN_EMAIL = 'gideongsr94@gmail.com';

// GET: Fetch current settings
export async function GET(request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !user || user.email !== ADMIN_EMAIL) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { data: settings, error: settingsError } = await supabaseAdmin
            .from('system_settings')
            .select('*');

        if (settingsError) throw settingsError;

        // Convert array to object { key: value }
        const settingsObj = settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {});

        return NextResponse.json(settingsObj);
    } catch (error) {
        console.error('[ADMIN-SETTINGS] GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: Update settings
export async function POST(request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !user || user.email !== ADMIN_EMAIL) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { key, value } = await request.json();

        if (!key) return NextResponse.json({ error: 'Key is required' }, { status: 400 });

        const { error: upsertError } = await supabaseAdmin
            .from('system_settings')
            .upsert({ key, value, updated_at: new Date().toISOString() });

        if (upsertError) throw upsertError;

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[ADMIN-SETTINGS] POST error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
