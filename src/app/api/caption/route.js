import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(request) {
    try {
        const { prompt } = await request.json();

        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json({ error: 'API Key missing' }, { status: 500 });
        }

        if (!prompt) {
            return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
        }

        console.log('[CAPTION-API] Generating caption for prompt:', prompt.substring(0, 50) + '...');

        // Tentando gemini-pro que é o modelo de texto mais estável e universal
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

        const systemPrompt = `Você é um Copywriter Especialista em Gastronomia de alto nível.
Sua tarefa é criar uma legenda persuasiva e atraente para uma publicação no Instagram e WhatsApp, baseada no briefing do usuário.

REGRAS:
1. FOCO NO CLIENTE: A linguagem deve abrir o apetite e gerar desejo imediato.
2. ESTRUTURA:
   - Gancho inicial impactante.
   - Corpo do texto com benefícios e descrição suculenta.
   - Chamada para ação (CTA) clara (ex: "Peça pelo link na bio", "Venha nos visitar").
   - Uso estratégico de emojis gastronômicos.
   - Hashtags relevantes no final (máximo 5).
3. TOM: Amigável, vibrante e profissional.
4. IDIOMA: Português do Brasil.
5. LIMITE: No máximo 1500 caracteres.

BRIEFING: "${prompt}"`;

        const result = await model.generateContent(systemPrompt);
        const response = await result.response;
        const text = response.text();

        if (!text) {
            throw new Error('O modelo não retornou nenhum texto.');
        }

        return NextResponse.json({ caption: text.trim() });

    } catch (error) {
        console.error('Erro na geração de legenda:', error);
        return NextResponse.json({
            error: error.message || 'Erro desconhecido na IA'
        }, { status: 500 });
    }
}
