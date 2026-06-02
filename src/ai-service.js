/* ============================================
   ai-service.js — Arquitetura Single-Prompt v2
   Uma única chamada ao Gemini 2.5 Pro com:
   - Imagens ANTES + DEPOIS
   - Texto do gestor (opcional)
   - System prompt com few-shot examples
   Output: texto formatado no padrão KDG
   ============================================ */

import { SYSTEM_PROMPT } from './system-prompt.js';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent';

// Usar todas as chaves com fallback
const API_KEYS = [
  import.meta.env.VITE_GEMINI_API_KEY_3,
  import.meta.env.VITE_GEMINI_API_KEY_2,
  import.meta.env.VITE_GEMINI_API_KEY,
].filter(Boolean);

/**
 * Converte um arquivo de imagem em base64 preservando a resolução original.
 * @param {File} file
 * @returns {Promise<{mimeType: string, data: string}>}
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = reader.result.split(',')[1];
      resolve({ mimeType: file.type, data: base64Data });
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Carrega um File de imagem em um objeto HTMLImageElement.
 * @param {File} file
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(new Error('Erro ao carregar imagem no elemento HTML: ' + err.message));
      img.src = e.target.result;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Converte um Canvas em base64.
 * @param {HTMLCanvasElement} canvas
 * @param {string} mimeType
 * @param {number} quality
 * @returns {string}
 */
function canvasToBase64(canvas, mimeType = 'image/jpeg', quality = 0.85) {
  const dataUrl = canvas.toDataURL(mimeType, quality);
  return dataUrl.split(',')[1];
}

/**
 * Fata uma imagem em múltiplos pedaços (recortes) de alta resolução com sobreposição
 * se ela for maior que 1500px em qualquer dimensão.
 * Retorna uma lista de objetos { label: string, mimeType: string, data: string }.
 * @param {File} file
 * @param {number} maxSliceDim
 * @param {number} overlap
 * @returns {Promise<Array<{label: string, mimeType: string, data: string}>>}
 */
async function sliceImageIfNeeded(file, maxSliceDim = 1200, overlap = 150) {
  try {
    const img = await loadImage(file);
    const W = img.width;
    const H = img.height;

    // Se a imagem for pequena, não fatiar. Converter direto.
    if (W <= 1500 && H <= 1500) {
      const rawBase64 = await fileToBase64(file);
      return [{
        label: 'Visão Geral (Resolução Original)',
        mimeType: file.type,
        data: rawBase64.data
      }];
    }

    const slices = [];

    // 1. Incluir a visão geral com resolução reduzida para contexto de layout (max 1200px)
    const overviewCanvas = document.createElement('canvas');
    let overviewW = W;
    let overviewH = H;
    const overviewMax = 1200;
    if (overviewW > overviewMax || overviewH > overviewMax) {
      if (overviewW > overviewH) {
        overviewH = Math.round((overviewH * overviewMax) / overviewW);
        overviewW = overviewMax;
      } else {
        overviewW = Math.round((overviewW * overviewMax) / overviewH);
        overviewH = overviewMax;
      }
    }
    overviewCanvas.width = overviewW;
    overviewCanvas.height = overviewH;
    const overviewCtx = overviewCanvas.getContext('2d');
    overviewCtx.drawImage(img, 0, 0, overviewW, overviewH);
    const overviewBase64 = canvasToBase64(overviewCanvas, 'image/jpeg', 0.8);

    slices.push({
      label: 'Visão Geral (Reduzida para Contexto Geral)',
      mimeType: 'image/jpeg',
      data: overviewBase64
    });

    // 2. Calcular grid de colunas e linhas
    let cols = Math.ceil(W / maxSliceDim);
    let rows = Math.ceil(H / maxSliceDim);

    // Limitar para no máximo 3 colunas e 3 linhas por imagem (máx 9 fatias de foco)
    if (cols > 3) cols = 3;
    if (rows > 3) rows = 3;

    console.log(`[Image Slicing] Fatiando imagem ${W}x${H} em grid ${cols}x${rows}`);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Calcular coordenadas com sobreposição (overlap)
        const startX = Math.max(0, Math.floor(c * (W / cols) - (c > 0 ? overlap : 0)));
        const endX = Math.min(W, Math.floor((c + 1) * (W / cols) + (c < cols - 1 ? overlap : 0)));
        const sliceW = endX - startX;

        const startY = Math.max(0, Math.floor(r * (H / rows) - (r > 0 ? overlap : 0)));
        const endY = Math.min(H, Math.floor((r + 1) * (H / rows) + (r < rows - 1 ? overlap : 0)));
        const sliceH = endY - startY;

        const canvas = document.createElement('canvas');
        canvas.width = sliceW;
        canvas.height = sliceH;
        const ctx = canvas.getContext('2d');

        // Desenhar a porção da imagem original no canvas
        ctx.drawImage(img, startX, startY, sliceW, sliceH, 0, 0, sliceW, sliceH);

        const base64Data = canvasToBase64(canvas, 'image/jpeg', 0.85);

        // Criar label descritivo da posição do quadrante
        let posLabel = '';
        if (rows === 1) {
          posLabel = `Parte ${c + 1} de ${cols} (Esquerda para Direita)`;
        } else if (cols === 1) {
          posLabel = `Parte ${r + 1} de ${rows} (Topo para Base)`;
        } else {
          const rowWord = r === 0 ? 'Superior' : (r === rows - 1 ? 'Inferior' : 'Centro');
          const colWord = c === 0 ? 'Esquerdo' : (c === cols - 1 ? 'Direito' : 'Centro');
          posLabel = `Recorte Foco ${rowWord} ${colWord}`;
        }

        slices.push({
          label: `${posLabel} (Zoom Alta Resolução - X: ${startX}-${endX}, Y: ${startY}-${endY})`,
          mimeType: 'image/jpeg',
          data: base64Data
        });
      }
    }

    return slices;
  } catch (err) {
    console.error('[Image Slicing Error]', err);
    const rawBase64 = await fileToBase64(file);
    return [{
      label: 'Visão Geral (Recuperação de Falha)',
      mimeType: file.type,
      data: rawBase64.data
    }];
  }
}

/**
 * Analisa as imagens ANTES e DEPOIS e gera o Diário de Bordo.
 * @param {Object} imagesObj - { antes: File[], depois: File[] }
 * @param {string} [userText] - Texto complementar do gestor
 * @param {string} [model] - Provedor de IA ('gemini' ou 'claude')
 * @param {Function} [onProgress] - Callback de progresso para UI
 * @returns {Promise<string>} Texto formatado do diário no padrão KDG
 */
export async function analyzeImages(imagesObj, userText = '', model = 'gemini', onProgress = null) {
  const antes = imagesObj.antes || [];
  const depois = imagesObj.depois || [];

  if (antes.length === 0) {
    throw new Error('Anexe pelo menos uma imagem no estado ANTES.');
  }
  if (depois.length === 0) {
    throw new Error('Anexe pelo menos uma imagem no estado DEPOIS.');
  }

  console.log(`[AI-Service] Iniciando fluxo: ${antes.length} antes + ${depois.length} depois via ${model}`);

  // 1. Converter/Fatiar imagens
  if (onProgress) onProgress('Processando e otimizando imagens (slicing)...');

  const antesSlicesPromises = antes.map(f => sliceImageIfNeeded(f));
  const depoisSlicesPromises = depois.map(f => sliceImageIfNeeded(f));

  const antesSlicesGroups = await Promise.all(antesSlicesPromises);
  const depoisSlicesGroups = await Promise.all(depoisSlicesPromises);

  // 2. Montar as partes do conteúdo
  let introText = `Analise as imagens a seguir e gere o Diário de Bordo das alterações.\n\n`;
  introText += `IMAGENS DO ESTADO ANTES (${antes.length} imagem(ns) fatiadas em alta definição):\n`;
  introText += `IMAGENS DO ESTADO DEPOIS (${depois.length} imagem(ns) fatiadas em alta definição):\n\n`;

  const today = new Date().toLocaleDateString('pt-BR');
  introText += `Data da otimização: ${today}\n\n`;

  if (userText && userText.trim()) {
    introText += `=== TEXTO DO GESTOR DE TRÁFEGO (VERDADE ABSOLUTA) ===\n`;
    introText += userText.trim();
    introText += `\n\n[INSTRUÇÃO DE FUSÃO MANDATÓRIA]: O texto do gestor é a VERDADE ABSOLUTA e deve ser integrado com prioridade máxima. Você DEVE incluir no Diário de Bordo final todas as campanhas, públicos ou anúncios citados pelo gestor (por exemplo: "[Abono de Permanencia]", "[DF]", etc.), mesmo que eles NÃO estejam visíveis em nenhuma das imagens (devido a recortes ou resolução). O diário final deve ser a UNIÃO da leitura visual com o texto do gestor. Nenhuma informação fornecida pelo gestor pode ser descartada ou omitida!`;
  } else {
    introText += `[INSTRUÇÃO]: Não há texto complementar do gestor. Gere o Diário de Bordo baseado EXCLUSIVAMENTE na comparação textual/estrutural entre as imagens ANTES e DEPOIS.`;
  }

  // --- FLUXO ANTHROPIC (CLAUDE) ---
  if (model === 'claude') {
    const anthropicKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      throw new Error('Chave API do Claude (VITE_ANTHROPIC_API_KEY) não encontrada no seu arquivo .env.');
    }

    if (onProgress) onProgress('Analisando imagens com Claude Sonnet (Leitura Otimizada)...');

    const claudeContent = [
      {
        type: 'text',
        text: introText + "\n\n[IMPORTANTE]:\n1. Mantenha a etapa dentro da tag <pensamento> concisa (no máximo 40 linhas), listando as diferenças de forma objetiva, para garantir que todo o Diário de Bordo seja gerado no final sem truncar.\n2. Para extrair textos pequenos (como 'Lat. 3%'), cruze as fatias marcadas como Zoom Alta Resolução com as imagens de Visão Geral."
      }
    ];

    // Adicionar fatias do ANTES
    for (let i = 0; i < antes.length; i++) {
      const slices = antesSlicesGroups[i];
      for (const slice of slices) {
        claudeContent.push({ type: 'text', text: `--- IMAGEM ANTES ${i + 1} - ${slice.label} ---` });
        claudeContent.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: slice.mimeType,
            data: slice.data
          }
        });
      }
    }

    // Adicionar fatias do DEPOIS
    for (let i = 0; i < depois.length; i++) {
      const slices = depoisSlicesGroups[i];
      for (const slice of slices) {
        claudeContent.push({ type: 'text', text: `--- IMAGEM DEPOIS ${i + 1} - ${slice.label} ---` });
        claudeContent.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: slice.mimeType,
            data: slice.data
          }
        });
      }
    }

    try {
      console.log('[AI-Service] Enviando requisição para o proxy local do Claude...');
      const response = await fetch('/api/anthropic/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: claudeContent
            }
          ]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Claude API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const resultText = data.content?.[0]?.text || '';

      if (!resultText.trim()) {
        throw new Error('Claude retornou um texto vazio.');
      }

      console.log('[AI-Service] Sucesso! Diário de Bordo gerado pelo Claude.');
      return resultText;

    } catch (e) {
      console.error('[AI-Service] Erro no fluxo do Claude:', e.message);
      throw e;
    }
  }

  // --- FLUXO GOOGLE (GEMINI) ---
  if (onProgress) onProgress('Analisando imagens com Gemini 2.5 Pro (Leitura Otimizada)...');

  const contentParts = [{ text: introText }];

  // Adicionar fatias do ANTES para Gemini
  for (let i = 0; i < antes.length; i++) {
    const slices = antesSlicesGroups[i];
    for (const slice of slices) {
      contentParts.push({ text: `--- IMAGEM ANTES ${i + 1} - ${slice.label} ---` });
      contentParts.push({
        inlineData: {
          mimeType: slice.mimeType,
          data: slice.data
        }
      });
    }
  }

  // Adicionar fatias do DEPOIS para Gemini
  for (let i = 0; i < depois.length; i++) {
    const slices = depoisSlicesGroups[i];
    for (const slice of slices) {
      contentParts.push({ text: `--- IMAGEM DEPOIS ${i + 1} - ${slice.label} ---` });
      contentParts.push({
        inlineData: {
          mimeType: slice.mimeType,
          data: slice.data
        }
      });
    }
  }

  let lastError = null;

  for (const apiKey of API_KEYS) {
    try {
      console.log(`[AI-Service] Tentando Gemini com API key: ${apiKey.substring(0, 10)}...`);

      const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: SYSTEM_PROMPT }],
          },
          contents: [
            {
              parts: contentParts
            }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 16384,
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
          ]
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const errorMsg = err.error?.message || 'Erro desconhecido';
        console.warn(`[AI-Service] Key falhou (${response.status}): ${errorMsg}`);
        lastError = new Error(`Gemini API error (${response.status}): ${errorMsg}`);
        continue;
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];

      if (!candidate || !candidate.content || !candidate.content.parts) {
        lastError = new Error(`Resposta vazia do Gemini. finishReason: ${candidate?.finishReason || 'Desconhecido'}`);
        continue;
      }

      const resultText = candidate.content.parts[0]?.text || '';

      if (!resultText.trim()) {
        lastError = new Error('Gemini retornou texto vazio.');
        continue;
      }

      console.log('[AI-Service] Sucesso! Diário de Bordo gerado pelo Gemini.');
      return resultText;

    } catch (e) {
      console.warn('[AI-Service] Erro na tentativa com Gemini:', e.message);
      lastError = e;
      continue;
    }
  }

  throw lastError || new Error('Todas as chaves de API do Gemini falharam.');
}
