import { headers } from 'next/headers';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export async function POST(req) {
    console.log('--- STRIPE WEBHOOK START ---');

    try {
        const body = await req.text();
        const signature = headers().get('stripe-signature');

        console.log('Checking Environment Variables:');
        console.log('- STRIPE_WEBHOOK_SECRET:', process.env.STRIPE_WEBHOOK_SECRET ? '✅ Present' : '❌ MISSING');
        console.log('- SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Present' : '❌ MISSING');

        let event;

        try {
            event = stripe.webhooks.constructEvent(
                body,
                signature,
                process.env.STRIPE_WEBHOOK_SECRET
            );
        } catch (err) {
            console.error(`❌ Webhook signature verification failed: ${err.message}`);
            return new Response(`Webhook Error: ${err.message}`, { status: 400 });
        }

        console.log(`🔔 Event Type: ${event.type}`);

        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const userId = session.client_reference_id;
            const customerId = session.customer;

            console.log(`👤 Processing user: ${userId} | Customer: ${customerId}`);

            if (userId) {
                const { data, error } = await supabaseAdmin
                    .from('profiles')
                    .update({
                        subscription_tier: 'premium',
                        stripe_customer_id: customerId
                    })
                    .eq('id', userId)
                    .select();

                if (error) {
                    console.error('❌ Supabase Error:', error);
                    throw error;
                }
                console.log('✅ Update Success:', data);
            }
        }

        // Outros eventos (opcional adicionar logs similares)
        if (event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.updated') {
            const subscription = event.data.object;
            const customerId = subscription.customer;
            const status = subscription.status;
            const tier = (status === 'active' || status === 'trialing') ? 'premium' : 'free';

            console.log(`🔄 Syncing subscription for ${customerId} to ${tier}`);

            const { error } = await supabaseAdmin
                .from('profiles')
                .update({ subscription_tier: tier })
                .eq('stripe_customer_id', customerId);

            if (error) {
                console.error('❌ Supabase Sync Error:', error);
                throw error;
            }
        }

        console.log('--- STRIPE WEBHOOK END (Success) ---');
        return NextResponse.json({ received: true });

    } catch (globalError) {
        console.error('🔥 GLOBAL WEBHOOK CRASH:', globalError);
        return NextResponse.json({
            error: 'Internal Webhook Error',
            details: globalError.message
        }, { status: 500 });
    }
}
