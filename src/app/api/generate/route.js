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

    const systemPrompt = `Design a professional ${dimensions.label} social media banner (${dimensions.width}x${dimensions.height}).
    
    CRITICAL RULES:
    1. FULL BLEED: The design MUST fill the entire canvas. No borders or margins.
    2. CONTENT: Use ONLY the following information: "${prompt}". Do not invent details.
    3. LANGUAGE: All text must be in perfect Brazilian Portuguese.
    4. NO PLACEHOLDERS: Do not include phrases like "image not included" or technical metadata.
    5. QUALITY: Professional studio lighting, premium typography, and harmonious colors.
    
    ${productImageInstruction}
    ${brandingInstruction}
    
    OUTPUT: Return the banner as a single, high-quality image.`;

    // ── Simplified Logic: GEMINI 3.0 PRO ONLY (Single Attempt, Non-Streaming)
    let finalModelResponse;
    const currentModelId = 'gemini-3-pro-image-preview';

    try {
      const model = genAI.getGenerativeModel({ model: currentModelId });
      console.log(`[GEMINI] Generating banner with ${currentModelId}...`);

      const result = await model.generateContent([systemPrompt, ...brandImages, ...imageParts]);
      finalModelResponse = await result.response;
      console.log('[GEMINI] Response received.');
    } catch (err) {
      console.error(`[GEMINI] ${currentModelId} failed.`, err);
      throw err;
    }

    let finalImageData = null;
    let foundImage = false;

    // Extraction: Check inlineData first
    const parts = finalModelResponse.candidates?.[0]?.content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || 'image/jpeg';
          finalImageData = `data:${mime};base64,${part.inlineData.data.trim()}`;
          foundImage = true;
          break;
        }
      }
    }

    // Extraction: Fallback to regex if binary part missing
    if (!foundImage) {
      try {
        const text = finalModelResponse.text();
        if (text) {
          console.log('[DEBUG] AI returned text instead of binary. Length:', text.length);
          const b64Regex = /(?:data:image\/(?:jpeg|png|webp);base64,)?(?:[A-Za-z0-9+/]{4}){1000,}/g;
          const matches = text.match(b64Regex);
          if (matches && matches.length > 0) {
            let cleanM = matches[0];
            if (cleanM.includes('base64,')) cleanM = cleanM.split('base64,')[1];
            cleanM = cleanM.replace(/[\r\n\s]/g, '');
            const mime = cleanM.startsWith('/9j/') ? 'image/jpeg' : 'image/png';
            finalImageData = `data:${mime};base64,${cleanM}`;
            foundImage = true;
          }
        }
      } catch (textErr) {
        console.warn('[GEMINI] Failed to extract text from response (likely blocked or binary-only):', textErr.message);
      }
    }

    if (!foundImage) {
      console.error('EXTRACTION FAILED. Parts:', parts?.length || 0);
      return NextResponse.json({ error: 'O banner não pôde ser gerado. O modelo não devolveu uma imagem válida.' }, { status: 500 });
    }

    // SERVER-SIDE AUTO SAVE (handled by DB triggers, no more manual RPC)
    try {
      if (userId) {
        console.log(`[SERVER-SAVE] Saving for user: ${userId}`);
        await supabaseAdmin.from('banners').insert([{
          user_id: userId,
          image_url: finalImageData,
          prompt: prompt,
          size: size,
          model_id: currentModelId,
        }]);
      } else if (sessionId) {
        console.log(`[ANON-SAVE] Saving for session: ${sessionId}`);
        await supabaseAdmin.from('anonymous_banners').insert([{
          session_id: sessionId,
          image_url: finalImageData,
          prompt: prompt,
          size: size,
          model_id: currentModelId,
        }]);
      }
    } catch (saveError) {
      console.error('[DATABASE-SAVE] Background save error:', saveError);
    }

    return NextResponse.json({ image: finalImageData });

  } catch (error) {
    console.error('Erro na geração:', error);
    const isTransient = error.message?.includes('503') || error.status === 503 || error.message?.includes('high demand');
    const userMessage = isTransient
      ? 'O sistema está com alta demanda no momento. Por favor, aguarde alguns segundos e tente novamente.'
      : `Erro: ${error.message}.`;
    return NextResponse.json({ error: userMessage }, { status: isTransient ? 503 : 500 });
  }
}
