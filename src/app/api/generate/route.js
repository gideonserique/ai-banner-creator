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

    // ── 4. Prompt Engineering (Designer Persona) ────────────────────────
    const brandingInstruction = logoUrl
      ? `IDENTIDADE VISUAL (OBRIGATÓRIO): Utilize o logotipo fornecido de forma harmônica. Baseie as cores no logotipo.`
      : (companyName ? `IDENTIDADE VISUAL (OBRIGATÓRIO): Inclua o nome da empresa "${companyName}" de forma elegante.` : "");

    const referenceInstruction = productUrl
      ? `LEITURA PROFUNDA DA REFERÊNCIA (OBRIGATÓRIO): Analise cada detalhe da foto do produto em anexo. MANTENHA as características originais (forma, cores, texturas) e use o comando do usuário apenas para melhorar o cenário e a iluminação ao redor do produto.`
      : "GERE O PRODUTO DESCRITO COM REALISMO EXTREMO.";

    const fullPrompt = `VOCÊ É O MELHOR DESIGNER DO MUNDO. 
    BANNER ${dimensions.label.toUpperCase()} (${dimensions.width}x${dimensions.height}).
    ESTILO: Publicidade de luxo, 4k render, iluminação cinematográfica.
    OBJETIVO DO DESIGN: ${prompt}
    ${brandingInstruction}
    ${referenceInstruction}
    NÃO use bordas pretas. Ocupar todo o espaço. Texto apenas em Português impecável.`;

    // ── 5. Generation Shot (Fal.ai) ──────────────────────────────────────
    console.log(`[FAL.AI] 🚀 Target Model: ${activeModelId}`);

    // Dynamic Endpoint Promotion (Text-to-Image -> Edit/Image-to-Image)
    if (productUrl) {
      if (activeModelId === "fal-ai/nano-banana-pro") activeModelId = "fal-ai/nano-banana-pro/edit";
      if (activeModelId === "fal-ai/gpt-image-1.5") activeModelId = "fal-ai/gpt-image-1.5/edit";
      if (activeModelId === "fal-ai/flux-2-pro") activeModelId = "fal-ai/flux-2-pro/edit";
      if (activeModelId === "fal-ai/recraft-v3") activeModelId = "fal-ai/recraft/v3/image-to-image";
      if (activeModelId.includes("seedream")) activeModelId = "fal-ai/bytedance/seedream/v5/lite/edit";

      console.log(`[FAL.AI] 🛠️ Switching to Edit Endpoint: ${activeModelId}`);
    }

    const input = {
      prompt: fullPrompt,
    };

    // Model-Specific Parameter Normalization
    if (activeModelId.includes("nano-banana")) {
      // Nano Banana uses 'aspect_ratio' with colon format (e.g. "16:9")
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

    // If we have a product image, map it to the correct model parameter
    if (productUrl) {
      if (activeModelId.includes("nano-banana") ||
        activeModelId.includes("gpt-image") ||
        activeModelId.includes("seedream") ||
        activeModelId.includes("flux-2-pro")) {
        // Nano Banana Edit, GPT Image Edit, Seedream and Flux 2 Pro Edit expect image_urls array
        input.image_urls = [productUrl];
      } else {
        // Recraft (and standard Flux) expect a single image_url string
        input.image_url = productUrl;
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
