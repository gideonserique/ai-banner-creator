import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';

// Maps plan slugs to Stripe Price ID environment variables
const PLAN_PRICE_MAP = {
    starter: process.env.STRIPE_PRICE_STARTER,
    unlimited_monthly: process.env.STRIPE_PRICE_UNLIMITED_MONTHLY,
    unlimited_annual: process.env.STRIPE_PRICE_UNLIMITED_ANNUAL,
};

export async function POST(req) {
    try {
        const { userId, email, planId } = await req.json();

        if (!userId) {
            return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
        }

        if (!planId || !PLAN_PRICE_MAP[planId]) {
            return NextResponse.json({ error: `Invalid or unsupported planId: "${planId}". Valid options: starter, unlimited_monthly, unlimited_annual` }, { status: 400 });
        }

        const priceId = PLAN_PRICE_MAP[planId];

        if (!priceId) {
            return NextResponse.json({ error: `Stripe Price ID for plan "${planId}" is not configured. Please add STRIPE_PRICE_${planId.toUpperCase()} to your environment variables.` }, { status: 500 });
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'http://localhost:3000';

        if (!appUrl.startsWith('http')) {
            throw new Error(`Invalid NEXT_PUBLIC_APP_URL: ${appUrl}. It must start with http:// or https://`);
        }

        const success_url = `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&plan=${planId}`;
        const cancel_url = `${appUrl}/profile?canceled=true`;

        console.log(`🛒 Creating Stripe Checkout for plan: ${planId} (${priceId})`);

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            mode: 'subscription',
            allow_promotion_codes: true,
            success_url,
            cancel_url,
            customer_email: email,
            client_reference_id: userId,
            metadata: {
                userId,
                planId, // Critical: used by webhook to assign correct tier
            },
        });

        return NextResponse.json({ url: session.url });
    } catch (err) {
        console.error('Stripe Checkout Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
