import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = 'gideongsr94@gmail.com';

export async function DELETE(request) {
    try {
        // 1. Verify the caller is the admin
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

        // 2. Get user ID to delete from request body
        const { userId } = await request.json();
        if (!userId) {
            return NextResponse.json({ error: 'userId is required' }, { status: 400 });
        }

        // 3. Safety: never allow deleting yourself
        if (userId === user.id) {
            return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
        }

        // 4. Delete profiles row first (in case there's no cascade)
        await supabaseAdmin.from('profiles').delete().eq('id', userId);

        // 5. Delete banners
        await supabaseAdmin.from('banners').delete().eq('user_id', userId);

        // 6. Delete page views
        try {
            await supabaseAdmin.from('page_views').delete().eq('user_id', userId);
        } catch { /* table may not exist yet */ }

        // 7. Delete from auth.users (this also cascades sessions, tokens, identities)
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (deleteError) {
            return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('[DELETE-USER] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
