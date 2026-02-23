import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

// Maps Stripe Price IDs to our internal tier slugs
function getTierFromPriceId(priceId) {
    if (!priceId) return null;
    if (priceId === process.env.STRIPE_PRICE_STARTER) return 'starter';
    if (priceId === process.env.STRIPE_PRICE_UNLIMITED_MONTHLY) return 'unlimited_monthly';
    if (priceId === process.env.STRIPE_PRICE_UNLIMITED_ANNUAL) return 'unlimited_annual';
    return null;
}

export async function POST(req) {
    console.log('--- STRIPE WEBHOOK START ---');

    try {
        const body = await req.text();
        const sig = req.headers.get('stripe-signature');

        let event;
        try {
            event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
        } catch (err) {
            console.error(`❌ Webhook signature failed: ${err.message}`);
            return new Response(`Webhook Error: ${err.message}`, { status: 400 });
        }

        console.log(`🔔 Event: ${event.type}`);

        // ─── Checkout Completed: Grant the purchased tier ───────────────────
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const userId = session.client_reference_id;
            const customerId = session.customer;
            const planId = session.metadata?.planId;

            console.log(`👤 User: ${userId} | Plan: ${planId} | Customer: ${customerId}`);

            if (!userId) {
                console.error('❌ No userId in event metadata – skipping.');
                return NextResponse.json({ received: true });
            }

            // Fetch subscription to get the period end date
            let subscriptionExpiresAt = null;
            let stripeSubscriptionId = null;
            let stripePriceId = null;

            if (session.subscription) {
                const subscription = await stripe.subscriptions.retrieve(session.subscription);
                subscriptionExpiresAt = new Date(subscription.current_period_end * 1000).toISOString();
                stripeSubscriptionId = subscription.id;
                stripePriceId = subscription.items.data[0]?.price?.id;
            }

            // Determine tier: prefer planId from metadata, fallback to price lookup
            const tier = planId || getTierFromPriceId(stripePriceId) || 'starter';

            const { error } = await supabaseAdmin
                .from('profiles')
                .update({
                    subscription_tier: tier,
                    stripe_customer_id: customerId,
                    stripe_subscription_id: stripeSubscriptionId,
                    stripe_price_id: stripePriceId,
                    subscription_expires_at: subscriptionExpiresAt,
                    // Reset generation count on plan change
                    generations_count: 0,
                })
                .eq('id', userId);

            if (error) {
                console.error('❌ Supabase update error:', error);
                throw error;
            }
            console.log(`✅ User ${userId} upgraded to ${tier}, expires ${subscriptionExpiresAt}`);
        }

        // ─── Subscription Updated: Sync tier and renewal date ───────────────
        if (event.type === 'customer.subscription.updated') {
            const subscription = event.data.object;
            const customerId = subscription.customer;
            const status = subscription.status;
            const priceId = subscription.items.data[0]?.price?.id;
            const subscriptionExpiresAt = new Date(subscription.current_period_end * 1000).toISOString();

            // Determine tier based on status and price
            let tier = 'free';
            if (status === 'active' || status === 'trialing') {
                tier = getTierFromPriceId(priceId) || 'starter';
            }

            console.log(`🔄 Sub updated for ${customerId}: ${tier}, expires ${subscriptionExpiresAt}`);

            const { error } = await supabaseAdmin
                .from('profiles')
                .update({
                    subscription_tier: tier,
                    stripe_price_id: priceId,
                    subscription_expires_at: subscriptionExpiresAt,
                })
                .eq('stripe_customer_id', customerId);

            if (error) {
                console.error('❌ Supabase sync error:', error);
                throw error;
            }
        }

        // ─── Subscription Deleted: Downgrade to Free ──────────────────────
        if (event.type === 'customer.subscription.deleted') {
            const subscription = event.data.object;
            const customerId = subscription.customer;

            console.log(`🗑️ Subscription deleted for ${customerId} → downgrading to free`);

            const { error } = await supabaseAdmin
                .from('profiles')
                .update({
                    subscription_tier: 'free',
                    stripe_subscription_id: null,
                    stripe_price_id: null,
                    subscription_expires_at: null,
                    generations_count: 0,
                })
                .eq('stripe_customer_id', customerId);

            if (error) {
                console.error('❌ Supabase downgrade error:', error);
                throw error;
            }
        }

        console.log('--- STRIPE WEBHOOK END (Success) ---');
        return NextResponse.json({ received: true });

    } catch (globalError) {
        console.error('🔥 WEBHOOK CRASH:', globalError);
        return NextResponse.json({
            error: 'Internal Webhook Error',
            details: globalError.message
        }, { status: 500 });
    }
}
