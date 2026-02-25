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

    const systemPrompt = `Você é um Designer Especialista em Banners para Redes Sociais de Classe Mundial.
Sua tarefa é gerar 1 ÚNICO banner publicitário profissional de resolução 4K (${dimensions.width}x${dimensions.height}), formato "${dimensions.label}".

BRIEFING DO CLIENTE: "${prompt}"`;

    // ── Streamlined "Double-Shot" Logic ──────────────────────
    let result;
    let currentModelId = 'gemini-3-pro-image-preview';

    async function attemptGeneration(modelId) {
      const model = genAI.getGenerativeModel({ model: modelId });
      console.log(`[GEMINI] 🚀 Critical Attempt with ${modelId}...`);
      return await model.generateContentStream([systemPrompt, ...brandImages, ...imageParts]);
    }

    try {
      // SHOT 1: Gemini 3.0 Pro (Priority)
      result = await attemptGeneration(currentModelId);
    } catch (err) {
      const isTransient = err.message?.includes('503') || err.status === 503 || err.message?.includes('high demand');
      if (isTransient) {
        console.warn(`[GEMINI] ⚠️ 3.0 Pro failed (High Demand). Switching to 2.5 Flash...`);
        // SHOT 2: Gemini 2.5 Flash (Reliability)
        currentModelId = 'gemini-2.5-flash-image';
        try {
          result = await attemptGeneration(currentModelId);
        } catch (err2) {
          console.error(`[GEMINI] ❌ Both models failed.`);
          throw new Error('GEN_FAILED_ALL_MODELS');
        }
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
