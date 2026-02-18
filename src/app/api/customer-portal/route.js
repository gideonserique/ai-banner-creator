import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';

export async function POST(req) {
    try {
        const { customerId } = await req.json();

        if (!customerId) {
            return NextResponse.json({ error: 'Customer ID is required' }, { status: 400 });
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'http://localhost:3000';

        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${appUrl}/profile`,
        });

        return NextResponse.json({ url: session.url });
    } catch (err) {
        console.error('Stripe Portal Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
