/* ============================================
   main.js — App principal do Chatbot
   ============================================ */

import { analyzeImages } from './ai-service.js';
import { copyDiaryToClipboard } from './editor.js';
import './styles.css';


// --- Configuração ---
// Escolha o modelo padrão para a análise: 'gemini' ou 'claude'
const ACTIVE_MODEL = 'claude';
const PORT = process.env.PORT || 3802; // Usa a porta do Railway ou 3000 localmente
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
// --- State ---
let antesFiles = [];
let depoisFiles = [];
let isProcessing = false;

// --- DOM Elements ---
const chatArea = document.getElementById('chat-area');
const messagesContainer = document.getElementById('messages-container');
const welcomeScreen = document.getElementById('welcome-screen');
const imagePreviewBar = document.getElementById('image-preview-bar');
const imagePreviewsAntes = document.getElementById('image-previews-antes');
const imagePreviewsDepois = document.getElementById('image-previews-depois');
const messageInput = document.getElementById('message-input');
const btnSend = document.getElementById('btn-send');
const btnAttach = document.getElementById('btn-attach');
const btnNewChat = document.getElementById('btn-new-chat');
const fileInput = document.getElementById('file-input');

// --- Init ---
function init() {
  btnAttach.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileSelect);
  btnSend.addEventListener('click', handleSend);
  btnNewChat.addEventListener('click', handleNewChat);

  messageInput.addEventListener('input', () => {
    autoResizeTextarea();
    updateSendButton();
  });

  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // Paste support
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const files = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      e.preventDefault(); // Evita colar o nome do arquivo se estiver no input
      
      const targetRadio = document.querySelector('input[name="pasteTarget"]:checked');
      const target = targetRadio ? targetRadio.value : 'antes';
      
      addFiles(files, target);

      // Auto-switch to "depois" if user just pasted their first "antes" image
      if (target === 'antes' && depoisFiles.length === 0) {
        const depoisRadio = document.querySelector('input[name="pasteTarget"][value="depois"]');
        if (depoisRadio) depoisRadio.checked = true;
      }
    }
  });

  // Drag & drop support
  chatArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    chatArea.classList.add('drag-over');
  });

  chatArea.addEventListener('dragleave', () => {
    chatArea.classList.remove('drag-over');
  });

  chatArea.addEventListener('drop', (e) => {
    e.preventDefault();
    chatArea.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      const targetRadio = document.querySelector('input[name="pasteTarget"]:checked');
      const target = targetRadio ? targetRadio.value : 'antes';
      addFiles(files, target);
    }
  });


}

// --- File Handling ---
function handleFileSelect(e) {
  const files = Array.from(e.target.files);
  const targetRadio = document.querySelector('input[name="pasteTarget"]:checked');
  const target = targetRadio ? targetRadio.value : 'antes';
  addFiles(files, target);
  fileInput.value = '';
}

function addFiles(files, target = 'antes') {
  files.forEach(file => {
    if (file.type.startsWith('image/')) {
      if (target === 'antes' && antesFiles.length < 5) {
        antesFiles.push(file);
      } else if (target === 'depois' && depoisFiles.length < 5) {
        depoisFiles.push(file);
      }
    }
  });
  renderPreviews();
  updateSendButton();
}

function removeFile(index, type) {
  if (type === 'antes') {
    antesFiles.splice(index, 1);
  } else {
    depoisFiles.splice(index, 1);
  }
  renderPreviews();
  updateSendButton();
}

function renderPreviews() {
  if (antesFiles.length === 0 && depoisFiles.length === 0) {
    imagePreviewBar.classList.add('hidden');
    imagePreviewsAntes.innerHTML = '';
    imagePreviewsDepois.innerHTML = '';
    return;
  }

  imagePreviewBar.classList.remove('hidden');
  imagePreviewsAntes.innerHTML = '';
  imagePreviewsDepois.innerHTML = '';

  const renderGroup = (files, container, type) => {
    files.forEach((file, idx) => {
      const item = document.createElement('div');
      item.className = 'preview-item';

      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.alt = file.name;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'preview-remove';
      removeBtn.innerHTML = '×';
      removeBtn.addEventListener('click', () => removeFile(idx, type));

      item.appendChild(img);
      item.appendChild(removeBtn);
      container.appendChild(item);
    });
  };

  renderGroup(antesFiles, imagePreviewsAntes, 'antes');
  renderGroup(depoisFiles, imagePreviewsDepois, 'depois');
}

// --- Send Logic ---
function updateSendButton() {
  const hasImages = antesFiles.length > 0 || depoisFiles.length > 0;
  const hasText = messageInput.value.trim().length > 0;
  btnSend.disabled = (!hasImages && !hasText) || isProcessing;
}

function autoResizeTextarea() {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
}

async function handleSend() {
  if (isProcessing) return;
  if (antesFiles.length === 0 && depoisFiles.length === 0 && !messageInput.value.trim()) return;

  const text = messageInput.value.trim();
  const imagesObj = {
    antes: [...antesFiles],
    depois: [...depoisFiles]
  };
  const allImages = [...antesFiles, ...depoisFiles];

  // Hide welcome screen
  welcomeScreen.classList.add('hidden');

  // Add user message
  addUserMessage(text, allImages);

  // Clear inputs
  messageInput.value = '';
  messageInput.style.height = 'auto';
  antesFiles = [];
  depoisFiles = [];

  // Reset paste target selector to "antes"
  const antesRadio = document.querySelector('input[name="pasteTarget"][value="antes"]');
  if (antesRadio) {
    antesRadio.checked = true;
  }

  renderPreviews();
  updateSendButton();

  // Only call AI if images are attached
  if (allImages.length > 0) {
    await processWithAI(text, imagesObj);
  } else {
    // Text-only message — just display a help hint
    addAIMessage(`<p>Para gerar o Diário de Bordo, preciso que você anexe as <strong>imagens do mapa de campanhas</strong> (antes e depois). Use o botão 📎 para anexar.</p>`);
  }
}

// --- Message Rendering ---
function addUserMessage(text, images) {
  const msg = document.createElement('div');
  msg.className = 'message message-user';
  msg.innerHTML = `
    <div class="message-avatar">👤</div>
    <div class="message-content">
      <div class="message-sender">Você</div>
      <div class="message-body">
        ${text ? `<p>${escapeHTML(text)}</p>` : ''}
        ${images.length > 0 ? `
          <div class="message-images">
            ${images.map(f => `<img src="${URL.createObjectURL(f)}" alt="${f.name}" />`).join('')}
          </div>
        ` : ''}
      </div>
    </div>
  `;
  messagesContainer.appendChild(msg);
  scrollToBottom();
}

function addAIMessage(htmlContent) {
  const msgId = 'diary-' + Date.now();
  const msg = document.createElement('div');
  msg.className = 'message message-ai';
  msg.innerHTML = `
    <div class="message-avatar">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="currentColor"/>
      </svg>
    </div>
    <div class="message-content">
      <div class="message-sender">Diário de Bordo AI</div>
      <div class="message-body">
        <div class="diary-content" id="${msgId}">${htmlContent}</div>
      </div>
      <div class="message-actions">
        <button class="btn-action btn-copy" data-target="${msgId}" title="Copiar como Rich Text">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          Copiar
        </button>
        <button class="btn-action btn-edit" data-target="${msgId}" title="Editar conteúdo">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
          Editar
        </button>
      </div>
    </div>
  `;

  messagesContainer.appendChild(msg);

  // Bind copy button
  msg.querySelector('.btn-copy').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const target = document.getElementById(btn.dataset.target);
    await copyDiaryToClipboard(target);
    btn.classList.add('copied');
    btn.querySelector('svg').outerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    const originalText = btn.childNodes[btn.childNodes.length - 1];
    originalText.textContent = ' Copiado!';
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        Copiar
      `;
    }, 2000);
  });

  // Bind edit button
  msg.querySelector('.btn-edit').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const target = document.getElementById(btn.dataset.target);
    const isEditing = target.contentEditable === 'true';

    if (isEditing) {
      target.contentEditable = 'false';
      target.style.outline = '';
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
        Editar
      `;
    } else {
      target.contentEditable = 'true';
      target.focus();
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Salvar
      `;
    }
  });

  scrollToBottom();
}

function addLoadingMessage() {
  const loader = document.createElement('div');
  loader.className = 'message message-ai';
  loader.id = 'loading-message';
  loader.innerHTML = `
    <div class="message-avatar">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="currentColor"/>
      </svg>
    </div>
    <div class="message-content">
      <div class="message-sender">Diário de Bordo AI</div>
      <div class="message-loading">
        <div class="loading-dots">
          <span></span><span></span><span></span>
        </div>
        <span>Analisando imagens...</span>
      </div>
    </div>
  `;
  messagesContainer.appendChild(loader);
  scrollToBottom();
}

function removeLoadingMessage() {
  const loader = document.getElementById('loading-message');
  if (loader) loader.remove();
}

function addErrorMessage(errorText) {
  const msg = document.createElement('div');
  msg.className = 'message message-ai';
  msg.innerHTML = `
    <div class="message-avatar">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="currentColor"/>
      </svg>
    </div>
    <div class="message-content">
      <div class="message-sender">Diário de Bordo AI</div>
      <div class="error-banner">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>${escapeHTML(errorText)}</span>
      </div>
    </div>
  `;
  messagesContainer.appendChild(msg);
  scrollToBottom();
}

// --- AI Processing ---
async function processWithAI(text, imagesObj) {
  isProcessing = true;
  updateSendButton();
  addLoadingMessage();

  try {
    const statusSpan = document.querySelector('#loading-message .message-loading span:last-child');
    const selectedModel = ACTIVE_MODEL;
    
    // Passar callback de progresso para a UI do chatbot
    const resultText = await analyzeImages(imagesObj, text, selectedModel, (msg) => {
      if (statusSpan) statusSpan.textContent = msg;
    });
    
    removeLoadingMessage();
    // Converter markdown para HTML
    const diaryHTML = markdownToHTML(resultText);
    addAIMessage(diaryHTML);
  } catch (error) {
    removeLoadingMessage();
    console.error('AI Processing Error:', error);
    addErrorMessage(
      error.message || 'Ocorreu um erro ao processar as imagens. Verifique sua API key e tente novamente.'
    );
  } finally {
    isProcessing = false;
    updateSendButton();
  }
}

// --- New Chat ---
function handleNewChat() {
  messagesContainer.innerHTML = '';
  welcomeScreen.classList.remove('hidden');
  antesFiles = [];
  depoisFiles = [];
  
  // Reset paste target selector to "antes"
  const antesRadio = document.querySelector('input[name="pasteTarget"][value="antes"]');
  if (antesRadio) {
    antesRadio.checked = true;
  }
  
  renderPreviews();
  messageInput.value = '';
  updateSendButton();
}

// --- Utils ---
function scrollToBottom() {
  requestAnimationFrame(() => {
    chatArea.scrollTop = chatArea.scrollHeight;
  });
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Conversor leve de Markdown → HTML para o output do Diário de Bordo.
 * Suporta: headings (####), bold (**), underline (<u>), listas (*), paragraphs.
 */
function markdownToHTML(md) {
  if (!md) return '<p>Nenhum conteúdo gerado.</p>';

  let thinkingHTML = '';
  let cleanMd = md;

  // Extrair tag <pensamento> ou <thinking>
  const thinkingMatch = md.match(/<(pensamento|thinking)>([\s\S]*?)<\/\1>/i);
  if (thinkingMatch) {
    const thinkingContent = thinkingMatch[2].trim();
    thinkingHTML = `
      <details class="thinking-details" style="margin-bottom: var(--space-md); border: 1px solid var(--border-default); border-radius: var(--radius-md); padding: var(--space-md); background: rgba(79, 143, 247, 0.03); border-left: 4px solid var(--accent);">
        <summary style="cursor: pointer; font-weight: 600; color: var(--text-secondary); font-size: var(--font-size-sm); outline: none; user-select: none;">
          🔍 Raciocínio de Comparação e União (Clique para expandir)
        </summary>
        <div style="margin-top: var(--space-sm); font-size: var(--font-size-sm); color: var(--text-secondary); line-height: 1.6; white-space: pre-wrap; font-family: var(--font-family);">${escapeHTML(thinkingContent)}</div>
      </details>
    `;
    cleanMd = md.replace(/<(pensamento|thinking)>[\s\S]*?<\/\1>/i, '').trim();
  }

  // Processar linhas
  const lines = cleanMd.split('\n');
  const outputLines = [];
  let inList = false;
  let listIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();

    // Heading ####
    if (trimmed.startsWith('#### ')) {
      if (inList) { outputLines.push('</ul>'); inList = false; }
      const content = trimmed.substring(5);
      outputLines.push(`<h4>${processInline(content)}</h4>`);
      continue;
    }

    // Heading ###
    if (trimmed.startsWith('### ')) {
      if (inList) { outputLines.push('</ul>'); inList = false; }
      const content = trimmed.substring(4);
      outputLines.push(`<h3>${processInline(content)}</h3>`);
      continue;
    }

    // Sub-list item (indented): starts with spaces/tabs then *
    const subMatch = trimmed.match(/^\*\s+(.*)/);
    const indentLevel = line.length - line.trimStart().length;
    if (subMatch && indentLevel >= 2) {
      if (!inList) {
        outputLines.push('<ul>');
        inList = true;
      }
      if (listIndent === 0) {
        outputLines.push('<ul>');
        listIndent = 1;
      }
      outputLines.push(`<li>${processInline(subMatch[1])}</li>`);
      continue;
    }

    // List item (top level): *   text
    if (trimmed.startsWith('* ') || trimmed.startsWith('*\t')) {
      const content = trimmed.substring(trimmed.indexOf(' ') + 1).trim();

      // Se entramos numa lista de nível superior e tínhamos sublista aberta, fechar
      if (inList && listIndent > 0) {
        outputLines.push('</ul>');
        listIndent = 0;
      }

      if (!inList) {
        outputLines.push('<ul>');
        inList = true;
        listIndent = 0;
      }
      outputLines.push(`<li>${processInline(content)}</li>`);
      continue;
    }

    // Linha em branco
    if (trimmed === '') {
      if (inList && listIndent > 0) {
        outputLines.push('</ul>');
        listIndent = 0;
      }
      if (inList) {
        outputLines.push('</ul>');
        inList = false;
      }
      continue;
    }

    // Horizontal rule
    if (trimmed === '---' || trimmed === '***' || trimmed === '* * *') {
      if (inList) { outputLines.push('</ul>'); inList = false; }
      outputLines.push('<hr>');
      continue;
    }

    // Texto normal
    if (inList && listIndent > 0) {
      outputLines.push('</ul>');
      listIndent = 0;
    }
    if (inList) {
      outputLines.push('</ul>');
      inList = false;
    }
    outputLines.push(`<p>${processInline(trimmed)}</p>`);
  }

  // Fechar listas abertas
  if (listIndent > 0) outputLines.push('</ul>');
  if (inList) outputLines.push('</ul>');

  let finalHTML = thinkingHTML + outputLines.join('\n');

  // Pós-processamento: colorir TODAS as tags [TAG] no HTML final
  // Roda por último para garantir que tags dentro de <strong> etc. sejam capturadas
  finalHTML = finalHTML.replace(/\[(?!MANUAL\b)([^\]<>]+)\]/g, (match, p1) => {
    // Ignorar se já está dentro de um span (evitar re-processar)
    // Ignorar se faz parte de atributo HTML
    const cls = getTagClass(p1);
    if (cls) {
      return `<span class="tag-highlight ${cls}">[${p1}]</span>`;
    }
    return match;
  });

  return finalHTML;
}

function getTagClass(tagName) {
  const name = tagName.toLowerCase().trim();

  // Plataformas — Azul claro
  if (name === 'meta ads' || name === 'meta' || name === 'google ads' || name === 'google') {
    return 'tag-platform';
  }

  // Verticais jurídicas — Azul forte
  if (name === 'rev-pj' || name === 'rev-pf' || name === 'rev-pj/pf' || name === 'rd' || name === 'se' || name === 'lec' || name === 'dda') {
    return 'tag-blue';
  }

  // TRAB — Laranja/Amber
  if (name === 'trab') {
    return 'tag-orange';
  }

  // FRAUDE — Vermelho/Coral
  if (name === 'fraude') {
    return 'tag-red';
  }

  // LEADS — Verde
  if (name === 'leads') {
    return 'tag-green';
  }

  // ENG / NPS — Ciano/Teal
  if (name === 'eng' || name === 'nps') {
    return 'tag-teal';
  }

  // AGRO — Amarelo/Amber
  if (name === 'agro') {
    return 'tag-yellow';
  }

  // PREV — Roxo
  if (name === 'prev') {
    return 'tag-purple';
  }

  // Branding — Rosa
  if (name === 'branding') {
    return 'tag-pink';
  }

  // Abono de Permanencia, Professores-Hor, DF, RCH
  if (name === 'abono de permanencia' || name === 'abono de permanência') {
    return 'tag-teal';
  }
  if (name.startsWith('professores') || name === 'df' || name === 'rch') {
    return 'tag-purple';
  }

  // Tags desconhecidas (AUTO, INSTA, AD, CBO, etc.) — SEM cor
  return null;
}

/**
 * Processa formatação inline: **bold**, <u>underline</u>
 */
function processInline(text) {
  // 1. Bold: **text** com classes semânticas baseadas em ações
  text = text.replace(/\*\*([^*]+)\*\*/g, (match, p1) => {
    const clean = p1.trim();
    
    // Verbos de adição/criação/aumento -> Verde (positive)
    if (/^(adicionamos|adicionado|adicionada|adicionou|iniciamos|iniciado|iniciada|iniciou|reativamos|reativado|reativada|reativou|aumentamos|aumentou|aumento|criamos|criado|criada|criou|subimos|subiu|acrescentamos)$/i.test(clean)) {
      return `<strong class="action-positive">${p1}</strong>`;
    }
    
    // Verbos de pausa/remoção/redução -> Vermelho (negative)
    if (/^(pausamos|pausado|pausada|pausou|pausa|pausar|removemos|removido|removida|removeu|diminuímos|diminuimos|diminuído|reduzimos|reduzido|reduzida|reduziu|redução|reducao)$/i.test(clean)) {
      return `<strong class="action-negative">${p1}</strong>`;
    }
    
    // Verbos de alteração genérica -> Laranja/Amarelo (neutral)
    if (/^(alteramos|alterado|alterada|alterou|alteração|alteracao|mudamos|mudou|jogamos|colocamos|negativamos|excluímos|excluimos)$/i.test(clean)) {
      return `<strong class="action-neutral">${p1}</strong>`;
    }
    
    return `<strong>${p1}</strong>`;
  });

  return text;
}

// --- Boot ---
init();
