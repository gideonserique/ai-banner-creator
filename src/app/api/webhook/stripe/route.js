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
    console.log(`🔔 Webhook received: ${event.type}`);

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const userId = session.client_reference_id;
        const customerId = session.customer;

        console.log(`💳 Checkout completed for session: ${session.id}`);
        console.log(`👤 User ID from client_reference_id: ${userId}`);
        console.log(`🆔 Stripe Customer ID: ${customerId}`);

        if (userId) {
            console.log(`🚀 Attempting to upgrade user ${userId} to Premium...`);

            const { data, error } = await supabaseAdmin
                .from('profiles')
                .update({
                    subscription_tier: 'premium',
                    stripe_customer_id: customerId
                })
                .eq('id', userId)
                .select();

            if (error) {
                console.error('❌ Error updating profile to premium:', error);
            } else if (data && data.length > 0) {
                console.log('✅ Profile successfully updated to Premium:', data[0]);
            } else {
                console.warn('⚠️ No profile found to update with ID:', userId);
            }
        } else {
            console.warn('⚠️ No userId found in checkout session client_reference_id');
        }
    }

    if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        console.log(`🗑️ Subscription deleted for customer: ${customerId}`);

        const { data, error } = await supabaseAdmin
            .from('profiles')
            .update({ subscription_tier: 'free' })
            .eq('stripe_customer_id', customerId)
            .select();

        if (error) {
            console.error('❌ Error downgrading profile to free:', error);
        } else if (data && data.length > 0) {
            console.log('✅ Profile successfully downgraded to Free:', data[0]);
        } else {
            console.warn('⚠️ No profile found with customer ID:', customerId);
        }
    }

    if (event.type === 'customer.subscription.updated') {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const status = subscription.status;

        console.log(`🔄 Subscription updated for customer: ${customerId}. Status: ${status}`);

        const isPremium = status === 'active' || status === 'trialing';
        const tier = isPremium ? 'premium' : 'free';

        const { data, error } = await supabaseAdmin
            .from('profiles')
            .update({ subscription_tier: tier })
            .eq('stripe_customer_id', customerId)
            .select();

        if (error) {
            console.error('❌ Error syncing profile subscription tier:', error);
        } else if (data && data.length > 0) {
            console.log(`✅ Profile tier synced to ${tier}:`, data[0]);
        } else {
            console.warn('⚠️ No profile found to sync with customer ID:', customerId);
        }
    }

    return NextResponse.json({ received: true });
}
