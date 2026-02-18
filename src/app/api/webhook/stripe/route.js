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
        const customerId = session.customer;

        if (userId) {
            console.log(`Upgrade user ${userId} to Premium`);

            const { error } = await supabaseAdmin
                .from('profiles')
                .update({
                    subscription_tier: 'premium',
                    stripe_customer_id: customerId
                })
                .eq('id', userId);

            if (error) {
                console.error('Error updating profile to premium:', error);
            }
        }
    }

    if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        console.log(`Subscription deleted for customer ${customerId}. Downgrading to free.`);

        const { error } = await supabaseAdmin
            .from('profiles')
            .update({ subscription_tier: 'free' })
            .eq('stripe_customer_id', customerId);

        if (error) {
            console.error('Error downgrading profile to free:', error);
        }
    }

    if (event.type === 'customer.subscription.updated') {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const status = subscription.status;

        // Se a assinatura não estiver mais ativa ou em período de teste, voltamos para free
        const isPremium = status === 'active' || status === 'trialing';
        const tier = isPremium ? 'premium' : 'free';

        console.log(`Subscription updated for customer ${customerId}. Status: ${status}. Tier: ${tier}`);

        const { error } = await supabaseAdmin
            .from('profiles')
            .update({ subscription_tier: tier })
            .eq('stripe_customer_id', customerId);

        if (error) {
            console.error('Error syncing profile subscription tier:', error);
        }
    }

    return NextResponse.json({ received: true });
}
