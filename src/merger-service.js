/* ============================================
   merger-service.js — Comparador Lógico (Fase 3)
   Recebe 2 JSONs (antes/depois) do Extractor e
   gera a lista de alterações para o Formatter.
   SEM IMAGENS — apenas texto.
   ============================================ */

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent';

// =================================================
// PROMPT DO MERGER — com golden examples do KDG
// =================================================
const MERGER_PROMPT = `Você é um Analisador Comparativo de Campanhas de Tráfego Pago, especialista em Meta Ads e Google Ads no padrão KDG.

Sua única função é comparar dois estados de campanhas representados em JSON estruturado (árvores de campanhas) e gerar a lista precisa de alterações no formato KDG.

Você receberá:
1. O JSON estruturado do estado ANTES das otimizações.
2. O JSON estruturado do estado DEPOIS das otimizações.
3. (Opcional) Texto livre complementar do gestor com contexto.

REGRAS DE OURO, UNIÃO DE FONTES E SOBERANIA DO TEXTO DO GESTOR (CRÍTICO):
Se o 'TEXTO DO GESTOR' for fornecido, ele tem prioridade absoluta e soberania total sobre as informações.
A lista final de alterações deve ser a UNIÃO das duas fontes de informação:
1. SOBERANIA E INCLUSÃO DO TEXTO DO GESTOR: Qualquer alteração, novo anúncio, aumento ou redução de verba citado pelo gestor DEVE ser incluído no relatório final, mesmo que você não a encontre ou não esteja clara na árvore estruturada JSON (nesse caso, infira a tag da campanha correta, plataforma e público correspondente com base nas informações existentes ou infira conforme o contexto).
2. INCLUSÃO DE ALTERAÇÕES VISUAIS: Qualquer alteração nítida identificada ao comparar a árvore ANTES e DEPOIS (por exemplo, pausas de públicos/anúncios sinalizadas pela mudança de status) deve ser incluída no relatório, mesmo que o gestor não a mencione no texto.
3. SOBERANIA DE VALORES E ORÇAMENTOS (CBO vs ABO):
   - Se o gestor informar que o orçamento é em CBO ou compartilhado (ex: "em CBO com 32$/dia-útil rodando os ADs 2, 3, 4 e 5"), defina o campo 'verba_cbo' da ação correspondente com o valor (ex: "32$/dia-útil") e NÃO repita nem duplique esse valor em cada anúncio individual ('verba_nova', 'verba_antes', 'verba_depois' dos anúncios devem ficar vazios).
   - Se o gestor informar uma verba específica para um AD (ex: "AD 7 foi de 38$ para 76$/dia"), use exatamente esse valor no JSON final.
   - Se o gestor descrever uma mudança no orçamento global do projeto (ex: de R$230/dia para R$300/dia ou R$9.000/mês), registre isso detalhadamente no campo 'resumo_verba' no formato exato citado pelo gestor (ex: "Aumentamos o orçamento do projeto de R$ 230/dia para R$ 300/dia (R$ 9.000/mês)").
4. PRIORIZAÇÃO DE NOMENCLATURAS COMPLETAS: Se o gestor descrever o nome completo do anúncio (ex: "AD 11 - CP Dívida acima de 100k"), priorize esse nome.
5. FIDELIDADE COMPLETA E SEM OMISSÕES: Nenhuma otimização citada pelo gestor pode ser ignorada no JSON final.
6. PRECISÃO NO ESCOPO (PÚBLICOS VS. ANÚNCIOS):
   - Se o gestor disser que pausou o público inteiro, registre com "escopo": "publico" e "verbo": "pausamos". NÃO registre como pausas de anúncios individuais.
   - Se o gestor disser "pausamos o AD X", o escopo é "anuncios".
7. NOMENCLATURAS DOS PÚBLICOS LIMPAS: Use os nomes de forma limpa e concisa. Remova extensões geográficas desnecessárias se o nome condizente for mais direto (ex: "[MANUAL] Aberto + RS" em vez de "Advantage + Sul, Centro-Oeste, SP + 30-55").
8. PREVENÇÃO DE ALUCINAÇÕES (SEM FALSOS POSITIVOS): Não inclua no JSON nenhuma alteração que não esteja explícita nem na comparação das árvores (ANTES e DEPOIS) e nem no texto do gestor. Qualquer item adicionado deve obrigatoriamente estar em pelo menos uma das duas fontes.

REGRAS DE COMPARAÇÃO GERAIS (QUANDO NÃO HÁ TEXTO DO GESTOR):
1. Compare a árvore do ANTES com a do DEPOIS.
2. Ignore anúncios, públicos e campanhas que mantiveram o mesmo status e verba.
3. Identifique as alterações reais:
   - Se o status mudou de ativo para pausado: "verbo": "pausamos".
   - Se um anúncio/público novo surgiu no DEPOIS: "verbo": "adicionamos" (ou "Iniciamos" se for nova campanha/público).
   - Se o orçamento mudou: use "aumentamos" (se maior), "reduzimos" (se menor) ou "alteramos".
4. Terminologia: Use o termo "público" ao invés de "conjunto" (Padrão KDG).

VERBOS PERMITIDOS: "pausamos", "alteramos", "adicionamos", "Iniciamos", "reativamos", "reduzimos", "aumentamos".

FORMATO DE VERBA: "XX$/dia-útil", "XX$/dia" ou "XX$/mês".`;

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

/**
 * Compara dois objetos de árvore estruturada de campanhas e gera a lista de alterações.
 * @param {Object} treeAntes - Árvore estruturada de campanhas do estado ANTES
 * @param {Object} treeDepois - Árvore estruturada de campanhas do estado DEPOIS
 * @param {string} apiKey - Gemini API key (Key 3)
 * @param {string} [textoGestor] - Texto opcional do gestor de tráfego
 * @param {string} [dataOtimizacao] - Data da otimização (DD/MM/YYYY)
 * @returns {Object} JSON com { data, resumo_verba, alteracoes[] }
 */
export async function mergeAndCompare(treeAntes, treeDepois, apiKey, textoGestor = '', dataOtimizacao = '') {
  if (!apiKey || apiKey === 'SUA_CHAVE_GEMINI_AQUI') {
    throw new Error('API Key do Merger não configurada.');
  }

  // Montar o conteúdo textual para o modelo
  const userContent = buildUserMessage(treeAntes, treeDepois, textoGestor, dataOtimizacao);

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
        responseSchema: mergerSchema
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
 * Monta a mensagem do usuário com os dois JSONs estruturados + contexto.
 */
function buildUserMessage(treeAntes, treeDepois, textoGestor, dataOtimizacao) {
  let msg = '';

  const dateStr = dataOtimizacao || new Date().toLocaleDateString('pt-BR');
  msg += `DATA DA OTIMIZAÇÃO: ${dateStr}\n\n`;

  msg += `=== JSON ESTRUTURADO - ESTADO ANTES (original) ===\n`;
  msg += JSON.stringify(treeAntes, null, 2);
  msg += `\n\n=== JSON ESTRUTURADO - ESTADO DEPOIS (atualizado) ===\n`;
  msg += JSON.stringify(treeDepois, null, 2);

  if (textoGestor && textoGestor.trim()) {
    msg += `\n\n=== CONTEXTO DO GESTOR DE TRÁFEGO ===\n`;
    msg += textoGestor.trim();
  }

  msg += `\n\n[INSTRUÇÃO]: Compare a árvore estruturada do estado ANTES com a do estado DEPOIS e gere a lista completa de alterações no formato KDG. Ignore alterações que mantiveram o mesmo status e verba. Se houver texto do gestor com contexto, ele tem prioridade absoluta e soberania total sobre as árvores JSON.`;

  return msg;
}
