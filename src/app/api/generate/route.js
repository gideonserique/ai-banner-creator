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
      } else {
        console.log(`[ADMIN] User ${userId} (${authUser?.email}) bypassing limits.`);
      }
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-image-preview' });

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
        : '');

    const productImageInstruction = hasProductImages
      ? `TRATAMENTO DA IMAGEM DO PRODUTO (OBRIGATÓRIO):
         - Você receberá uma ou mais fotos reais do produto nos anexos.
         - APRIMORE a qualidade da foto: corrija iluminação, contraste, nitidez e cores para nível de estúdio profissional.
         - REMOVA ou substitua o fundo original por um fundo limpo, gradiente ou ambientado — compatível com o estilo do banner.
         - MANTENHA FIELMENTE todas as características do produto original: forma, cor, textura, detalhes — o produto deve ser claramente reconhecível como o mesmo da foto enviada.
         - Integre o produto de forma harmoniosa e impactante ao layout do banner.`
      : `GERAÇÃO DO PRODUTO (OBRIGATÓRIO):
         - O usuário NÃO enviou foto. Gere uma imagem fotorrealista, de alta qualidade e profissional do produto ou serviço descrito no briefing.
         - Use iluminação de estúdio, ângulo favorável e render de muito alta qualidade, como se fosse uma foto profissional tirada para publicidade.`;

    const systemPrompt = `Você é um Designer Especialista em Banners para Redes Sociais de Classe Mundial.
Você domina criação de materiais publicitários de alta performance para QUALQUER tipo de negócio: varejo, tecnologia, moda, beleza, alimentação, serviços, saúde, educação, imóveis, automotivo, e muito mais.

Sua tarefa é gerar 1 ÚNICO banner publicitário profissional de resolução 4K (${dimensions.width}x${dimensions.height}), formato "${dimensions.label}".

═══════════════════════════════════════════
ETAPA 1 — ANÁLISE INTELIGENTE DO SEGMENTO
═══════════════════════════════════════════
Antes de criar, analise CUIDADOSAMENTE:
• O BRIEFING do usuário (texto, produto, serviço descrito)  
• As IMAGENS enviadas (se houver) — identifique o produto, categoria e contexto visual

Com essa análise, determine o SEGMENTO (ex: eletrônico, restaurante, salão de beleza, academia, clínica, imobiliária, loja de roupas, etc.) e adapte COMPLETAMENTE o design:

EXEMPLOS DE ADAPTAÇÃO POR SEGMENTO:
- Eletrônico/Tecnologia → Design clean, cores frias (azul/preto/branco), tipografia tech, render 3D, fundo escuro ou gradiente futurista
- Alimentação/Delivery → Cores quentes e apetitosas, iluminação "suculenta", close do produto, fundo rústico ou moderno
- Moda/Vestuário → Estilo editorial, paleta sofisticada, lifestyle, fontes elegantes
- Beleza/Estética → Tom rosê/dourado/nude, elegância, texturas suaves, luz suave difusa
- Academia/Fitness → Energia, cores vibrantes, tipografia bold, contraste alto
- Saúde/Clínica → Profissionalism, azul/verde, clean, transmits confiança
- Serviços/Prestador → Foco no benefício, tipografia clara, call-to-action forte
- Imóveis → Foto de impacto, tons sóbrios, sofisticação, detalhes arquitetônicos

═══════════════════════════════════════════
ETAPA 2 — EXECUÇÃO DO BANNER (REGRAS CRÍTICAS)
═══════════════════════════════════════════

DESIGN TELA CHEIA (FULL BLEED):
- O design DEVE ocupar 100% da área do banner (${dimensions.width}x${dimensions.height}).
- NUNCA gere o banner com bordas, margens brancas/pretas ou emoldurado dentro de outro fundo.
- O plano de fundo e os elementos devem chegar até o limite extremo da imagem.

${productImageInstruction}

${brandingInstruction}

INFORMAÇÕES E TEXTOS (FIDELIDADE TOTAL):
- Inclua NO BANNER APENAS as informações que o usuário especificou no briefing: preços, telefone, promoções, etc.
- NUNCA adicione frases de erro, avisos técnicos ou metadados como "Image not included", "Foto meramente ilustrativa" ou avisos de direitos autorais, A MENOS QUE o usuário tenha pedido explicitamente.
- NUNCA invente informações fictícias (telefones falsos, links). Se a informação não está no briefing, não coloque no banner.
- REVISÃO GRAMATICAL: Use EXCLUSIVAMENTE Português do Brasil. Revise 3 vezes a ortografia e acentuação antes de gerar. Erros de digitação são inaceitáveis.

QUALIDADE TÉCNICA (OBRIGATÓRIO):
- Composição visual profissional com hierarquia clara de informações
- Tipografia premium e legível, adequada ao segmento
- Cores harmoniosas e impactantes, alinhadas ao segmento detectado
- Iluminação de produto de nível estúdio fotográfico profissional
- Arte finalizada, sem elementos amadores ou mal posicionados

OUTPUT:
- Gere o banner DIRETAMENTE como imagem (inlineData) em ${dimensions.width}x${dimensions.height}px
- NÃO escreva texto explicativo. Retorne SOMENTE a imagem.
- Se o modo inlineData falhar, retorne APENAS o Base64 puro da imagem.

BRIEFING DO CLIENTE: "${prompt}"`;

    // ── Retry & Fallback Logic for Gemini 503 Errors ──────────────────────
    let result;
    const maxRetriesPrimary = 5; // Reinforced priority for 3.0 Pro
    const maxRetriesFallback = 2; // Short retry for fallback
    let currentModelId = 'gemini-3-pro-image-preview';

    async function attemptGeneration(modelId, maxRetries) {
      const model = genAI.getGenerativeModel({ model: modelId });
      let retryDelay = 1500; // Increased base delay

      for (let i = 0; i < maxRetries; i++) {
        try {
          console.log(`[GEMINI] Attempting generation with ${modelId} (Try ${i + 1}/${maxRetries})...`);
          return await model.generateContentStream([systemPrompt, ...brandImages, ...imageParts]);
        } catch (err) {
          const isTransient = err.message?.includes('503') || err.status === 503 || err.message?.includes('high demand');
          if (isTransient && i < maxRetries - 1) {
            console.warn(`[GEMINI] Error 503 on ${modelId}. Retrying in ${retryDelay}ms...`);
            await new Promise(r => setTimeout(r, retryDelay));
            retryDelay *= 1.5; // Slightly slower backoff
            continue;
          }
          throw err;
        }
      }
    }

    try {
      result = await attemptGeneration(currentModelId, maxRetriesPrimary);
    } catch (err) {
      const isTransient = err.message?.includes('503') || err.status === 503 || err.message?.includes('high demand');
      if (isTransient) {
        console.error(`[GEMINI] ${currentModelId} failed after ${maxRetriesPrimary} retries. Falling back to gemini-2.5-flash-image...`);
        currentModelId = 'gemini-2.5-flash-image';
        result = await attemptGeneration(currentModelId, maxRetriesFallback);
      } else {
        throw err;
      }
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

          if (!foundImage && fullText) {
            console.log('[DEBUG] Full response text length:', fullText.length);
            const b64Regex = /(?:data:image\/(?:jpeg|png|webp);base64,)?(?:[A-Za-z0-9+/]{4}){1000,}/g;
            const matches = fullText.match(b64Regex);
            if (matches && matches.length > 0) {
              let cleanM = matches[0];
              if (cleanM.includes('base64,')) cleanM = cleanM.split('base64,')[1];
              cleanM = cleanM.replace(/[\r\n\s]/g, '');
              const mime = cleanM.startsWith('/9j/') ? 'image/jpeg' : 'image/png';
              const data = `data:${mime};base64,${cleanM}`;
              finalImageData = data;
              controller.enqueue(new TextEncoder().encode(JSON.stringify({ image: data }) + '\n'));
              foundImage = true;
            }
          }

          // SERVER-SIDE AUTO SAVE — logged user
          if (foundImage && userId) {
            console.log(`[SERVER-SAVE] Saving banner for user: ${userId}`);
            const { error: saveError } = await supabaseAdmin.from('banners').insert([{
              user_id: userId,
              image_url: finalImageData,
              prompt: prompt,
              size: size,
              model_id: currentModelId,
            }]);
            if (saveError) {
              console.error('[SERVER-SAVE] Failed to auto-save:', saveError);
            } else {
              console.log('[SERVER-SAVE] Banner successfully saved.');
              // Increment generation counter (only matters for limited plans, harmless for unlimited)
              const { error: countError } = await supabaseAdmin.rpc('increment_generations_count', { user_id_input: userId });
              if (countError) console.error('[SERVER-SAVE] Failed to increment count:', countError);
              else console.log('[SERVER-SAVE] Generation count incremented.');
            }
          }

          // SERVER-SIDE AUTO SAVE — anonymous user
          if (foundImage && !userId && sessionId) {
            console.log(`[ANON-SAVE] Saving anonymous banner for session: ${sessionId}`);
            const { error: anonError } = await supabaseAdmin.from('anonymous_banners').insert([{
              session_id: sessionId,
              image_url: finalImageData,
              prompt: prompt,
              size: size,
              model_id: currentModelId,
            }]);
            if (anonError) console.error('[ANON-SAVE] Failed to save anonymous banner:', anonError);
            else console.log('[ANON-SAVE] Anonymous banner saved.');
          }

          if (!foundImage) {
            console.error('EXTRACTION FAILED. AI Response Text Length:', fullText.length);
            controller.enqueue(new TextEncoder().encode(JSON.stringify({ error: 'O banner não pôde ser gerado ou o formato retornado é inválido.' }) + '\n'));
          }

          controller.close();
        } catch (e) {
          console.error('Stream error:', e);
          controller.error(e);
        }
      }
    });

    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });

  } catch (error) {
    console.error('Erro na geração:', error);
    const isTransient = error.message?.includes('503') || error.status === 503 || error.message?.includes('high demand');
    const userMessage = isTransient
      ? 'O sistema está com alta demanda no momento. Por favor, aguarde alguns segundos e tente novamente.'
      : `Erro: ${error.message}.`;
    return NextResponse.json({ error: userMessage }, { status: isTransient ? 503 : 500 });
  }
}
