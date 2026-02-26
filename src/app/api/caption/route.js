import { fal } from "@fal-ai/client";
import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const { prompt } = await request.json();

        if (!process.env.FAL_KEY) {
            return NextResponse.json({ error: 'FAL_KEY missing' }, { status: 500 });
        }

        if (!prompt) {
            return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
        }

        console.log('[CAPTION-API] Generating caption via Fal.ai (Gemini Flash) for prompt:', prompt.substring(0, 50) + '...');

        const systemPrompt = `Você é um Copywriter Especialista em Gastronomia de alto nível.
Sua tarefa é criar uma legenda persuasiva e atraente para uma publicação no Instagram e WhatsApp, baseada no briefing do usuário.

REGRAS CRÍTICAS:
1. RETORNE APENAS A LEGENDA: Não escreva "Opção 1", "Legenda:", "Sugestão:" ou qualquer título. Comece o texto diretamente com o gancho da legenda.
2. FOCO NO CLIENTE: A linguagem deve abrir o apetite e gerar desejo imediato.
3. ESTRUTURA:
   - Gancho inicial impactante.
   - Corpo do texto com benefícios e descrição suculenta.
   - Chamada para ação (CTA) clara (ex: "Peça pelo link na bio", "Venha nos visitar").
   - Uso estratégico de emojis gastronômicos.
   - Hashtags relevantes no final (máximo 5).
4. TOM: Amigável, vibrante e profissional.
5. IDIOMA: Português do Brasil.
6. LIMITE: No máximo 1500 caracteres.

BRIEFING: "${prompt}"`;

        const result = await fal.subscribe("fal-ai/any-llm", {
            input: {
                model: "google/gemini-2.0-flash-001",
                system_prompt: systemPrompt,
                prompt: `Crie uma legenda para: ${prompt}`,
                max_tokens: 1000,
                temperature: 0.7
            },
            logs: true,
        });

        const text = result.data?.output || result.data?.text;

        if (!text) {
            console.error('[CAPTION-API] Fal error:', result);
            throw new Error('O modelo Fal.ai não retornou nenhum texto.');
        }

        return NextResponse.json({ caption: text.trim() });

    } catch (error) {
        console.error('Erro na geração de legenda Fal.ai:', error);
        return NextResponse.json({
            error: error.message || 'Erro desconhecido na Fal.ai'
        }, { status: 500 });
    }
}
