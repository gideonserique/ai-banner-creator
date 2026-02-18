import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';

export async function POST(req) {
    try {
        const { userId, email } = await req.json();

        if (!userId) {
            return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'http://localhost:3000';

        if (!appUrl.startsWith('http')) {
            throw new Error(`Invalid NEXT_PUBLIC_APP_URL: ${appUrl}. It must start with http:// or https://`);
        }

        const success_url = `${appUrl}/profile?success=true`;
        const cancel_url = `${appUrl}/profile?canceled=true`;

        console.log('🔗 Creating Stripe Session with:', { success_url, cancel_url });

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    // Prioridade 1: Usar um Price ID fixo (Recomendado para assinaturas)
                    ...(process.env.STRIPE_PRICE_ID
                        ? { price: process.env.STRIPE_PRICE_ID }
                        : {
                            // Prioridade 2: Usar dados dinâmicos (mas pode ser vinculado a um produto fixo via ID)
                            price_data: {
                                currency: 'brl',
                                product: process.env.STRIPE_PRODUCT_ID || undefined,
                                ...(process.env.STRIPE_PRODUCT_ID ? {} : {
                                    product_data: {
                                        name: 'BannerIA Premium',
                                        description: 'Banners ilimitados e suporte VIP.',
                                    },
                                }),
                                unit_amount: 2990, // R$ 29,90
                                recurring: {
                                    interval: 'month',
                                },
                            },
                        }
                    ),
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url,
            cancel_url,
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
