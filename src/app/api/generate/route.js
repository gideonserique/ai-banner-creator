import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const SOCIAL_SIZES = {
  square: { width: 1080, height: 1080, label: 'Quadrado (Post)' },
  portrait: { width: 1080, height: 1920, label: 'Vertical (Story)' },
  landscape: { width: 1280, height: 720, label: 'Horizontal (YouTube)' },
};

export async function POST(request) {
  try {
    const { prompt, size = 'square', images = [], logoUrl = '', companyName = '' } = await request.json();
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
      ? `IDENTIDADE VISUAL: Use o logotipo fornecido nos anexos de forma natural e profissional em um dos cantos ou no centro inferior do banner.`
      : (companyName ? `IDENTIDADE VISUAL: Inclua o nome da empresa "${companyName}" no banner com uma tipografia elegante e gastronômica que combine com o design.` : '');

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

        try {
          for await (const chunk of result.stream) {
            const parts = chunk.candidates?.[0]?.content?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.inlineData?.data) {
                  const mime = part.inlineData.mimeType || 'image/jpeg';
                  const data = `data:${mime};base64,${part.inlineData.data.trim()}`;
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
              controller.enqueue(new TextEncoder().encode(JSON.stringify({ image: data }) + '\n'));
              foundImage = true;
            }
          }

          if (!foundImage) {
            console.error('EXTRACTION FAILED.');
            console.log('AI Response Text Length:', fullText.length);
            if (fullText.length > 0) {
              console.log('AI Response Sample (First 500 chars):', fullText.substring(0, 500));
              console.log('AI Response Sample (Last 500 chars):', fullText.substring(fullText.length - 500));
            }
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
