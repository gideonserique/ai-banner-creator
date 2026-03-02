import { fal } from "@fal-ai/client";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const SOCIAL_SIZES = {
  square: { width: 1080, height: 1080, label: "Quadrado (Post)", fal: "square" },
  portrait: { width: 1080, height: 1920, label: "Vertical (Story/Reels)", fal: "portrait_4_5" }, // Flux supports specific sizes
  landscape: { width: 1280, height: 720, label: "Horizontal (YouTube/LinkedIn)", fal: "landscape_16_9" },
};

const TIER_LIMITS = {
  free: 5,
  starter: 20,
  unlimited_monthly: null,
  unlimited_annual: null,
  premium: 20,
};

export async function POST(request) {
  try {
    const { prompt, size = "square", images = [], logoUrl = "", companyName = "", userId = "", sessionId = "" } = await request.json();
    const dimensions = SOCIAL_SIZES[size] || SOCIAL_SIZES.square;

    // ── 0. IP Extraction & Block Check ──────────────────────────────────
    const forwarded = request.headers.get('x-forwarded-for');
    const clientIp = forwarded ? forwarded.split(',')[0].trim() : (request.headers.get('x-real-ip') || 'unknown');

    try {
      const { data: blockSetting } = await supabaseAdmin
        .from('system_settings')
        .select('value')
        .eq('key', 'blocked_ips')
        .single();

      if (blockSetting?.value) {
        const blockedList = JSON.parse(blockSetting.value);
        if (blockedList.some(entry => entry.ip === clientIp)) {
          console.log(`[GENERATE] 🚫 IP bloqueado: ${clientIp}`);
          return NextResponse.json({
            error: "IP_BLOCKED",
            message: "No momento, o serviço de geração não está disponível para o seu dispositivo. Entre em contato com o suporte se acredita que isso é um erro."
          }, { status: 403 });
        }
      }
    } catch (e) {
      // If table/key doesn't exist, no IPs are blocked — continue normally
      console.warn('[GENERATE] Block check skipped:', e.message);
    }

    if (!process.env.FAL_KEY) {
      return NextResponse.json({ error: "FAL_KEY missing" }, { status: 500 });
    }

    // ── 1. Fetch Active Model from System Settings ──────────────────────
    const { data: modelSetting } = await supabaseAdmin
      .from('system_settings')
      .select('value')
      .eq('key', 'active_model_id')
      .single();

    let activeModelId = modelSetting?.value || "fal-ai/flux-2-pro";

    // ── 2. Generation Limit Check ────────────────────────────────────────
    if (userId) {
      const { data: { user: authUser } } = await supabaseAdmin.auth.admin.getUserById(userId);
      const isAdmin = authUser?.email === "gideongsr94@gmail.com";

      if (!isAdmin) {
        const { data: profileData } = await supabaseAdmin
          .from("profiles")
          .select("subscription_tier, generations_count")
          .eq("id", userId)
          .single();

        const tier = profileData?.subscription_tier || "free";
        const count = profileData?.generations_count || 0;
        const limit = TIER_LIMITS[tier];

        if (limit !== null && count >= limit) {
          return NextResponse.json({
            error: "LIMIT_REACHED",
            message: `Você atingiu o limite de ${limit} artes do seu plano.`,
          }, { status: 429 });
        }
      }
    }

    // ── 3. Image Preparation (Upload to Fal Storage) ─────────────────────
    // Note: Fal client usually handles this if we pass URIs, but for base64 we use their storage helper
    async function uploadToFal(base64) {
      try {
        const response = await fetch(base64);
        const blob = await response.blob();
        return await fal.storage.upload(blob);
      } catch (e) {
        console.error("Fal upload error:", e);
        return null;
      }
    }

    const uploadedImages = await Promise.all(images.map(img => uploadToFal(img)));
    const productUrl = uploadedImages[0] || null; // Primary product image

    // ── 4. Prompt Engineering (Elite Designer Persona) ───────────────────
    const lowerPrompt = prompt.toLowerCase();
    let aestheticVibe = "Publicidade de alto impacto, 4k render, iluminação cinematográfica.";

    // Sector-specific adjustment
    if (lowerPrompt.includes('maquiagem') || lowerPrompt.includes('beleza') || lowerPrompt.includes('moda') || lowerPrompt.includes('elegante')) {
      aestheticVibe = "Estilo DELICADO e ELEGANTE. Tons suaves ou vibrantes com transições de cores fluídas. Use texturas suaves, ambientes clean e sofisticados. Evite elementos pesados.";
    } else if (lowerPrompt.includes('tecnologia') || lowerPrompt.includes('app') || lowerPrompt.includes('software') || lowerPrompt.includes('corporativo')) {
      aestheticVibe = "Estilo CORPORATIVO e MODERNO. Minimalismo tech, superfícies foscas ou metálicas, iluminação futurista e limpa. Design funcional e sóbrio.";
    } else if (lowerPrompt.includes('academia') || lowerPrompt.includes('carro') || lowerPrompt.includes('ferramenta') || lowerPrompt.includes('masculino')) {
      aestheticVibe = "Estilo DINÂMICO e FORTE. Tons mais profundos, sombras acentuadas, texturas de concreto, metal ou asfalto. Energia e impacto visual.";
    } else if (lowerPrompt.includes('hamburguer') || lowerPrompt.includes('comida') || lowerPrompt.includes('restaurante') || lowerPrompt.includes('pizza')) {
      aestheticVibe = "Estilo GOURMET e APETECÍVEL. Foco total em texturas reais da comida, iluminação quente e acolhedora, cores que despertam o apetite. Ambiente rústico ou moderno.";
    }

    const brandingInstruction = logoUrl
      ? `ASSINATURA VISUAL (MANDATÓRIO): O logotipo da empresa FOI FORNECIDO nas imagens de referência. Você DEVE usar este logo exato no banner. NÃO tente criar, desenhar ou inventar qualquer outro símbolo, ícone ou logotipo de empresa. Posicione-o de forma profissional e use suas cores como base para a paleta do banner.`
      : (companyName ? `ASSINATURA VISUAL (CRIATIVO): CRIE um logotipo ou marca nominativa premium para a empresa "${companyName}". O design do logo deve ser moderno, impactante e combinar perfeitamente com o nicho (Ex: se for fast food, algo vibrante; se for luxo, algo elegante). Integre esta marca ao banner de forma profissional.` : "");

    const referenceInstruction = productUrl
      ? `PRODUTO FÍSICO (CRITICAL): Analise cada detalhe da foto do produto em anexo. MANTENHA as características originais (forma, cores, texturas). O cenário deve ser criado AO REDOR do produto para valorizá-lo.`
      : "GERE O PRODUTO DESCRITO COM REALISMO FOTOGRÁFICO.";

    const fullPrompt = `VOCÊ É UM DIRETOR DE ARTE ELITE. 
    BANNER ${dimensions.label.toUpperCase()} (${dimensions.width}x${dimensions.height}).
    DIRETRIZ ESTÉTICA: ${aestheticVibe}
    PROPOSTA DO DESIGN (CONTEÚDO PRINCIPAL): ${prompt}
    ${brandingInstruction}
    ${referenceInstruction}
    REGRAS CRÍTICAS DE TEXTO:
    1. TEXTO ESTRITO: Use APENAS o texto solicitado na "PROPOSTA DO DESIGN" para o corpo do anúncio. NÃO adicione frases extras como "Apenas hoje!" se não foi pedido.
    2. Texto apenas em Português impecável.
    REGRAS DE DESIGN & DINAMISMO:
    1. HIERARQUIA VISUAL (CRÍTICO): Varie pesos de fonte, tamanhos e cores para criar contraste e impacto. EVITE textos uniformes onde tudo tem a mesma cor e fonte. Combine tons que se complementam de forma harmônica e premium.
    2. AVOID generic repetitions. NÃO use fundos de mármore ou fontes douradas se não fizerem sentido. 
    3. Crie composições ÚNICAS para cada setor. 
    4. Ocupar 100% do espaço, sem bordas.`;

    // ── 5. Generation Shot (Fal.ai) ──────────────────────────────────────
    console.log(`[FAL.AI] 🚀 Target Model: ${activeModelId}`);

    // Dynamic Endpoint Promotion (Text-to-Image -> Edit/Image-to-Image)
    // FORCE EDIT MODE if we have a product OR a profile logo
    if (productUrl || logoUrl) {
      if (activeModelId === "fal-ai/nano-banana-pro") activeModelId = "fal-ai/nano-banana-pro/edit";
      if (activeModelId === "fal-ai/nano-banana-2") activeModelId = "fal-ai/nano-banana-2/edit";
      if (activeModelId === "fal-ai/gpt-image-1.5") activeModelId = "fal-ai/gpt-image-1.5/edit";
      if (activeModelId === "fal-ai/flux-2-pro") activeModelId = "fal-ai/flux-2-pro/edit";
      if (activeModelId === "fal-ai/recraft-v3") activeModelId = "fal-ai/recraft/v3/image-to-image";
      if (activeModelId.includes("seedream")) activeModelId = "fal-ai/bytedance/seedream/v5/lite/edit";

      console.log(`[FAL.AI] 🛠️ Switching to Edit Endpoint (Asset detected): ${activeModelId}`);
    }

    const input = {
      prompt: fullPrompt,
    };

    // Model-Specific Parameter Normalization
    if (activeModelId.includes("nano-banana")) {
      // Both Nano Banana Pro and Nano Banana 2 use 'aspect_ratio' with colon format
      const ratioMap = { square: "1:1", portrait: "9:16", landscape: "16:9" };
      input.aspect_ratio = ratioMap[size] || "1:1";
    } else if (activeModelId.includes("gpt-image")) {
      // GPT Image expects dimensions like '1024x1024'
      const gptMap = { square: "1024x1024", portrait: "1024x1536", landscape: "1536x1024" };
      input.image_size = gptMap[size] || "1024x1024";
      input.input_fidelity = "high";
    } else {
      // Flux and others usually use 'image_size' with slug format
      input.image_size = dimensions.fal;
      if (activeModelId.includes("flux")) input.sync_mode = true;
    }

    // Force image input if we have either product or logo
    if (productUrl || logoUrl) {
      const allImages = [];
      if (productUrl) allImages.push(productUrl);

      if (logoUrl) {
        // Prepare logo for Fal if not already there (it might be a URL or base64)
        const activeLogo = (logoUrl.startsWith('data:') || logoUrl.startsWith('blob:') || logoUrl.includes('supabase.co'))
          ? await uploadToFal(logoUrl)
          : logoUrl;
        if (activeLogo) allImages.push(activeLogo);
      }

      if (activeModelId.includes("nano-banana") ||
        activeModelId.includes("gpt-image") ||
        activeModelId.includes("seedream") ||
        activeModelId.includes("flux-2-pro")) {
        // Multi-image compatible models
        input.image_urls = allImages;
      } else {
        // Single image models
        input.image_url = productUrl || allImages[0];
      }
    }

    // Call Fal
    const result = await fal.subscribe(activeModelId, {
      input: input,
      logs: true,
    });

    const finalImage = result.data?.images?.[0]?.url;

    if (!finalImage) {
      throw new Error("Fal failed to generate image data.");
    }

    // ── 6. Save & Update Counters ────────────────────────────────────────
    if (userId) {
      await supabaseAdmin.from("banners").insert([{
        user_id: userId,
        image_url: finalImage,
        ref_image_url: productUrl,
        prompt: prompt,
        size: size,
        model_id: activeModelId,
      }]);
      await supabaseAdmin.rpc("increment_generations_count", { user_id_input: userId });
    } else if (sessionId) {
      await supabaseAdmin.from("anonymous_banners").insert([{
        session_id: sessionId,
        image_url: finalImage,
        ref_image_url: productUrl,
        prompt: prompt,
        size: size,
        model_id: activeModelId,
        ip_address: clientIp,
      }]);
    }

    // ── 7. Stream Response (for UI compatibility) ────────────────────────
    // We return a simple SSE stream so the frontend doesn't need to change
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ image: finalImage }) + "\n"));
        controller.close();
      }
    });

    return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });

  } catch (error) {
    console.error("Erro na geração Fal.ai:", error);
    return NextResponse.json({
      error: "INTERNAL_ERROR",
      message: `Erro Fal.ai: ${error.message}`
    }, { status: 500 });
  }
}
