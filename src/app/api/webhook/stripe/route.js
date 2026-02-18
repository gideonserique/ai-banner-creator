import { headers } from 'next/headers';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export async function POST(req) {
    const body = await req.text();
    const signature = headers().get('stripe-signature');

    let event;

    try {
        event = stripe.webhooks.constructEvent(
            body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }

    // Handle the event
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const userId = session.client_reference_id;

        if (userId) {
            console.log(`Upgrade user ${userId} to Premium`);

            const { error } = await supabaseAdmin
                .from('profiles')
                .update({ subscription_tier: 'premium' })
                .eq('id', userId);

            if (error) {
                console.error('Error updating profile to premium:', error);
            }
        }
    }

    return NextResponse.json({ received: true });
}
