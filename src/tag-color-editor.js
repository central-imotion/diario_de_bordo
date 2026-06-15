/* ============================================
   tag-color-editor.js — Editor de Cores das Tags
   Exibe TODAS as tags detectadas no output atual.
   Sem persistência — o gestor configura por sessão/cliente.
   ============================================ */

import { setTagColors, getTagColor, getSessionColors, DEFAULT_TAG_COLOR } from './tag-config.js';

let modal = null;

export function initTagColorEditor() {
  modal = document.createElement('div');
  modal.id = 'tag-color-modal';
  modal.className = 'tcm-overlay hidden';
  modal.innerHTML = `
    <div class="tcm-panel">
      <div class="tcm-header">
        <div class="tcm-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="13.5" cy="6.5" r="2.5"/>
            <circle cx="17.5" cy="10.5" r="2.5"/>
            <circle cx="8.5" cy="7.5" r="2.5"/>
            <circle cx="6.5" cy="12.5" r="2.5"/>
            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
          </svg>
          Cores das Tags
        </div>
        <button class="tcm-close" id="tcm-close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="tcm-body">
        <p class="tcm-intro">Tags detectadas no output atual. Ajuste as cores conforme o padrão do cliente — as mudanças se aplicam imediatamente na tela.</p>

        <div id="tcm-list" class="tcm-list"></div>

        <button class="tcm-add-btn" id="tcm-add-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Adicionar tag manualmente
        </button>
      </div>

      <div class="tcm-footer">
        <button class="tcm-btn-reset" id="tcm-btn-reset">Resetar cores</button>
        <div class="tcm-footer-right">
          <button class="tcm-btn-cancel" id="tcm-btn-cancel">Cancelar</button>
          <button class="tcm-btn-save" id="tcm-btn-save">Aplicar</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('tcm-close').addEventListener('click', closeModal);
  document.getElementById('tcm-btn-cancel').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  document.getElementById('tcm-btn-save').addEventListener('click', applyAndClose);
  document.getElementById('tcm-btn-reset').addEventListener('click', resetAndRender);
  document.getElementById('tcm-add-btn').addEventListener('click', () => addNewTagRow());

  window.addEventListener('tagConfigChanged', reapplyTagColors);
}

export function openTagColorEditor() {
  if (!modal) initTagColorEditor();
  renderTagList();
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderTagList() {
  const list = document.getElementById('tcm-list');
  list.innerHTML = '';

  // Pega todas as tags presentes no output (DOM) + as que já estão na sessão
  const allEntries = buildEntriesFromSession();

  if (allEntries.length === 0) {
    list.innerHTML = `<p style="color:var(--text-tertiary);font-size:13px;text-align:center;padding:24px 0;">Nenhuma tag encontrada no output ainda.<br>Gere um output primeiro.</p>`;
    return;
  }

  allEntries.forEach(entry => {
    list.appendChild(buildTagRow(entry));
  });
}

function buildEntriesFromSession() {
  // Só mostra tags que aparecem no output atual (DOM)
  const sessionColors = getSessionColors();
  const entries = [];
  const seen = new Set();

  document.querySelectorAll('[data-tag-key]').forEach(el => {
    const key = el.dataset.tagKey;
    if (seen.has(key)) return;
    seen.add(key);
    const label = el.textContent.replace(/[\[\]]/g, '').trim();
    entries.push({ key, label, color: sessionColors.get(key) || DEFAULT_TAG_COLOR });
  });

  return entries;
}

function buildTagRow(entry) {
  const color = entry.color || DEFAULT_TAG_COLOR;
  const row = document.createElement('div');
  row.className = 'tcm-row';
  row.innerHTML = `
    <span class="tcm-preview" style="color:${color}">[${entry.label}]</span>
    <input type="text" class="tcm-label-input" value="${entry.label}" placeholder="Nome da tag" />
    <input type="color" class="tcm-color-picker" value="${color}" title="Escolha a cor" />
    <input type="text" class="tcm-hex-input" value="${color}" maxlength="7" placeholder="#000000" spellcheck="false" />
    <button class="tcm-delete-btn" title="Remover">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
    </button>
  `;
  bindRowEvents(row);
  return row;
}

function bindRowEvents(row) {
  const picker = row.querySelector('.tcm-color-picker');
  const hexInput = row.querySelector('.tcm-hex-input');
  const preview = row.querySelector('.tcm-preview');
  const labelInput = row.querySelector('.tcm-label-input');

  picker.addEventListener('input', () => {
    hexInput.value = picker.value;
    preview.style.color = picker.value;
  });

  hexInput.addEventListener('input', () => {
    const v = hexInput.value;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      picker.value = v;
      preview.style.color = v;
    }
  });

  labelInput.addEventListener('input', () => {
    preview.textContent = `[${labelInput.value || 'Tag'}]`;
  });

  row.querySelector('.tcm-delete-btn').addEventListener('click', () => row.remove());
}

function addNewTagRow() {
  const list = document.getElementById('tcm-list');
  const row = buildTagRow({ key: '', label: '', color: DEFAULT_TAG_COLOR });
  list.appendChild(row);
  row.querySelector('.tcm-label-input').focus();
}

function resetAndRender() {
  if (!confirm('Resetar todas as cores para o padrão (#4a9eff)?')) return;
  // Limpa as cores da sessão sem disparar evento (só re-renderiza o modal)
  renderTagList();
  // Ao salvar, o gestor confirma o reset
}

// ── Collect & Apply ───────────────────────────────────────────────────────────

function collectFormEntries() {
  const list = document.getElementById('tcm-list');
  const entries = [];
  const seen = new Set();

  list.querySelectorAll('.tcm-row').forEach(row => {
    const label = row.querySelector('.tcm-label-input').value.trim();
    const color = row.querySelector('.tcm-color-picker').value;
    if (!label) return;
    const key = label.toLowerCase().trim();
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ key, label, color });
  });

  return entries;
}

function applyAndClose() {
  const entries = collectFormEntries();
  setTagColors(entries);
  closeModal();
}

// ── Reapply após mudança na sessão ───────────────────────────────────────────

function reapplyTagColors() {
  document.querySelectorAll('[data-tag-key]').forEach(span => {
    const key = span.dataset.tagKey;
    const color = getTagColor(key);
    if (color) {
      span.classList.add('tag-highlight');
      span.style.color = color;
      span.dataset.color = color;
    } else {
      span.classList.remove('tag-highlight');
      span.style.removeProperty('color');
      delete span.dataset.color;
    }
  });
}
