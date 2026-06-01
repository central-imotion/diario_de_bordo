/* ============================================
   editor.js — Formatter Determinístico (Padrão KDG)
   ZERO IA. Tudo é template engine em JS puro.
   ============================================ */

// =============================================
// CORES POR TIPO DE AÇÃO (Padrão KDG)
// =============================================
const ACTION_COLORS = {
  // Positivas (verde)
  aumento: '#16a34a',
  adicao: '#16a34a',
  ativacao: '#16a34a',
  criacao: '#16a34a',
  reativacao: '#16a34a',
  inicio: '#16a34a',
  // Negativas (vermelho)
  reducao: '#ea4335',
  pausa: '#ea4335',
  // Neutras (laranja)
  alteracao: '#f59e0b',
  isolamento: '#f59e0b',
  transformacao: '#f59e0b',
};

const TAG_COLOR = '#2563eb'; // Azul para tags e plataformas

function getActionColor(tipo) {
  return ACTION_COLORS[(tipo || '').toLowerCase()] || '#2563eb';
}

// =============================================
// FORMATAÇÃO DE PONTUAÇÃO (Padrão KDG)
// =============================================

/**
 * Gera a pontuação correta para subitens:
 * - Intermediário → ";"  (em negrito)
 * - Último        → "."  (em negrito)
 */
function punct(isLast) {
  return isLast ? '<strong>.</strong>' : '<strong>;</strong>';
}

// =============================================
// FORMATAÇÃO DE NOMES DE ANÚNCIO (Padrão KDG)
// Sempre entre aspas, sublinhado (u)
// =============================================
function fmtAd(nome) {
  return `<u>"${nome}"</u>`;
}

function normalizeTipoCampanha(tipo) {
  if (!tipo) return '';
  const t = tipo.toLowerCase().trim();
  if (t.includes('form') || t.includes('cadastro')) return 'formulário';
  if (t.includes('msg') || t.includes('mensagem')) return 'mensagem';
  if (t.includes('conv') || t.includes('conversao') || t.includes('conversão')) return 'conversão';
  return tipo; // fallback
}

function extractNumber(val) {
  if (!val) return 0;
  const match = val.replace(/\s/g, '').match(/[\d.,]+/);
  if (!match) return 0;
  return parseFloat(match[0].replace(',', '.'));
}

// =============================================
// FORMATAÇÃO DE VERBA (Padrão KDG)
// Valor novo sempre em negrito
// =============================================
function fmtVerba(valor) {
  if (!valor) return '';
  return `<strong>${valor}</strong>`;
}

function fmtVerbaDe(antes, depois) {
  if (!antes || !depois) return '';
  return `de ${antes} para ${fmtVerba(depois)}`;
}

// =============================================
// CONSTRUTOR DE LINHA DE ALTERAÇÃO
// Monta a frase completa no padrão KDG
// =============================================

/**
 * Schema de entrada esperado para cada alteração:
 * {
 *   tipo: "pausa" | "alteracao" | "adicao" | "inicio" | "pausa_campanha" | "pausa_publico" | "adicao_publico" | "composto" | "texto_livre",
 *   tag_campanha: "[REV-PJ]",
 *   plataforma: "Meta Ads",
 *   tipo_campanha: "formulário" | "mensagem" | null,
 *   publico: "[MANUAL] Advantage" | null,
 *   acoes: [
 *     {
 *       verbo: "pausamos",
 *       escopo: "anuncios" | "publico" | "campanha" | "outro",
 *       publico_alvo: "[MANUAL] Aberto + RS" | null,     // para ações sobre públicos
 *       anuncios: [
 *         {
 *           nome: "AD 9 - Procura-se 500k",
 *           verba_antes: "40$/dia-útil" | null,
 *           verba_depois: "60$/dia-útil" | null,
 *           verba_nova: "40$/dia-útil" | null
 *         }
 *       ],
 *       texto_complementar: null   // texto extra livre, ex: "a estrutura de CBO para ABO"
 *     }
 *   ],
 *   texto_livre: null  // fallback para casos que não cabem no schema
 * }
 */

function renderAlteracao(alt, acao, omitCampaignPrefix = false) {
  // --- Texto livre (fallback) ---
  if (alt.tipo === 'texto_livre' || alt.texto_livre) {
    const tag = (!omitCampaignPrefix && alt.tag_campanha) ? `<strong style="color: ${TAG_COLOR};">${alt.tag_campanha}</strong> ` : '';
    const plat = (!omitCampaignPrefix && alt.plataforma) ? `<span style="color: ${TAG_COLOR};">[${alt.plataforma}]</span> ` : '';
    return `<li style="margin-bottom: 6px;"><p>${tag}${plat}${alt.texto_livre || ''}</p></li>`;
  }

  // --- Prefixo: TAG + Plataforma (omitido quando agrupado sob header de campanha) ---
  const tag = (!omitCampaignPrefix && alt.tag_campanha)
    ? `<strong style="color: ${TAG_COLOR};">${alt.tag_campanha}</strong> `
    : '';
  const plat = (!omitCampaignPrefix && alt.plataforma)
    ? `<span style="color: ${TAG_COLOR};">[${alt.plataforma}]</span> `
    : '';

  if (!acao) {
    return `<li style="margin-bottom: 6px;"><p>${tag}${plat}</p></li>`;
  }

  // Contexto de campanha (ex: "Na campanha de formulário, ") — omitido quando agrupado
  const tipoCampNorm = normalizeTipoCampanha(alt.tipo_campanha);
  const tipoCamp = (!omitCampaignPrefix && tipoCampNorm)
    ? `Na campanha de <u>${tipoCampNorm}</u>, `
    : '';

  // Contexto de público (ex: "no público [MANUAL] Advantage, ")
  // Capitaliza "No" quando inicia a frase (tipoCamp omitido)
  const pubCtx = alt.publico
    ? `${tipoCamp ? 'n' : 'N'}o público <strong>${alt.publico},</strong> `
    : '';

  let body = '';
  let subitems = [];

  // Correção determinística de verbo para alteração de verba (escala)
  let verboCorrigido = acao.verbo;
  let tipoCorrigido = acao.verbo_tipo || alt.tipo;

  const anuncios = acao.anuncios || [];
  const hasVerbaDe = anuncios.some(a => a.verba_antes && a.verba_depois);
  if (hasVerbaDe) {
    let aumentosCount = 0;
    let reducoesCount = 0;
    anuncios.forEach(ad => {
      if (ad.verba_antes && ad.verba_depois) {
        const vAntes = extractNumber(ad.verba_antes);
        const vDepois = extractNumber(ad.verba_depois);
        if (vDepois > vAntes) aumentosCount++;
        else if (vDepois < vAntes) reducoesCount++;
      }
    });

    if (aumentosCount > 0 && reducoesCount === 0) {
      verboCorrigido = 'Aumentamos';
      tipoCorrigido = 'aumento';
    } else if (reducoesCount > 0 && aumentosCount === 0) {
      verboCorrigido = 'Reduzimos';
      tipoCorrigido = 'reducao';
    } else {
      verboCorrigido = 'Alteramos';
      tipoCorrigido = 'alteracao';
    }
  }

  const verboColor = getActionColor(tipoCorrigido);
  
  // Como é ação única por <li>, o verbo sempre inicia a frase de ação.
  // Mas se tipoCamp ou pubCtx existirem, o verbo vem no meio da frase, então deve ser minúsculo.
  const startsSentence = !tipoCamp && !pubCtx;
  const verboTexto = startsSentence ? verboCorrigido : verboCorrigido.charAt(0).toLowerCase() + verboCorrigido.slice(1);
  const verboStyled = `<strong style="color: ${verboColor};">${verboTexto}</strong>`;

  switch (acao.escopo) {
    case 'campanha': {
      if (omitCampaignPrefix) {
        body = `${verboStyled} por completo`;
      } else {
        body = `${verboStyled} por completo a campanha de <u>${tipoCampNorm || 'mensagem'}</u>`;
      }
      break;
    }
    case 'publico': {
      const pubNome = acao.publico_alvo || alt.publico || '';
      const verbaCboStr = acao.verba_cbo ? `, em CBO com ${fmtVerba(acao.verba_cbo)}` : '';
      
      if ((acao.verbo || '').toLowerCase().includes('paus')) {
        // Pausa de público
        if (anuncios && anuncios.length > 0) {
          body = `${tipoCamp}${verboStyled} o público <strong>${pubNome},</strong> com os anúncios`;
          anuncios.forEach(ad => {
            subitems.push(`${fmtAd(ad.nome)}`);
          });
        } else {
          body = `${tipoCamp}${verboStyled} por completo o público <strong>${pubNome}</strong>`;
        }
      } else {
        // Adição/Início de público
        if (acao.verba_cbo) {
          body = `${tipoCamp}${verboStyled} o público <strong>${pubNome},</strong>${verbaCboStr} com os anúncios`;
          anuncios.forEach(ad => {
            subitems.push(`${fmtAd(ad.nome)}`);
          });
        } else if (anuncios && anuncios.length === 1) {
          const ad = anuncios[0];
          const verbaStr = ad.verba_nova ? `, com ${fmtVerba(ad.verba_nova)}` : '';
          body = `${tipoCamp}${verboStyled} o público <strong>${pubNome},</strong> com o ${fmtAd(ad.nome)}${verbaStr}`;
        } else if (anuncios && anuncios.length > 1) {
          body = `${tipoCamp}${verboStyled} o público <strong>${pubNome},</strong> com os anúncios`;
          anuncios.forEach(ad => {
            const verbaStr = ad.verba_nova ? `, com ${fmtVerba(ad.verba_nova)}` : '';
            subitems.push(`${fmtAd(ad.nome)}${verbaStr}`);
          });
        } else {
          body = `${tipoCamp}${verboStyled} o público <strong>${pubNome}</strong>`;
        }
      }
      break;
    }
    case 'publicos': {
      body = `${tipoCamp}${verboStyled} por completo os públicos`;
      if (anuncios) {
        anuncios.forEach(pub => {
          subitems.push(`<strong>${pub.nome}</strong>`);
        });
      }
      break;
    }
    case 'inicio_campanha': {
      const pubNome = acao.publico_alvo || alt.publico || '';
      const verbaCboStr = acao.verba_cbo ? `, em CBO com ${fmtVerba(acao.verba_cbo)}` : '';
      if (acao.verba_cbo && pubNome) {
        body = `${verboStyled} uma campanha de <u>${tipoCampNorm || 'mensagem'}</u>, com o público <strong>${pubNome},</strong>${verbaCboStr} com os anúncios`;
        if (anuncios) {
          anuncios.forEach(ad => {
            subitems.push(`${fmtAd(ad.ad_nome || ad.nome)}`);
          });
        }
      } else {
        body = `${verboStyled} uma campanha de <u>${tipoCampNorm || 'mensagem'}</u>, com os públicos`;
        if (anuncios) {
          anuncios.forEach(pub => {
            const adStr = pub.ad_nome ? `, com o ${fmtAd(pub.ad_nome)}` : '';
            const verbaStr = pub.verba_nova ? `, com ${fmtVerba(pub.verba_nova)}` : '';
            subitems.push(`<strong>${pub.nome}</strong>${adStr}${verbaStr}`);
          });
        }
      }
      break;
    }
    default: {
      // escopo = "anuncios" (padrão)
      const anuncios = acao.anuncios || [];

      if (anuncios.length === 0) {
        const complemento = acao.texto_complementar || '';
        body = `${tipoCamp}${pubCtx}${verboStyled} ${complemento}`;
      } else if (anuncios.length === 1) {
        const ad = anuncios[0];
        let adDetail = '';

        if (acao.verba_cbo) {
          adDetail = `, em CBO com ${fmtVerba(acao.verba_cbo)} com o anúncio ${fmtAd(ad.nome)}`;
        } else if (ad.verba_antes && ad.verba_depois) {
          adDetail = ` a verba do ${fmtAd(ad.nome)} ${fmtVerbaDe(ad.verba_antes, ad.verba_depois)}`;
        } else if (ad.verba_nova) {
          adDetail = ` o ${fmtAd(ad.nome)}, com ${fmtVerba(ad.verba_nova)}`;
        } else {
          adDetail = ` o ${fmtAd(ad.nome)}`;
        }
        body = `${tipoCamp}${pubCtx}${verboStyled}${adDetail}`;
      } else {
        const isAlteracao = anuncios.some(a => a.verba_antes && a.verba_depois);
        const isAdicao = anuncios.some(a => a.verba_nova);
        const isPausa = !isAlteracao && !isAdicao;

        let complemento = '';
        if (acao.verba_cbo) {
          complemento = `, em CBO com ${fmtVerba(acao.verba_cbo)} com os anúncios`;
        } else if (isAlteracao) {
          complemento = ' a verba dos anúncios';
        } else if (isPausa) {
          complemento = ' os anúncios';
        } else {
          complemento = ' os anúncios';
        }

        body = `${tipoCamp}${pubCtx}${verboStyled}${complemento}`;

        anuncios.forEach(ad => {
          if (acao.verba_cbo) {
            subitems.push(`${fmtAd(ad.nome)}`);
          } else if (ad.verba_antes && ad.verba_depois) {
            subitems.push(`${fmtAd(ad.nome)} ${fmtVerbaDe(ad.verba_antes, ad.verba_depois)}`);
          } else if (ad.verba_nova) {
            subitems.push(`${fmtAd(ad.nome)}, com ${fmtVerba(ad.verba_nova)}`);
          } else {
            subitems.push(`${fmtAd(ad.nome)}`);
          }
        });
      }
      break;
    }
  }

  // Montar corpo final
  body = tag + plat + body;

  if (subitems.length > 0) {
    body += ':';
  } else if (!body.endsWith('.') && !body.endsWith('.</strong>') && !body.endsWith(';</strong>')) {
    body += '.';
  }

  let html = `<li style="margin-bottom: 6px;"><p>${body}</p>`;

  if (subitems.length > 0) {
    html += '<ul style="margin-top: 4px;">';
    subitems.forEach((sub, idx) => {
      const isLast = idx === subitems.length - 1;
      let cleanSub = sub.replace(/[.;,]?\s*(<\/strong>)?\s*$/, '$1').trim();
      if (cleanSub.endsWith('</strong>')) {
        const lastStrongMatch = cleanSub.match(/^(.*)<strong>([^<]*)<\/strong>$/);
        if (lastStrongMatch) {
          cleanSub = `${lastStrongMatch[1]}<strong>${lastStrongMatch[2].replace(/[.;,]\s*$/, '')}${isLast ? '.' : ';'}</strong>`;
        } else {
          cleanSub += punct(isLast);
        }
      } else {
        cleanSub = cleanSub.replace(/[.;,]\s*$/, '') + punct(isLast);
      }
      html += `<li style="margin-bottom: 4px;">${cleanSub}</li>`;
    });
    html += '</ul>';
  }

  html += '</li>';
  return html;
}

// =============================================
// RENDER PRINCIPAL — Converte JSON completo em HTML
// =============================================

/**
 * Schema de entrada completo:
 * {
 *   data: "19/05/2026",
 *   resumo_verba: "Aumentamos o orçamento do projeto de 14.836$/mês para 15.261$/mês" | null,
 *   alteracoes: [ ...items conforme schema acima... ]
 * }
 */
export function renderDiaryHTML(data) {
  if (!data || (!data.alteracoes && !data.resumo_verba)) {
    return '<p>Nenhuma alteração identificada nas imagens fornecidas. Tente enviar imagens com maior resolução.</p>';
  }

  let html = '';

  // --- Separador + Data (Padrão KDG) ---
  const dataStr = data.data || 'Data não identificada';
  html += `<hr style="margin-bottom: 12px;">`;
  html += `<h4 style="margin-bottom: 8px;"><strong>Data da Otimização: ${dataStr}</strong></h4>`;

  // --- Resumo de verba global (se houver) ---
  if (data.resumo_verba) {
    // Formatar com negrito no verbo e no valor novo
    let resumo = data.resumo_verba;
    // Negrito no verbo principal
    resumo = resumo.replace(/^(Aumentamos|Reduzimos|Alteramos|Mantivemos)/i, '<strong>$1</strong>');
    // Negrito nos valores monetários novos (após "para")
    resumo = resumo.replace(/para\s+([\d.,]+\$\/[\w-]+|R\$\s?[\d.,]+(?:\/[\w-]+)?)/g, 'para <strong>$1</strong>');
    
    html += `<p style="margin-bottom: 4px;">• ${resumo}</p>`;
  }

  // --- Header "Alterações:" ---
  html += `<p style="margin-bottom: 8px;"><strong><u>Alterações</u>:</strong></p>`;

  // --- Lista de alterações (agrupadas por campanha) ---
  if (data.alteracoes && data.alteracoes.length > 0) {
    // Agrupar alterações por chave de campanha (tag + plataforma + tipo)
    const campaignGroups = new Map();
    data.alteracoes.forEach(alt => {
      const tNorm = normalizeTipoCampanha(alt.tipo_campanha);
      const key = `${alt.tag_campanha || ''}||${alt.plataforma || ''}||${tNorm || ''}`;
      if (!campaignGroups.has(key)) {
        campaignGroups.set(key, { tag: alt.tag_campanha, plataforma: alt.plataforma, tipoCampanha: tNorm, items: [] });
      }
      campaignGroups.get(key).items.push(alt);
    });

    html += '<ul style="margin-top: 4px; padding-left: 20px;">';

    campaignGroups.forEach(group => {
      // Header da campanha (ex: "[REV-PJ] [Meta Ads] Na campanha de formulário:")
      const tagH = group.tag ? `<strong style="color: ${TAG_COLOR};">${group.tag}</strong> ` : '';
      const platH = group.plataforma ? `<span style="color: ${TAG_COLOR};">[${group.plataforma}]</span> ` : '';
      const tipoH = group.tipoCampanha ? `Na campanha de <u>${group.tipoCampanha}</u>` : '';

      html += `<li style="margin-bottom: 8px;"><p>${tagH}${platH}${tipoH}:</p>`;
      html += '<ul style="margin-top: 4px;">';

      group.items.forEach(alt => {
        if (alt.tipo === 'texto_livre' || alt.texto_livre) {
          html += renderAlteracao(alt, null, true);
        } else if (alt.acoes && alt.acoes.length > 0) {
          alt.acoes.forEach(acao => {
            html += renderAlteracao(alt, acao, true);
          });
        } else {
          html += renderAlteracao(alt, null, true);
        }
      });

      html += '</ul></li>';
    });

    html += '</ul>';
  }

  // --- Seção "Visão Geral" (placeholder — as imagens o gestor sobe manualmente) ---
  html += `<p style="margin-top: 16px;"><strong><u>Visão Geral do Mapa de Campanhas</u>:</strong></p>`;
  html += `<p style="margin-top: 4px;">Resultados</p>`;
  html += `<p style="color: #888; font-style: italic;">[Imagem de resultados — anexada pelo gestor]</p>`;
  html += `<p style="margin-top: 8px;">Como Ficou</p>`;
  html += `<p style="color: #888; font-style: italic;">[Imagem do mapa atualizado — anexada pelo gestor]</p>`;

  return html;
}

// =============================================
// CLIPBOARD — Copiar como Rich Text
// =============================================
export async function copyDiaryToClipboard(element) {
  if (!element) return;

  const htmlContent = element.innerHTML;
  const styledHTML = buildStyledHTML(htmlContent);

  try {
    const blob = new Blob([styledHTML], { type: 'text/html' });
    const plainBlob = new Blob([element.innerText], { type: 'text/plain' });

    const clipboardItem = new ClipboardItem({
      'text/html': blob,
      'text/plain': plainBlob,
    });

    await navigator.clipboard.write([clipboardItem]);
    console.log('[Editor] Copiado via Async Clipboard API');
  } catch (err) {
    console.warn('[Editor] Clipboard API falhou. Tentando fallback...', err);
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand('copy');
    selection.removeAllRanges();
  }
}

function buildStyledHTML(innerHTML) {
  const prefix = `<meta charset="utf-8"><div style="font-family: Arial, sans-serif; font-size: 11pt; color: #000000;">`;
  const suffix = `</div>`;
  return prefix + innerHTML + suffix;
}
