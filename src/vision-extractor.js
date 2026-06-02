/* ============================================
   vision-extractor.js — Extrator Multimodal
   Lê imagens usando Vision (Gemini 2.5 Pro)
   e extrai a estrutura hierárquica das campanhas.
   ============================================ */

const GEMINI_VISION_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent';

// Schema da árvore estruturada extraída do mapa mental (Fase 1)
const structureSchema = {
  type: "OBJECT",
  properties: {
    campanhas: {
      type: "ARRAY",
      description: "Lista de campanhas encontradas no mapa mental.",
      items: {
        type: "OBJECT",
        properties: {
          tag: {
            type: "STRING",
            description: "A tag identificadora da campanha, ex: [REV-PJ], [LEC], [AGRO]."
          },
          plataforma: {
            type: "STRING",
            description: "Plataforma da campanha, ex: Meta Ads, Google Ads."
          },
          tipo: {
            type: "STRING",
            description: "Tipo de campanha, ex: formulário, mensagem, conversão."
          },
          orçamento: {
            type: "STRING",
            description: "Orçamento definido no nível da campanha (se aplicável), ex: em CBO com 230$/dia."
          },
          publicos: {
            type: "ARRAY",
            description: "Lista de públicos/conjuntos dentro desta campanha.",
            items: {
              type: "OBJECT",
              properties: {
                nome: {
                  type: "STRING",
                  description: "Nome completo do público/conjunto, ex: 00 - [MANUAL] LaL 1% Lista PGFN."
                },
                orçamento: {
                  type: "STRING",
                  description: "Orçamento definido no nível do conjunto/público (se aplicável), ex: 25$/dia, 32$/dia-útil."
                },
                anuncios: {
                  type: "ARRAY",
                  description: "Lista de anúncios (criativos) dentro deste público.",
                  items: {
                    type: "OBJECT",
                    properties: {
                      nome: {
                        type: "STRING",
                        description: "Nome completo do anúncio/criativo, ex: AD 7 - CP Capital de Giro em Atraso."
                      },
                      orçamento: {
                        type: "STRING",
                        description: "Orçamento específico do anúncio (se houver budget individual listado abaixo do anúncio), ex: 25$/dia."
                      },
                      status: {
                        type: "STRING",
                        description: "Status do anúncio (ex: ativo, pausado, alterado). Deduzido pelas cores do card no mapa: vermelho = pausado/inativo, verde/verde-escuro = ativo, amarelo/laranja = alterado/escala."
                      }
                    },
                    required: ["nome", "status"]
                  }
                }
              },
              required: ["nome"]
            }
          }
        },
        required: ["tag", "plataforma"]
      }
    }
  },
  required: ["campanhas"]
};

/**
 * Converte um arquivo de imagem em base64, redimensionando se necessário para otimizar payload.
 * @param {File} file
 * @param {number} maxDim - Dimensão máxima permitida para largura/altura
 * @returns {Promise<{mimeType: string, data: string}>}
 */
function fileToBase64(file, maxDim = 2560) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Se a imagem for pequena, não precisa de canvas/redimensionamento
        if (img.width <= maxDim && img.height <= maxDim) {
          const base64Data = reader.result.split(',')[1];
          resolve({
            mimeType: file.type,
            data: base64Data
          });
          return;
        }

        // Redimensionar mantendo proporção
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Exportar como JPEG comprimido para garantir menor tamanho
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const base64Data = dataUrl.split(',')[1];
        resolve({
          mimeType: 'image/jpeg',
          data: base64Data
        });
      };
      img.onerror = (err) => reject(new Error('Erro ao carregar imagem para redimensionamento: ' + err.message));
      img.src = reader.result;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Executa a extração estruturada de uma lista de imagens usando Vision (Gemini 3.5 Flash).
 * @param {File[]} imageFiles - Lista de arquivos (anexados pelo usuário)
 * @param {string} apiKey - Chave do Gemini
 * @param {string} estadoLabel - Label informativo ('ANTES' ou 'DEPOIS')
 * @returns {Promise<Object>} - Estrutura JSON do mapa mental
 */
export async function extractCampaignMapStructure(imageFiles, apiKey, estadoLabel) {
  if (!imageFiles || imageFiles.length === 0) {
    return { campanhas: [] };
  }

  if (!apiKey || apiKey === 'SUA_CHAVE_GEMINI_AQUI') {
    throw new Error('API Key do Gemini não configurada.');
  }

  console.log(`[Vision-Extractor] Convertendo ${imageFiles.length} imagens do estado ${estadoLabel} para base64...`);
  
  // Converter todos os arquivos em partes do payload
  const imagePartsPromises = imageFiles.map(file => fileToBase64(file));
  const imagePartsRaw = await Promise.all(imagePartsPromises);
  
  const contentsParts = imagePartsRaw.map(part => ({
    inlineData: {
      mimeType: part.mimeType,
      data: part.data
    }
  }));

  // Adicionar o prompt textual como última parte
  const promptText = `Você é um Analisador e Interpretador de Mapas Mentais de Campanhas de Tráfego Pago, especialista em Meta Ads e Google Ads.
Sua missão é ler e analisar as imagens anexadas do estado ${estadoLabel} e extrair a estrutura hierárquica das campanhas em JSON.

REGRAS DE ESTRUTURA DO MAPA MENTAL:
1. Campanhas: São identificadas por tags com colchetes no nome (ex: [REV-PJ], [AGRO], [PREV], [BRANDING], [LEC]).
2. Públicos/Conjuntos: Ficam imediatamente abaixo das campanhas, frequentemente numerados (ex: "00 - [MANUAL] Aberto...", "00 - [INSTA]...").
3. Anúncios (ADs): São os itens finais de cada ramificação, identificados como "AD 1", "AD 9", "AD 15", etc.

REGRAS DE LEITURA VISUAL (CRÍTICO):
1. Status/Cores dos Cards: A cor do card de cada anúncio ou público define o seu status:
   - Verde (qualquer tom): status "ativo" (ligado).
   - Vermelho, Rosa ou Cinza: status "pausado" (desativado).
   - Amarelo ou Laranja: status "alterado" (escala ou alteração de verba).
   Insira o status correspondente no campo 'status' de cada anúncio.
2. Orçamento (Budget): Leia atentamente o valor do orçamento descrito no mapa mental (ex: "32$/dia-útil", "25$/dia", "15$/dia").
   - Se o valor do orçamento for global da campanha (ex: "em CBO com 230$/dia" ou "230$/dia" listado no nó principal da campanha), coloque-o na chave 'orçamento' da campanha correspondente. Não coloque explicações longas ou repetitivas nos campos de texto.
   - Se o valor do orçamento estiver no card do público/conjunto, coloque-o na chave 'orçamento' do público/conjunto correspondente.
   - Se o valor do orçamento estiver no card do anúncio individual, coloque-o na chave 'orçamento' do anúncio correspondente.
   - Se não houver orçamento descrito, deixe o campo vazio ou nulo.

Por favor, analise a imagem inteira com o máximo de zoom e detalhamento para capturar todos os nomes, valores e cores, sem omitir nenhuma campanha ou ramificação.`;

  contentsParts.push({ text: promptText });

  console.log(`[Vision-Extractor] Enviando ${estadoLabel} para o Gemini 2.5 Pro Vision...`);

  const response = await fetch(`${GEMINI_VISION_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: contentsParts
        }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        responseSchema: structureSchema
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Gemini Vision Extraction Error (${response.status}): ${err.error?.message || 'Erro desconhecido'}`);
  }

  const resJson = await response.json();
  const candidate = resJson.candidates?.[0];
  if (!candidate || !candidate.content || !candidate.content.parts) {
    throw new Error(`Vision Extractor retornou resposta vazia para ${estadoLabel}.`);
  }

  let text = candidate.content.parts[0]?.text || "";
  return cleanAndParseJSON(text, estadoLabel);
}

/**
 * Limpa o texto da resposta da LLM, trata quebras de linha e chaves abertas, e faz parse do JSON.
 */
function cleanAndParseJSON(text, estadoLabel) {
  let cleaned = text.trim();
  
  // 1. Remover cercas markdown
  const mdMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (mdMatch) {
    cleaned = mdMatch[1];
  }
  cleaned = cleaned.trim();

  // 2. Escapar quebras de linha literais dentro de valores string de JSON
  let inString = false;
  let resultChars = [];
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    const prevChar = i > 0 ? cleaned[i - 1] : '';
    
    if (char === '"' && prevChar !== '\\') {
      inString = !inString;
      resultChars.push(char);
    } else if (inString) {
      if (char === '\n') {
        resultChars.push('\\');
        resultChars.push('n');
      } else if (char === '\r') {
        // Ignorar \r
      } else if (char === '\t') {
        resultChars.push('\\');
        resultChars.push('t');
      } else {
        resultChars.push(char);
      }
    } else {
      resultChars.push(char);
    }
  }
  cleaned = resultChars.join('');

  try {
    const result = JSON.parse(cleaned);
    console.log(`[Vision-Extractor] Sucesso! Extraídas ${result.campanhas?.length || 0} campanhas do estado ${estadoLabel}.`);
    return result;
  } catch (e) {
    console.warn('[Vision-Extractor] Falha inicial ao parsear JSON, tentando balanceamento de chaves e limpeza de commas...', e);
    
    // Tentar balancear chaves e colchetes
    let openBraces = (cleaned.match(/\{/g) || []).length;
    let closeBraces = (cleaned.match(/\}/g) || []).length;
    while (openBraces > closeBraces) {
      cleaned += '}';
      closeBraces++;
    }
    
    let openBrackets = (cleaned.match(/\[/g) || []).length;
    let closeBrackets = (cleaned.match(/\]/g) || []).length;
    while (openBrackets > closeBrackets) {
      cleaned += ']';
      closeBrackets++;
    }

    // Tentar remover trailing commas
    cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');

    try {
      const result = JSON.parse(cleaned);
      console.log(`[Vision-Extractor] Sucesso após limpeza profunda! Extraídas ${result.campanhas?.length || 0} campanhas do estado ${estadoLabel}.`);
      return result;
    } catch (e2) {
      console.error(`[Vision-Extractor] Falha crítica de parse no estado ${estadoLabel}. Texto original:`, text);
      throw new Error(`Falha no parse da extração de ${estadoLabel}: ${e2.message}`);
    }
  }
}
