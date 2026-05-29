/* ============================================
   merger-service.js — Comparador Lógico (Fase 3)
   Recebe 2 JSONs (antes/depois) do Extractor e
   gera a lista de alterações para o Formatter.
   SEM IMAGENS — apenas texto.
   ============================================ */

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// =================================================
// PROMPT DO MERGER — com golden examples do KDG
// =================================================
const MERGER_PROMPT = `Você é um Analisador de Alterações de Campanhas de Tráfego Pago, especialista em Meta Ads e Google Ads.

Sua ÚNICA função é comparar dois estados de campanhas extraídos via OCR (Tesseract) e gerar uma lista precisa de alterações.

Você receberá:
1. O texto bruto obtido via OCR (Tesseract) do estado ANTES das otimizações.
2. O texto bruto obtido via OCR (Tesseract) do estado DEPOIS das otimizações.
3. (Opcional) Um texto livre adicional do gestor de tráfego com contexto.

REGRAS DE INTERPRETAÇÃO DE TEXTO OCR (CRÍTICO):
1. Tolerar Erros de Digitação do OCR: O OCR frequentemente gera pequenas imperfeições nas palavras. Por exemplo:
   - "Deciszor P" ou "Decisa: Pasa" -> Corrija logicamente para "Decisão: Pausar".
   - "dia-atil" ou "dia-util" -> Corrija logicamente para "dia-útil" ou "dia".
   - "AD14 cP Dívida" -> Corrija para "AD 14 - CP Dívida".
   Sempre limpe essas nomenclaturas e restabeleça a forma correta ao gerar o JSON.
2. Associação Hierárquica Lógica: O OCR extrai o texto sequencialmente. Use os seguintes identificadores para deduzir a árvore hierárquica:
   - Campanhas: Possuem tags com colchetes no nome (ex: [REV-PJ], [AGRO], [PREV], [BRANDING]).
   - Públicos/Conjuntos: Iniciam frequentemente com numeração e estrutura (ex: "00 - [MANUAL] Aberto...", "00 - [INSTA]...").
   - Anúncios (ADs): Anúncios individuais marcados como "AD 1", "AD 9", "AD 21", etc.
   Use a proximidade espacial das linhas no texto OCR para deduzir a hierarquia lógica.

COMPORTAMENTO E SOBERANIA DO TEXTO DO GESTOR (REGRA SOBERANA DE OURO - ÂNCORA):
Se o 'TEXTO DO GESTOR' for fornecido, ele é a verdade absoluta. Use o OCR apenas para complementar nomenclaturas exatas. Respeite as seguintes regras rigorosas:
1. SOBERANIA DE VALORES E ORÇAMENTOS (CBO vs ABO):
   - Se o gestor informar que o orçamento é em **CBO** ou que múltiplos anúncios rodam sob um único orçamento compartilhado (ex: "em CBO com 32$/dia-útil rodando os ADs 2, 3, 4 e 5"), defina o campo 'verba_cbo' da ação correspondente com o valor (ex: "32$/dia-útil") e NÃO repita nem duplique esse valor de verba em cada anúncio individual ('verba_nova', 'verba_antes', 'verba_depois' dos anúncios devem ficar vazios).
   - Se o gestor informar uma verba específica individual para um AD (ex: "AD 14 foi de 60$ para 80$/dia-útil"), essa informação e esse valor (ex: "80$/dia-útil") DEVEM constar no JSON final, independentemente de qualquer valor incorretamente detectado no OCR (por exemplo, ignore se o OCR diz "84$").
2. PRIORIZAÇÃO DE NOMENCLATURAS COMPLETAS DE CRIATIVOS: Se o gestor descrever o nome completo do anúncio (ex: "AD 11 - CP Dívida acima de 100k"), priorize esse nome completo em relação a qualquer leitura incompleta ou truncada do OCR (que possa ter retornado apenas "AD 11"). O OCR serve para complementar quando o gestor abrevia, e não para substituir nomes completos corretos fornecidos pelo gestor.
3. FIDELIDADE COMPLETA E SEM OMISSÕES: Nenhuma otimização citada pelo gestor pode ser ignorada no JSON final.
   - Toda mudança de verba, pausa de público ou campanha, alteração de infraestrutura (como a troca do formulário de v2.2 para v2.3 e a troca do link do Tintim) deve ser registrada.
   - Se o gestor informar uma alteração de infraestrutura, coloque sob a campanha correspondente com "escopo": "outro", "verbo": "alteramos", e "texto_complementar" descrevendo a alteração (ex: "alteramos o formulário de (v2.2) para (v2.3) e o link do Tintim").
   - Se o gestor disser que adicionou novos anúncios (ex: "dois novos criativos para Branding com 10$/dia cada" ou "AD 1 - Trabalhar para pagar os bancos com 45$/dia-útil"), registre exatamente esses anúncios sob as respectivas campanhas. Não os omita.
4. PRECISÃO NO ESCOPO (PÚBLICOS VS. ANÚNCIOS):
   - Se o gestor disser que "pausou o público inteiro" (ex: "pausou frentes de SP e de MT" ou "pausou o mix de interesses de BPC Idoso"), registre com "escopo": "publico" e "verbo": "pausamos". NÃO registre como pausas de anúncios individuais!
   - Se o gestor disser "pausamos o AD X", o "escopo" deve ser "anuncios".
5. NOMENCLATURAS DOS PÚBLICOS LIMPAS: Use os nomes dos públicos de forma limpa e concisa. Não alongue artificialmente os nomes dos públicos adicionando extensões geográficas ou faixas etárias por extenso (ex: "Advantage + Sul, Centro-Oeste, SP e MG + 30-50") se o nome real condizente for mais direto (ex: "Advantage" ou "[MANUAL] Aberto + RS"). Cruze o que o gestor escreveu com o OCR para achar a nomenclatura oficial correspondente de forma concisa.
6. PREVENÇÃO DE ALUCINAÇÕES (SEM FALSOS POSITIVOS): Não inclua no JSON nenhuma alteração que o gestor NÃO tenha citado ou sugerido no texto livre. Se o OCR mostrar um anúncio ou público que foi alterado ou pausado no histórico do OCR, mas o gestor não o mencionou no texto livre, ignore essa alteração (ex: não invente a adição do "AD 27 - Dinheiro some (PR)" se o gestor não o mencionou).
7. TRADUÇÃO SEMÂNTICA FIEL: Traduza exatamente a ação informada pelo gestor. Se ele diz que adicionou 2 anúncios novos de 10$/dia na campanha de Branding, registre isso. Não descreva genericamente como "reativou por completo a campanha de captação" se a ação foi a adição de novos criativos de branding.
 
REGRAS DE COMPARAÇÃO GERAIS (QUANDO NÃO HÁ TEXTO DO GESTOR):
1. Compare os textos OCR de antes e depois e registre as alterações.
2. Agrupe as alterações reais por tag de campanha e público.
3. Ignore anúncios e públicos que não sofreram alterações ou que mantiveram a verba.
 
VERBOS PERMITIDOS (use exatamente estes, em minúsculas exceto no início de frase):
- "pausamos" → quando algo foi desativado ou removido
- "alteramos" → quando a verba/orçamento mudou
- "adicionamos" → quando um anúncio novo foi criado dentro de um público existente
- "Iniciamos" → quando uma campanha ou público inteiramente novo começou
- "reativamos" → quando algo inativo voltou a ficar ativo
- "reduzimos" → quando o valor da verba  diminuiu
- "aumentamos" → quando o valor da verba aumentou
 
REGRAS DE VERBA:
- Se o orçamento for em CBO (Campaign Budget Optimization), utilize a chave 'verba_cbo' no objeto da ação correspondente, deixando os anúncios sem valores individuais de verba.
- Se o anúncio tinha verba no ANTES e tem verba diferente no DEPOIS -> "alteramos" ou "aumentamos" / "reduzimos" com verba_antes e verba_depois.
- Se o anúncio é NOVO -> use verba_nova com o valor do DEPOIS.
- Formato de verba: "XX$/dia-útil" (ex: "40$/dia-útil") ou "XX$/dia" ou "XX$/mês".
 
IMPORTANTE SOBRE RESUMO DE VERBA:
- O campo 'resumo_verba' serve APENAS para alterações globais de orçamento total do projeto (ex: "Aumentamos o orçamento do projeto de R$ 14.836/mês para R$ 15.261/mês").
- NÃO coloque escalas de anúncios individuais ou de conjuntos no campo 'resumo_verba' (elas devem ir na lista de 'alteracoes').
- Se o gestor não informou nenhuma alteração de orçamento geral do projeto, simplesmente OMITA a chave 'resumo_verba' do JSON.
- Gere o campo "data" como a data de hoje se não fornecida.`;

// =================================================
// SCHEMA DO MERGER (Structured Outputs)
// =================================================
const mergerSchema = {
  type: "OBJECT",
  properties: {
    raciocinio: {
      type: "STRING",
      description: "Pense passo-a-passo: liste as diferenças que encontrou entre antes e depois antes de preencher o JSON."
    },
    data: {
      type: "STRING",
      description: "Data da otimização no formato DD/MM/YYYY."
    },
    resumo_verba: {
      type: "STRING",
      description: "Resumo global do orçamento, ex: 'Aumentamos o orçamento de 14.836$/mês para 15.261$/mês'. Apenas omita a chave se não houver informação."
    },
    alteracoes: {
      type: "ARRAY",
      description: "Lista de todas as alterações detectadas.",
      items: {
        type: "OBJECT",
        properties: {
          tipo: {
            type: "STRING",
            description: "Tipo da alteração: 'pausa', 'alteracao', 'adicao', 'inicio', 'reativacao', 'composto', 'texto_livre'."
          },
          tag_campanha: {
            type: "STRING",
            description: "Tag da campanha (ex: [REV-PJ], [AGRO], [PREV]). Use colchetes."
          },
          plataforma: {
            type: "STRING",
            description: "Plataforma da campanha (ex: Meta Ads, Google Ads)."
          },
          tipo_campanha: {
            type: "STRING",
            description: "Tipo/objetivo da campanha: 'formulário', 'mensagem', 'captação', etc."
          },
          publico: {
            type: "STRING",
            description: "Nome do público onde a ação acontece (ex: [MANUAL] Advantage). Não envie se a ação é sobre a campanha inteira."
          },
          acoes: {
            type: "ARRAY",
            description: "Lista de ações dentro desta alteração. Para tipo 'composto', haverá múltiplas ações.",
            items: {
              type: "OBJECT",
              properties: {
                verbo: {
                  type: "STRING",
                  description: "O verbo da ação: 'pausamos', 'alteramos', 'adicionamos', 'Iniciamos', 'reativamos', etc."
                },
                verbo_tipo: {
                  type: "STRING",
                  description: "Classificação do verbo: 'pausa', 'alteracao', 'adicao', 'inicio', 'reativacao'."
                },
                escopo: {
                  type: "STRING",
                  description: "Nível da ação: 'anuncios' (sobre ADs individuais), 'publico' (sobre um público/conjunto inteiro), 'campanha' (sobre a campanha inteira), 'inicio_campanha' (início de campanha com múltiplos públicos)."
                },
                verba_cbo: {
                  type: "STRING",
                  description: "Verba no nível de CBO (Campaign Budget Optimization) ou orçamento conjunto para os anúncios listados, ex: '32$/dia-útil'. Só envie se aplicável e compartilhado entre os anúncios."
                },
                publico_alvo: {
                  type: "STRING",
                  description: "Nome do público-alvo quando o escopo é 'publico' (criação/pausa de público). Não envie para escopo 'anuncios'."
                },
                anuncios: {
                  type: "ARRAY",
                  description: "Lista de anúncios afetados pela ação.",
                  items: {
                    type: "OBJECT",
                    properties: {
                      nome: {
                        type: "STRING",
                        description: "Nome do anúncio (ex: AD 14 - CP Dívida 1M). Para escopo 'inicio_campanha', use o nome do público aqui."
                      },
                      ad_nome: {
                        type: "STRING",
                        description: "Nome do anúncio dentro do público, usado apenas quando escopo é 'inicio_campanha'."
                      },
                      verba_antes: {
                        type: "STRING",
                        description: "Verba anterior (ex: 40$/dia-útil). Não envie se não aplicável."
                      },
                      verba_depois: {
                        type: "STRING",
                        description: "Nova verba (ex: 60$/dia-útil). Não envie se não aplicável."
                      },
                      verba_nova: {
                        type: "STRING",
                        description: "Verba para anúncios novos (ex: 40$/dia-útil). Não envie se não aplicável."
                      }
                    },
                    required: ["nome"]
                  }
                },
                texto_complementar: {
                  type: "STRING",
                  description: "Texto extra livre para ações que não cabem no schema de anúncios."
                }
              },
              required: ["verbo", "verbo_tipo", "escopo"]
            }
          },
          texto_livre: {
            type: "STRING",
            description: "Fallback para alterações que não cabem no schema estruturado."
          }
        },
        required: ["tipo", "tag_campanha", "plataforma", "acoes"]
      }
    }
  },
  required: ["raciocinio", "data", "alteracoes"]
};

/**
 * Repara JSON malformado gerado pelo Gemini.
 * Passa múltiplas correções:
 *   1. Escapa control chars reais dentro de strings (\n, \r, \t)
 *   2. Remove trailing commas antes de } ou ]
 *   3. Tenta parse direto primeiro; se falhar, aplica reparos e tenta de novo
 */
function repairJson(rawText) {
  // --- Tentativa 1: parse direto ---
  try {
    return JSON.parse(rawText);
  } catch (_) { /* continua */ }

  // --- Passo 1: escapar control chars dentro de strings JSON ---
  let step1 = '';
  {
    let inStr = false;
    let esc = false;
    for (let i = 0; i < rawText.length; i++) {
      const c = rawText[i];
      if (c === '"' && !esc) {
        inStr = !inStr;
        step1 += c;
      } else if (c === '\\' && inStr && !esc) {
        esc = true;
        step1 += c;
      } else {
        if (inStr) {
          if (c === '\n')      step1 += '\\n';
          else if (c === '\r') step1 += '\\r';
          else if (c === '\t') step1 += '\\t';
          else                 step1 += c;
        } else {
          step1 += c;
        }
        esc = false;
      }
    }
  }

  // --- Tentativa 2: após escapar control chars ---
  try {
    return JSON.parse(step1);
  } catch (_) { /* continua */ }

  // --- Passo 2: remover trailing commas (,] e ,}) ---
  let step2 = step1.replace(/,\s*([\]}])/g, '$1');

  // --- Tentativa 3: após remover trailing commas ---
  try {
    return JSON.parse(step2);
  } catch (_) { /* continua */ }

  // --- Passo 3: tentar extrair apenas o objeto JSON válido ---
  // Às vezes o modelo manda texto extra antes/depois do JSON
  const firstBrace = step2.indexOf('{');
  const lastBrace = step2.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const extracted = step2.substring(firstBrace, lastBrace + 1);
    // Remover trailing commas de novo no trecho extraído
    const cleaned = extracted.replace(/,\s*([\]}])/g, '$1');
    try {
      return JSON.parse(cleaned);
    } catch (_) { /* continua */ }
  }

  // --- Nenhuma tentativa funcionou: lançar erro com contexto ---
  throw new Error(`Impossível reparar JSON. Trecho ao redor da posição 1100-1200: "${step2.substring(1100, 1200)}"`);
}

// =================================================
// FUNÇÃO PRINCIPAL: mergeAndCompare
// =================================================

/**
 * Compara dois blocos de texto OCR de campanhas e gera a lista de alterações.
 * @param {string} ocrAntes - Texto bruto do OCR do estado ANTES
 * @param {string} ocrDepois - Texto bruto do OCR do estado DEPOIS
 * @param {string} apiKey - Gemini API key (Key 3)
 * @param {string} [textoGestor] - Texto opcional do gestor de tráfego
 * @param {string} [dataOtimizacao] - Data da otimização (DD/MM/YYYY)
 * @returns {Object} JSON com { data, resumo_verba, alteracoes[] }
 */
export async function mergeAndCompare(ocrAntes, ocrDepois, apiKey, textoGestor = '', dataOtimizacao = '') {
  if (!apiKey || apiKey === 'SUA_CHAVE_GEMINI_AQUI') {
    throw new Error('API Key do Merger não configurada.');
  }

  // Montar o conteúdo textual para o modelo
  const userContent = buildUserMessage(ocrAntes, ocrDepois, textoGestor, dataOtimizacao);

  console.log('[Merger] Enviando para Gemini...');
  console.log('[Merger] Tamanho do conteúdo:', userContent.length, 'chars');

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: MERGER_PROMPT }],
      },
      contents: [
        {
          parts: [
            { text: userContent },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        responseSchema: mergerSchema,
        thinkingConfig: {
          thinkingBudget: 0
        }
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
    throw new Error(`Gemini Merger API error (${response.status}): ${err.error?.message || 'Erro desconhecido'}`);
  }

  const data = await response.json();
  console.log('[Merger] Full Gemini API Response:', JSON.stringify(data, null, 2));
  const candidate = data.candidates?.[0];

  if (!candidate || !candidate.content || !candidate.content.parts) {
    throw new Error(`Merger retornou resposta vazia ou inválida. Motivo (finishReason): ${candidate?.finishReason || 'Desconhecido'}`);
  }

  let text = candidate.content.parts[0]?.text || "";
  
  // Extrair do markdown caso a API teime em mandar
  const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (mdMatch) {
    text = mdMatch[1];
  } else {
    text = text.trim();
  }

  // Log do texto bruto pra debug
  console.log('[Merger] Texto bruto do modelo (primeiros 500 chars):', text.substring(0, 500));
  
  try {
    const result = repairJson(text);
    console.log('[Merger] Sucesso! Alterações encontradas:', result.alteracoes?.length || 0);
    delete result.raciocinio;
    return result;
  } catch (e) {
    // Log completo pra debug no console
    console.error('[Merger] TEXTO BRUTO COMPLETO:', text);
    console.error('[Merger] Erro de parse JSON:', e);
    throw new Error(`Parse JSON falhou: ${e.message}. Início do texto: ${text.substring(0, 150)}...`);
  }
}

// =================================================
// HELPERS
// =================================================

/**
 * Monta a mensagem do usuário com os dois textos OCR + contexto.
 */
function buildUserMessage(ocrAntes, ocrDepois, textoGestor, dataOtimizacao) {
  let msg = '';

  const dateStr = dataOtimizacao || new Date().toLocaleDateString('pt-BR');
  msg += `DATA DA OTIMIZAÇÃO: ${dateStr}\n\n`;

  msg += `=== TEXTO OCR - ESTADO ANTES (original) ===\n`;
  msg += ocrAntes || '(Nenhum texto extraído do estado antes)';
  msg += `\n\n=== TEXTO OCR - ESTADO DEPOIS (atualizado) ===\n`;
  msg += ocrDepois || '(Nenhum texto extraído do estado depois)';

  if (textoGestor && textoGestor.trim()) {
    msg += `\n\n=== CONTEXTO DO GESTOR DE TRÁFEGO ===\n`;
    msg += textoGestor.trim();
  }

  msg += `\n\n[INSTRUÇÃO]: Compare os dois estados extraídos via OCR acima e gere a lista completa de alterações. Ignore ações com decisão 'Mantém'. Agrupe as alterações reais por tag de campanha e público. Use os verbos corretos para cada tipo de ação.`;

  return msg;
}
