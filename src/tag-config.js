/* ============================================
   tag-config.js — Cores das tags (por sessão)
   Sem persistência — o gestor pinta a cada output.
   Verbos de ação (pausamos, adicionamos…) não passam por aqui.
   ============================================ */

// Todas as tags conhecidas partem do mesmo azul padrão.
// O gestor sobrescreve por cliente direto no editor.
const DEFAULT_COLOR = '#4a9eff';

const SESSION_COLORS = new Map([
  // Verticais
  ['rev-pj',     DEFAULT_COLOR],
  ['rev-pf',     DEFAULT_COLOR],
  ['rev-pj/pf',  DEFAULT_COLOR],
  ['rd',         DEFAULT_COLOR],
  ['se',         DEFAULT_COLOR],
  ['lec',        DEFAULT_COLOR],
  ['dda',        DEFAULT_COLOR],
  ['trib',       DEFAULT_COLOR],
  // Plataformas
  ['meta ads',   DEFAULT_COLOR],
  ['meta',       DEFAULT_COLOR],
  ['google ads', DEFAULT_COLOR],
  ['google',     DEFAULT_COLOR],
  // Produtos
  ['trab',       DEFAULT_COLOR],
  ['fraude',     DEFAULT_COLOR],
  ['leads',      DEFAULT_COLOR],
  ['eng',        DEFAULT_COLOR],
  ['nps',        DEFAULT_COLOR],
  ['agro',       DEFAULT_COLOR],
  ['prev',       DEFAULT_COLOR],
  ['branding',   DEFAULT_COLOR],
  // Outros
  ['abono de permanencia',  DEFAULT_COLOR],
  ['abono de permanência',  DEFAULT_COLOR],
  ['df',         DEFAULT_COLOR],
  ['rch',        DEFAULT_COLOR],
]);

export function getTagColor(tagName) {
  const key = (tagName || '').toLowerCase().trim();
  return SESSION_COLORS.get(key) || null;
}

// Chamado pelo editor ao salvar — substitui o estado da sessão inteiro
export function setTagColors(entries) {
  SESSION_COLORS.clear();
  entries.forEach(e => {
    if (e.key && e.color) SESSION_COLORS.set(e.key.toLowerCase().trim(), e.color);
  });
  window.dispatchEvent(new CustomEvent('tagConfigChanged'));
}

export function getSessionColors() {
  return new Map(SESSION_COLORS);
}

export const DEFAULT_TAG_COLOR = DEFAULT_COLOR;
