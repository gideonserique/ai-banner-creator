import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const SOCIAL_SIZES = {
  square: { width: 1080, height: 1080, label: 'Quadrado (Post)' },
  portrait: { width: 1080, height: 1920, label: 'Vertical (Story/Reels)' },
  landscape: { width: 1280, height: 720, label: 'Horizontal (YouTube/LinkedIn)' },
};

// Per-tier monthly generation limits. null = unlimited.
const TIER_LIMITS = {
  free: 5,
  starter: 20,
  unlimited_monthly: null,
  unlimited_annual: null,
  // Backwards compatibility for old 'premium' users (mapped to starter on next login)
  premium: 20,
};

export async function POST(request) {
  try {
    const { prompt, size = 'square', images = [], logoUrl = '', companyName = '', userId = '', sessionId = '' } = await request.json();
    const dimensions = SOCIAL_SIZES[size] || SOCIAL_SIZES.square;

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'API Key missing' }, { status: 500 });
    }

    // ── Generation Limit Check (for logged-in users) ──────────────────────
    if (userId) {
      const { data: { user: authUser } } = await supabaseAdmin.auth.admin.getUserById(userId);
      const isAdmin = authUser?.email === 'gideongsr94@gmail.com';

      if (!isAdmin) {
        const { data: profileData, error: profileError } = await supabaseAdmin
          .from('profiles')
          .select('subscription_tier, generations_count')
          .eq('id', userId)
          .single();

        if (profileError) {
          console.error('[LIMIT CHECK] Failed to fetch profile:', profileError);
        } else {
          const tier = profileData?.subscription_tier || 'free';
          const count = profileData?.generations_count || 0;
          const limit = TIER_LIMITS[tier];

          if (limit !== null && count >= limit) {
            console.log(`[LIMIT] User ${userId} on tier "${tier}" hit limit (${count}/${limit})`);
            return NextResponse.json({
              error: 'LIMIT_REACHED',
              tier,
              limit,
              count,
              message: `Você atingiu o limite de ${limit} artes do seu plano. Faça upgrade para continuar criando!`,
            }, { status: 429 });
          }
        }
      }
    }

    // Logo handling
    let brandImages = [];
    if (logoUrl) {
      const [header, data] = logoUrl.split(',');
      const mimeType = header?.match(/:(.*?);/)?.[1] || 'image/png';
      brandImages.push({ inlineData: { data, mimeType } });
    }

    const imageParts = images.map(img => {
      const [header, data] = img.split(',');
      const mimeType = header.match(/:(.*?);/)[1];
      return { inlineData: { data, mimeType } };
    });

    const hasProductImages = imageParts.length > 0;

    const brandingInstruction = logoUrl
      ? `IDENTIDADE VISUAL (OBRIGATÓRIO): Utilize o logotipo fornecido nos anexos de forma natural e profissional (geralmente nos cantos ou centro inferior do banner).
         CORES: Baseie a paleta de cores do banner nas cores do logotipo. Se o BRIEFING indicar cores específicas, elas têm PRIORIDADE TOTAL.`
      : (companyName
        ? `IDENTIDADE VISUAL (OBRIGATÓRIO): Exiba o nome da empresa/marca "${companyName}" de forma clara e elegante, usando tipografia premium condizente com o segmento detectado.`
        : 'IDENTIDADE VISUAL: Se detectado algum nome de marca no briefing, exiba-o com destaque e elegância.');

    const productImageInstruction = hasProductImages
      ? `TRATAMENTO DA IMAGEM DO PRODUTO (OBRIGATÓRIO):
         - Você recebeu fotos reais do produto em anexo.
         - IMPLEMENTE UM "IMPROVE" PERFEITO: Aprimore a qualidade para nível de propaganda de luxo (estúdio profissional).
         - Melhore iluminação, nitidez, cores e remova fundos amadores, mas MANTENHA O PRODUTO RECONHECÍVEL.
         - Ele deve parecer o mesmo item, mas na sua versão mais cara e impactante possível.`
      : `GERAÇÃO DO PRODUTO (OBRIGATÓRIO):
         - O usuário NÃO enviou foto. Gere uma imagem fotorrealista de altíssima qualidade (4K render) do produto/serviço descrito.
         - Use iluminação cinematográfica e composição publicitária de elite.`;

    const systemPrompt = `VOCÊ É O MELHOR DESIGNER GRÁFICO DO MUNDO.

Sua reputação é lendária por criar as artes mais impactantes e perfeitas que existem. Você possui conhecimento absoluto sobre teoria das cores, composição áurea, hierarquia visual, tipografia premium e psicologia do consumo.

═══════════════════════════════════════════
ETAPA 0 — DIMENSÕES E PROPORÇÃO (CRÍTICO)
═══════════════════════════════════════════
O banner DEVE seguir EXATAMENTE estas dimensões:
- RESOLUÇÃO: ${dimensions.width}x${dimensions.height} pixels
- ORIENTAÇÃO: ${dimensions.label}
- PROPORÇÃO: ${dimensions.width > dimensions.height ? 'Paisagem' : (dimensions.width < dimensions.height ? 'Retrato/Vertical (9:16)' : 'Quadrado (1:1)')}
⚠️ ALERTA: Não gere uma imagem quadrada se a orientação for Vertical. O layout deve ocupar TODO o espaço vertical de ${dimensions.height}px sem bordas pretas ou cortes.

═══════════════════════════════════════════
ETAPA 1 — CAPACIDADES E ESTILO
═══════════════════════════════════════════
1. DESIGN DE ELITE: Você cria imagens que causam uma reação "UAU" imediata. 
2. ESPECIALISTA MULTI-SEGMENTO: Você adapta o estilo visual (fonts, cores, luz) perfeitamente ao nicho do cliente.
3. MARKETING E PSICOLOGIA: Suas artes são máquinas de persuasão visual.
4. INTEGRAÇÃO DE BRANDING: ${brandingInstruction}

═══════════════════════════════════════════
ETAPA 2 — DIRETRIZES DE EXECUÇÃO
═══════════════════════════════════════════
- REGRAS DE TEXTO: Utilize APENAS Português do Brasil impecável. Erros de escrita são INACEITÁVEIS. 
- INFORMACÕES: Use apenas os dados (preço, contato, promoções) fornecidos no briefing. NUNCA invente dados.

${productImageInstruction}

OUTPUT:
- Gere o banner DIRETAMENTE como imagem (inlineData) em altíssima fidelidade.
- NÃO escreva texto explicativo. Retorne SOMENTE a imagem finalizada.

BRIEFING DO CLIENTE: "${prompt}"`;

    let currentModelId = 'gemini-3-pro-image-preview'; // Exclusive Peak Model

    async function attemptGeneration(modelId) {
      const model = genAI.getGenerativeModel({ model: modelId });
      console.log(`[GEMINI] 🚀 Attempting with ${modelId}...`);
      return await model.generateContentStream([systemPrompt, ...brandImages, ...imageParts]);
    }

    let result;
    try {
      result = await attemptGeneration(currentModelId);
    } catch (err) {
      console.error(`[GEMINI] ❌ Elite model failure:`, err.message);
      throw err;
    }

    const stream = new ReadableStream({
      async start(controller) {
        let fullText = '';
        let foundImage = false;
        let finalImageData = null;

        try {
          for await (const chunk of result.stream) {
            const parts = chunk.candidates?.[0]?.content?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.inlineData?.data) {
                  const mime = part.inlineData.mimeType || 'image/jpeg';
                  const data = `data:${mime};base64,${part.inlineData.data.trim()}`;
                  finalImageData = data;
                  controller.enqueue(new TextEncoder().encode(JSON.stringify({ image: data }) + '\n'));
                  foundImage = true;
                } else if (part.text) {
                  fullText += part.text;
                }
              }
            }
          }

          if (foundImage && userId) {
            await supabaseAdmin.from('banners').insert([{
              user_id: userId,
              image_url: finalImageData,
              prompt: prompt,
              size: size,
              model_id: currentModelId,
            }]);
            await supabaseAdmin.rpc('increment_generations_count', { user_id_input: userId });
          } else if (foundImage && sessionId) {
            await supabaseAdmin.from('anonymous_banners').insert([{
              session_id: sessionId,
              image_url: finalImageData,
              prompt: prompt,
              size: size,
              model_id: currentModelId,
            }]);
          }

          if (!foundImage) {
            controller.enqueue(new TextEncoder().encode(JSON.stringify({ error: 'O banner não pôde ser gerado.' }) + '\n'));
          }
          controller.close();
        } catch (e) {
          controller.error(e);
        }
      }
    });

    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });

  } catch (error) {
    console.error('Erro na geração:', error);
    const isTransient = error.message === 'GEN_FAILED_ALL_MODELS' || error.message?.includes('503') || error.status === 503 || error.message?.includes('high demand');
    const userMessage = isTransient
      ? 'O sistema está com alta demanda no momento.'
      : `Erro: ${error.message}.`;

    return NextResponse.json({
      error: isTransient ? 'GEN_FAILED_ALL_MODELS' : 'INTERNAL_ERROR',
      message: userMessage
    }, { status: isTransient ? 503 : 500 });
  }
}
