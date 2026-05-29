/* ============================================
   ai-service.js — Arquitetura OCR-First
   Orquestra a extração de texto via OCR local (Tesseract.js)
   e chama o Merger (Gemini Text-Only) para gerar o JSON.
   ============================================ */

import { extractCampaignMapText } from './extractor-service.js';
import { mergeAndCompare } from './merger-service.js';

// Usar a chave do Merger (Key 3), com fallback para a principal caso não configurada
const MERGER_API_KEY = import.meta.env.VITE_GEMINI_API_KEY_3 || import.meta.env.VITE_GEMINI_API_KEY;

/**
 * Analisa as imagens de ANTES e DEPOIS usando OCR e compara-as via Gemini.
 * @param {Object} imagesObj - Objeto com { antes: File[], depois: File[] }
 * @param {string} [userText] - Texto complementar opcional do gestor
 * @param {Function} [onProgress] - Callback opcional para relatar o progresso na UI
 * @returns {Promise<Object>} JSON estruturado de alterações
 */
export async function analyzeImages(imagesObj, userText = '', onProgress = null) {
  const antes = imagesObj.antes || [];
  const depois = imagesObj.depois || [];

  if (antes.length === 0) {
    throw new Error('Anexe pelo menos uma imagem no estado ANTES.');
  }
  if (depois.length === 0) {
    throw new Error('Anexe pelo menos uma imagem no estado DEPOIS.');
  }

  console.log(`[AI-Service] Iniciando fluxo OCR-First: ${antes.length} antes + ${depois.length} depois`);

  // 1. Executa OCR nas imagens de ANTES
  if (onProgress) onProgress('Iniciando OCR local do estado ANTES...');
  const ocrAntes = await extractCampaignMapText(antes, (p) => {
    if (onProgress) onProgress(p.message);
  });

  // 2. Executa OCR nas imagens de DEPOIS
  if (onProgress) onProgress('Iniciando OCR local do estado DEPOIS...');
  const ocrDepois = await extractCampaignMapText(depois, (p) => {
    if (onProgress) onProgress(p.message);
  });

  // 3. Compara os textos de OCR via Gemini Merger (Text-Only)
  if (onProgress) onProgress('Comparando estados via IA e estruturando alterações...');
  const result = await mergeAndCompare(ocrAntes, ocrDepois, MERGER_API_KEY, userText);

  console.log('[AI-Service] Sucesso! Diário de Bordo gerado.');
  return result;
}
