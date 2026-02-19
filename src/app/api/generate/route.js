import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const SOCIAL_SIZES = {
  square: { width: 1080, height: 1080, label: 'Quadrado (Post)' },
  portrait: { width: 1080, height: 1920, label: 'Vertical (Story)' },
  landscape: { width: 1280, height: 720, label: 'Horizontal (YouTube)' },
};

export async function POST(request) {
  try {
    const { prompt, size = 'square', images = [], logoUrl = '', companyName = '', userId = '' } = await request.json();
    const dimensions = SOCIAL_SIZES[size] || SOCIAL_SIZES.square;

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'API Key missing' }, { status: 500 });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-image-preview' });

    // Se houver logo, adicionamos como uma imagem extra para referência da IA
    let brandImages = [];
    if (logoUrl) {
      const [header, data] = logoUrl.split(',');
      const mimeType = header?.match(/:(.*?);/)?.[1] || 'image/png';
      brandImages.push({
        inlineData: {
          data,
          mimeType
        }
      });
    }

    const imageParts = images.map(img => {
      const [header, data] = img.split(',');
      const mimeType = header.match(/:(.*?);/)[1];
      return {
        inlineData: {
          data,
          mimeType
        }
      };
    });

    const brandingInstruction = logoUrl
      ? `IDENTIDADE VISUAL (OBRIGATÓRIO): Use o logotipo fornecido nos anexos de forma natural e profissional (geralmente nos cantos ou centro inferior). 
         DIRETRIZ DE CORES: Use a paleta de cores do logotipo como base para o design do banner (fundos, textos e grafismos). 
         NOTA: Se o BRIEFING do usuário mencionar cores específicas, as cores do briefing têm PRIORIDADE TOTAL sobre as cores do logo.`
      : (companyName ? `IDENTIDADE VISUAL (OBRIGATÓRIO): Exiba o nome da empresa "${companyName}" de forma clara e elegante, usando uma tipografia premium que harmonize com o estilo do banner.` : '');

    const systemPrompt = `Você é um Diretor de Arte Gastronômico de Classe Mundial especializado em publicidade para alta gastronomia.
Sua tarefa é gerar 1 ÚNICO banner publicitário de resolução 4K (${dimensions.width}x${dimensions.height}) seguindo o briefing abaixo.

FORMATO: ${dimensions.label}

REGRAS CRÍTICAS DE DESIGN:
1. SE O USUÁRIO ENVIAR FOTOS DE PRATOS: Transforme essas fotos em imagens de nível "Estúdio Profissional". Mantenha todos os detalhes originais, cores e a estrutura do prato real, mas aplique iluminação dramática de restaurante 5 estrelas, retoques de food styling e integre-as de forma totalmente harmoniosa ao banner.
2. ${brandingInstruction}
3. INFORMAÇÕES DE CONTATO: Se o prompt contiver telefone, WhatsApp, endereço, preços ou listas de produtos (cardápios), organize-os de forma elegante, legível e profissional. Use tipografia gastronômica premium.
4. ESTÉTICA: O design deve ser "suculento", vibrante e abrir o apetite instantaneamente.
5. Gere o banner DIRETAMENTE como um anexo de imagem (inlineData).
6. Se o anexo falhar, retorne APENAS o código Base64 puro. 
7. NÃO escreva textos explicativos antes ou depois. Use APENAS Português do Brasil com gramática impecável.

 BRIEFING: "${prompt}"`;

    const result = await model.generateContentStream([systemPrompt, ...brandImages, ...imageParts]);

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
            // Even more aggressive Base64 detection including possible data URI headers in text
            const b64Regex = /(?:data:image\/(?:jpeg|png|webp);base64,)?(?:[A-Za-z0-9+/]{4}){1000,}/g;
            const matches = fullText.match(b64Regex);
            if (matches && matches.length > 0) {
              let cleanM = matches[0];
              if (cleanM.includes('base64,')) {
                cleanM = cleanM.split('base64,')[1];
              }
              cleanM = cleanM.replace(/[\r\n\s]/g, '');
              const mime = cleanM.startsWith('/9j/') ? 'image/jpeg' : 'image/png';
              const data = `data:${mime};base64,${cleanM}`;
              finalImageData = data;
              controller.enqueue(new TextEncoder().encode(JSON.stringify({ image: data }) + '\n'));
              foundImage = true;
            }
          }

          // SERVER-SIDE AUTO SAVE: Se estiver logado, salvamos direto na galeria
          if (foundImage && userId) {
            console.log(`[SERVER-SAVE] Saving banner for user: ${userId}`);
            const { error: saveError } = await supabaseAdmin.from('banners').insert([
              {
                user_id: userId,
                image_url: finalImageData,
                prompt: prompt,
                size: size,
              },
            ]);

            if (saveError) {
              console.error('[SERVER-SAVE] Failed to auto-save:', saveError);
            } else {
              console.log('[SERVER-SAVE] Banner successfully saved in background.');
            }
          }

          if (!foundImage) {
            console.error('EXTRACTION FAILED.');
            console.log('AI Response Text Length:', fullText.length);
            controller.enqueue(new TextEncoder().encode(JSON.stringify({ error: 'O banner não pôde ser gerado ou o formato retornado é inválido.' }) + '\n'));
          }

          controller.close();
        } catch (e) {
          console.error('Stream error:', e);
          controller.error(e);
        }
      }
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream' }
    });

  } catch (error) {
    console.error('Erro na geração:', error);
    return NextResponse.json({
      error: `Erro: ${error.message}.`
    }, { status: 500 });
  }
}
