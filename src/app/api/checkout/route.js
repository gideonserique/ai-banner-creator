import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';

export async function POST(req) {
    try {
        const { userId, email } = await req.json();

        if (!userId) {
            return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'brl',
                        product_data: {
                            name: 'BannerIA Premium',
                            description: 'Banners ilimitados e suporte VIP.',
                        },
                        unit_amount: 2990, // R$ 29,90
                        recurring: {
                            interval: 'month',
                        },
                    },
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: `${process.env.NEXT_PUBLIC_APP_URL}/profile?success=true`,
            cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/profile?canceled=true`,
            customer_email: email,
            client_reference_id: userId,
            metadata: {
                userId: userId,
            },
        });

        return NextResponse.json({ url: session.url });
    } catch (err) {
        console.error('Stripe Checkout Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
