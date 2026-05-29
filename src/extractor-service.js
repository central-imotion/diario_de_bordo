/* ============================================
   extractor-service.js — Motor de OCR Local
   Lê imagens locais (Antes ou Depois) usando Tesseract.js
   e extrai o texto bruto de forma 100% offline/local.
   ============================================ */

import Tesseract from 'tesseract.js';

/**
 * Executa o OCR (Tesseract) em uma lista de arquivos de imagem.
 * @param {File[]} imageFiles - Lista de arquivos (anexados pelo usuário).
 * @param {Function} [onProgress] - Callback para reportar progresso da extração.
 * @returns {Promise<string>} - Texto bruto consolidado das imagens.
 */
export async function extractCampaignMapText(imageFiles, onProgress) {
  if (!imageFiles || imageFiles.length === 0) {
    return '';
  }

  let combinedText = '';

  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i];
    const imageNum = i + 1;
    const totalImages = imageFiles.length;

    if (onProgress) {
      onProgress({
        status: 'initializing',
        imageIndex: i,
        imageNum,
        totalImages,
        message: `Inicializando Tesseract para Imagem ${imageNum} de ${totalImages}...`
      });
    }

    try {
      // O Tesseract reconhece diretamente objetos File/Blob no navegador
      const result = await Tesseract.recognize(
        file,
        'por+eng', // Português + Inglês para capturar nomenclaturas técnicas
        {
          logger: m => {
            if (onProgress && m.status === 'recognizing text') {
              onProgress({
                status: 'recognizing',
                imageIndex: i,
                imageNum,
                totalImages,
                progress: m.progress,
                message: `Lendo Imagem ${imageNum} de ${totalImages}: ${Math.floor(m.progress * 100)}%`
              });
            }
          }
        }
      );

      combinedText += `\n--- IMAGEM ${imageNum}: ${file.name || 'Sem nome'} ---\n`;
      combinedText += result.data.text;
      combinedText += '\n';

    } catch (error) {
      console.error(`Erro ao processar OCR da imagem ${file.name}:`, error);
      combinedText += `\n--- ERRO NA IMAGEM ${imageNum}: ${file.name || 'Sem nome'} ---\n`;
      combinedText += `[Falha no OCR: ${error.message}]\n`;
    }
  }

  return combinedText.trim();
}
