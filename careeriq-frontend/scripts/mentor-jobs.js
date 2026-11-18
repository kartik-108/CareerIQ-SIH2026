// mentor-jobs.js — page-specific logic for pages/mentor-jobs.html
import { api, streamSSE } from './api/client.js';
import { API_BASE_URL, AI_TIMEOUT_MS, DEV_MODE } from '../config.js';
import { toast } from './toast.js';
import { getItem, setItem } from './storage.js';

function initTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  const selectTab = (btn) => {
    buttons.forEach((b) => {
      const selected = b === btn;
      b.classList.toggle('is-active', selected);
      b.setAttribute('aria-selected', String(selected));
      b.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll('.tab-panel').forEach((p) => {
      const active = p.id === `panel-${btn.dataset.tab}`;
      p.classList.toggle('is-active', active);
      p.hidden = !active;
    });
  };
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => selectTab(btn));
    btn.addEventListener('keydown', (event) => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = [...buttons].indexOf(btn);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
      selectTab(buttons[next]);
    });
  });
}

/* ---------------- Mentor tab ---------------- */

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function renderMarkdown(value) {
  if (!window.marked || !window.DOMPurify) return escapeHtml(value).replace(/\n/g, '<br>');
  const renderer = new window.marked.Renderer();
  renderer.code = ({ text, lang }) => {
    const languageInfo = String(lang || '').trim();
    const language = languageInfo.split(/\s+/)[0].replace(/[^a-z\d_-]/gi, '');
    const filenameMatch = languageInfo.match(/(?:filename|title)=(?:"([^"]+)"|'([^']+)'|(\S+))/i);
    const filename = filenameMatch?.[1] || filenameMatch?.[2] || filenameMatch?.[3] || '';
    const header = `<div class="mentor-code-header">${filename ? `<span class="mentor-code-filename">${escapeHtml(filename)}</span>` : '<span></span>'}<button class="mentor-code-copy" type="button" aria-label="Copy code" title="Copy code"><i data-lucide="copy" width="14" height="14"></i></button></div>`;
    return `<div class="mentor-code-block">${header}<pre><code${language ? ` class="language-${language}"` : ''}>${escapeHtml(text)}</code></pre></div>`;
  };
  const rendered = document.createElement('div');
  rendered.innerHTML = window.DOMPurify.sanitize(window.marked.parse(value, { gfm: true, breaks: true, renderer }));
  rendered.querySelectorAll('a').forEach((link) => {
    const url = safeSourceUrl(link.getAttribute('href'));
    if (!url) {
      link.removeAttribute('href');
      return;
    }
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  });
  return rendered.innerHTML;
}

function messageBubble(msg) {
  const isUser = msg.role === 'user';
  return `
    <article class="mentor-message ${isUser ? 'is-user' : 'is-assistant'}">
      ${!isUser ? '<div class="mentor-avatar" aria-hidden="true"><i data-lucide="sparkles" width="17" height="17"></i></div>' : ''}
      <div class="mentor-message-body">
        <div class="mentor-message-content">${isUser ? escapeHtml(msg.text).replace(/\n/g, '<br>') : renderMarkdown(msg.text)}</div>
        ${!isUser ? `<div class="mentor-assistant-extras">${sourcePills(msg.sources || [])}</div>` : ''}
      </div>
    </article>`;
}

function appendMessage(container, msg, { scroll = true } = {}) {
  const div = document.createElement('div');
  div.innerHTML = messageBubble(msg);
  container.appendChild(div.firstElementChild);
  if (scroll) container.scrollTop = container.scrollHeight;
  if (window.lucide) window.lucide.createIcons();
  if (window.hljs) div.querySelectorAll('pre code').forEach((code) => window.hljs.highlightElement(code));
}

function safeSourceUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value, window.location.href);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function sourcePills(sources = []) {
  if (!sources.length) return '';
  const seen = new Set();
  const pills = sources.flatMap((source) => {
    const label = source.title || source.file_name || source.source || 'Career source';
    const citationUrl = source.url || source.href || source.source_url || (/^https?:\/\//i.test(source.source || '') ? source.source : '');
    const url = safeSourceUrl(citationUrl);
    const key = source.document_id || url || source.id || label;
    if (seen.has(key)) return [];
    seen.add(key);
    const page = source.page_number ? ` · p.${escapeHtml(source.page_number)}` : '';
    const isDocument = Boolean(source.document_id || source.file_name || source.mime_type);
    const icon = isDocument ? 'file-text' : 'arrow-up-right';
    const href = url || '#mentor-documents';
    return [`<a class="mentor-source-pill" href="${escapeHtml(href)}" ${url ? 'target="_blank" rel="noopener noreferrer"' : ''}><i data-lucide="${icon}" width="13" height="13"></i><span>${escapeHtml(label)}${page}</span></a>`];
  });
  return pills.length ? `<section class="mentor-sources" aria-label="Sources"><span class="mentor-sources-title">Sources</span><div class="mentor-source-list">${pills.join('')}</div></section>` : '';
}

function developerInspector(debug = {}, context = {}, citations = []) {
  if (!DEV_MODE || (!debug && !context)) return '';
  const retrievalMode = debug.retrievalMode || context.retrievalMode || 'unknown';
  const provider = debug.provider || context.provider || 'unknown';
  const providerName = provider === 'ollama' ? 'Ollama' : provider;
  const model = debug.model || context.model;
  const chunks = context.documentsRetrieved ?? debug.documentsRetrieved ?? citations.length;
  const similarities = citations.map((citation) => Number(citation.similarity)).filter(Number.isFinite);
  const topSimilarity = similarities.length ? Math.max(...similarities).toFixed(3) : 'Not available';
  const chunkIds = citations.map((citation) => citation.id || citation.chunk_id).filter(Boolean);
  const fields = [
    ['Knowledge Source', debug.ragUsed === false ? 'None' : retrievalMode === 'vector' ? 'Supabase Vector RAG' : 'Career knowledge base'],
    ['Retrieved Chunks', chunks],
    ['Retrieval Mode', retrievalMode],
    ['Provider', model ? `${providerName} ${model}` : providerName],
    ['Embedding Model', debug.embeddingModel || context.embeddingModel || 'Not available'],
    ['First Token', formatDuration(debug.firstTokenMs)],
    ['Generation', formatDuration(debug.generationMs)],
    ['Similarity · Top chunk score', topSimilarity],
  ];
  return `<details class="mentor-inspector"><summary><i data-lucide="bug" width="14" height="14"></i>Developer Inspector</summary><dl class="mentor-inspector-grid">${fields.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>${chunkIds.length ? `<div class="mentor-inspector-chunks"><span>Chunk IDs</span><code>${chunkIds.map(escapeHtml).join('<br>')}</code></div>` : ''}</details>`;
}

function formatDuration(value) {
  return value != null && value !== '' && Number.isFinite(Number(value)) ? `${Math.round(Number(value))} ms` : 'Not available';
}

async function streamMentorMessage(message, conversationId, signal, handlers) {
  await streamSSE('/mentor/chat', {
    body: { message, conversationId },
    signal,
    timeout: AI_TIMEOUT_MS,
    onEvent: (type, payload) => {
      switch (type) {
        case 'token': handlers.onToken(payload.token || payload.text || ''); break;
        case 'status': handlers.onStatus(payload); break;
        case 'context': handlers.onContext(payload); break;
        case 'documents': handlers.onDocuments(payload); break;
        case 'debug': handlers.onDebug(payload.debug || payload); break;
        case 'done': handlers.onDone(payload); break;
        case 'ping': break;
        case 'error': throw new Error(payload.message || 'Mentor request failed.');
        default: break;
      }
    },
  });
}

function apiBase() {
  return API_BASE_URL;
}

function renderContextBadges(status) {
  const context = status?.context || {};
  document.getElementById('mentor-context-badges').innerHTML = [
    ['file-text', context.resumeLoaded ? 'Resume loaded' : 'Resume not loaded'],
    ['briefcase-business', context.targetRole ? context.targetRole : 'Role not set'],
    ['message-square-text', 'Interview context'],
    ['files', `Documents (${context.documents || 0})`],
  ].map(([icon, label]) => `<span class="badge ${label.includes('not') ? '' : 'badge-blue'}"><i data-lucide="${icon}" width="12" height="12"></i>${escapeHtml(label)}</span>`).join('');
}

function initMentorTab(mentorData) {
  const chatMessages = document.getElementById('chat-messages');
  let conversationId = null;
  let lastAssistant = null;
  let lastUserMessage = '';
  let activeController = null;
  let followLatest = true;
  const input = document.getElementById('chat-input');
  const sendButton = document.getElementById('chat-send');
  const characterCount = document.getElementById('mentor-char-count');
  characterCount.hidden = !DEV_MODE;

  function nearBottom() {
    return chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 80;
  }

  function scrollToLatest(force = false) {
    if (force || followLatest) chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function setSendMode(isStreaming) {
    sendButton.type = isStreaming ? 'button' : 'submit';
    sendButton.classList.toggle('is-stop', isStreaming);
    sendButton.setAttribute('aria-label', isStreaming ? 'Stop generation' : 'Send message');
    sendButton.title = isStreaming ? 'Stop generation' : 'Send message';
    sendButton.innerHTML = `<i data-lucide="${isStreaming ? 'square' : 'arrow-up'}" width="17" height="17"></i>`;
    sendButton.disabled = !isStreaming && !input.value.trim();
    if (window.lucide) window.lucide.createIcons();
  }

  function resizeInput() {
    input.style.height = 'auto';
    const styles = window.getComputedStyle(input);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 21;
    const maxHeight = lineHeight * 6 + Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
    input.style.height = `${Math.min(input.scrollHeight, maxHeight)}px`;
    input.style.overflowY = input.scrollHeight > maxHeight ? 'auto' : 'hidden';
    if (DEV_MODE) characterCount.textContent = `${input.value.length} / 8000`;
    if (!activeController) setSendMode(false);
  }

  chatMessages.addEventListener('scroll', () => { followLatest = nearBottom(); }, { passive: true });
  sendButton.addEventListener('click', (event) => {
    if (!activeController) return;
    event.preventDefault();
    activeController.abort();
  });
  setSendMode(false);
  resizeInput();

  document.getElementById('suggested-questions').innerHTML = mentorData.suggestedQuestions
    .map((q) => `<button class="badge badge-blue mentor-suggestion" data-suggested-q>${escapeHtml(q)}</button>`)
    .join('');

  function renderDocuments(documents) {
    document.getElementById('mentor-documents').innerHTML = (documents || []).map((d) => { const name = d.file_name || d.title || 'Knowledge document'; return `<li class="mentor-library-item"><span class="mentor-library-name"><i data-lucide="file-text" width="14" height="14"></i><span>${escapeHtml(name)}</span><span class="badge badge-emerald">Indexed · ${Number(d.chunk_count || 0)} chunks</span></span><button class="btn-icon" data-delete-document="${d.document_id || d.id}" aria-label="Delete ${escapeHtml(name)}"><i data-lucide="trash-2" width="13" height="13"></i></button></li>`; }).join('') || '<li class="mentor-library-empty">Upload a resume, portfolio, or career document.</li>';
    document.querySelectorAll('[data-delete-document]').forEach((button) => button.addEventListener('click', async () => { await api.request(`/mentor/documents/${button.dataset.deleteDocument}`, { method: 'DELETE' }); button.closest('li')?.remove(); toast.success('Document removed.'); }));
    if (window.lucide) window.lucide.createIcons();
  }

  function renderHistory(history) {
    document.getElementById('mentor-history').innerHTML = (history || []).map((item) => `<li class="mentor-history-item"><button data-conversation="${item.id}"><span>${escapeHtml(item.title)}</span><time>${new Date(item.created_at).toLocaleDateString()}</time></button></li>`).join('') || '<li class="mentor-library-empty">Your conversations will appear here.</li>';
    document.querySelectorAll('[data-conversation]').forEach((button) => button.addEventListener('click', async () => { const item = await api.get(`/mentor/conversation/${button.dataset.conversation}`); conversationId = item.id; chatMessages.innerHTML = ''; item.messages.forEach((message) => appendMessage(chatMessages, { role: message.role, text: message.content, sources: message.citations }, { scroll: false })); followLatest = true; scrollToLatest(true); }));
  }

  renderDocuments(mentorData.documents);
  renderHistory(mentorData.history);

  function sendMessage(text) {
    if (!text.trim()) return;
    if (activeController) return;
    renderRetrievedDocuments([]);
    lastUserMessage = text.trim();
    followLatest = true;
    appendMessage(chatMessages, { role: 'user', text: lastUserMessage, sources: [] }, { scroll: false });
    input.value = '';
    resizeInput();

    const assistant = { role: 'assistant', text: '', sources: [] };
    appendMessage(chatMessages, assistant, { scroll: false });
    scrollToLatest(true);
    lastAssistant = chatMessages.lastElementChild;
    const bubble = lastAssistant.querySelector('.mentor-message-content');
    const extras = lastAssistant.querySelector('.mentor-assistant-extras');
    let retrievedDocuments = [];
    let debugInfo = null;
    let contextInfo = {};
    let hasReceivedToken = false;
    const statusBubble = document.createElement('div');
    statusBubble.className = 'mentor-status';
    statusBubble.setAttribute('role', 'status');
    statusBubble.setAttribute('aria-live', 'polite');
    statusBubble.innerHTML = '<span class="mentor-status-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="mentor-status-text">Using knowledge base...</span>';
    const statusText = statusBubble.querySelector('.mentor-status-text');
    bubble.replaceChildren(statusBubble);
    let streamedText = null;
    const cursor = document.createElement('span');
    cursor.className = 'mentor-cursor';
    cursor.textContent = '▌';
    activeController = new AbortController();
    setSendMode(true);
    const updateInspector = () => {
      extras.innerHTML = developerInspector(debugInfo, contextInfo, assistant.sources);
      if (window.lucide) window.lucide.createIcons();
    };
    const updateStatus = (value) => {
      if (hasReceivedToken) return;
      if (!statusBubble.isConnected) bubble.replaceChildren(statusBubble);
      statusText.textContent = value;
      scrollToLatest();
    };

    streamMentorMessage(text, conversationId, activeController.signal, {
      onToken: (chunk) => {
        if (!chunk) return;
        hasReceivedToken = true;
        if (!streamedText) {
          statusBubble.remove();
          streamedText = document.createTextNode('');
          bubble.replaceChildren(streamedText, cursor);
        }
        assistant.text += chunk;
        streamedText.appendData(chunk);
        scrollToLatest();
      },
      onStatus: (status) => {
        updateStatus(status.message || status.text || status.stage || status.status || 'Working...');
      },
      onContext: (context) => {
        contextInfo = { ...contextInfo, ...context };
        const documents = Array.isArray(context.documents)
          ? context.documents
          : Array.isArray(context.retrievedDocuments) ? context.retrievedDocuments : [];
        const count = Number(context.documentsRetrieved || documents.length || 0);
        if (documents.length) {
          retrievedDocuments = documents;
          renderRetrievedDocuments(documents, count);
        } else if (count) {
          renderRetrievedDocuments([], count);
        }
        updateInspector();
      },
      onDocuments: (payload) => {
        const documents = Array.isArray(payload) ? payload : payload.documents || payload.retrievedDocuments || payload.items || [];
        retrievedDocuments = documents;
        contextInfo.documentsRetrieved = Number(payload.documentsRetrieved || documents.length || 0);
        renderRetrievedDocuments(documents, contextInfo.documentsRetrieved);
        updateInspector();
      },
      onDebug: (debug) => {
        debugInfo = debug;
        updateInspector();
      },
      onDone: (result) => {
        conversationId = result.conversationId;
        assistant.sources = result.citations || [];
        if (!assistant.text && result.answer) assistant.text = result.answer;
        bubble.innerHTML = renderMarkdown(assistant.text);
        debugInfo = result.debug || debugInfo || {};
        contextInfo.documentsRetrieved = debugInfo.documentsRetrieved || contextInfo.documentsRetrieved || assistant.sources.length;
        retrievedDocuments = assistant.sources;
        renderRetrievedDocuments(retrievedDocuments, contextInfo.documentsRetrieved);
        extras.innerHTML = `${sourcePills(assistant.sources)}${developerInspector(debugInfo, contextInfo, assistant.sources)}<div class="mentor-message-actions"><button class="mentor-action" data-copy-response type="button"><i data-lucide="copy" width="14" height="14"></i><span>Copy</span></button><button class="mentor-action" data-regenerate type="button"><i data-lucide="refresh-cw" width="14" height="14"></i><span>Regenerate</span></button></div>`;
        if (window.hljs) bubble.querySelectorAll('pre code').forEach((code) => window.hljs.highlightElement(code));
        if (window.lucide) window.lucide.createIcons();
        renderSuggestions(result.suggestions);
        scrollToLatest();
      },
    }).catch((error) => {
      statusBubble.remove();
      if (error.status === 499) {
        bubble.textContent = `${assistant.text ? `${assistant.text}\n\n` : ''}Generation cancelled.`;
        return;
      }
      const message = error.status === 408 ? 'AI generation timed out after 90 seconds.' : (error.message || 'Mentor request failed.');
      bubble.textContent = message;
      bubble.insertAdjacentHTML('beforeend', ' <button class="badge" data-retry-mentor type="button">Retry</button>');
      bubble.querySelector('[data-retry-mentor]')?.addEventListener('click', () => { lastAssistant?.remove(); sendMessage(lastUserMessage); });
      toast.error(message);
    }).finally(() => { activeController = null; setSendMode(false); });
  }

  function renderRetrievedDocuments(documents = [], count = 0) {
    const container = document.getElementById('mentor-retrieved-documents');
    container.replaceChildren();
    const seen = new Set();
    documents.forEach((item) => {
      const name = item.file_name || item.title || item.name || 'Knowledge document';
      const key = item.document_id || item.id || name;
      if (seen.has(key)) return;
      seen.add(key);
      const chip = document.createElement('span');
      chip.className = 'mentor-chip';
      chip.title = name;
      const icon = document.createElement('i');
      icon.setAttribute('data-lucide', 'file-text');
      icon.setAttribute('aria-hidden', 'true');
      chip.append(icon);
      const label = document.createElement('span');
      label.textContent = name;
      chip.append(label);
      container.append(chip);
    });
    if (!seen.size && count > 0) {
      const chip = document.createElement('span');
      chip.className = 'mentor-chip is-count';
      const icon = document.createElement('i');
      icon.setAttribute('data-lucide', 'layers-2');
      icon.setAttribute('aria-hidden', 'true');
      chip.append(icon, document.createTextNode(`${count} chunks retrieved`));
      container.append(chip);
    }
    container.hidden = container.childElementCount === 0;
    if (window.lucide) window.lucide.createIcons();
  }

  function renderSuggestions(suggestions) { document.getElementById('suggested-questions').innerHTML = (suggestions || mentorData.suggestedQuestions).map((q) => `<button class="badge badge-blue mentor-suggestion" data-suggested-q>${escapeHtml(q)}</button>`).join(''); document.querySelectorAll('[data-suggested-q]').forEach((button) => button.onclick = () => sendMessage(button.textContent)); }

  document.getElementById('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage(input.value);
  });

  input.addEventListener('input', resizeInput);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (input.value.trim() && !activeController) document.getElementById('chat-form').requestSubmit();
    }
  });
  document.getElementById('mentor-document-upload').addEventListener('change', async (event) => { const file = event.target.files[0]; if (!file) return; const status = document.getElementById('mentor-upload-status'); const upload = event.target.previousElementSibling; upload?.setAttribute('aria-busy', 'true'); status.textContent = 'Indexing...'; try { const form = new FormData(); form.append('document', file); await api.upload('/mentor/documents', form, { timeout: 180000, retries: 1 }); toast.success('Document indexed for your mentor.'); status.textContent = 'Indexed'; renderDocuments(await api.get('/mentor/documents')); } catch (error) { status.textContent = 'Indexing failed'; toast.error(error.message); } finally { upload?.removeAttribute('aria-busy'); event.target.value = ''; } });
  chatMessages.addEventListener('click', async (event) => {
    const codeCopy = event.target.closest('.mentor-code-copy');
    if (codeCopy) {
      const code = codeCopy.closest('.mentor-code-block')?.querySelector('code')?.textContent || '';
      await navigator.clipboard.writeText(code);
      codeCopy.setAttribute('aria-label', 'Code copied');
      toast.success('Code copied.');
      return;
    }
    const copy = event.target.closest('[data-copy-response]');
    if (copy) {
      await navigator.clipboard.writeText(lastAssistant?.querySelector('.mentor-message-content')?.textContent || '');
      toast.success('Response copied.');
      return;
    }
    const regenerate = event.target.closest('[data-regenerate]');
    if (regenerate && lastAssistant) sendMessage(`${lastUserMessage}\nPlease regenerate your previous answer with a clearer, more actionable version.`);
  });

  document.querySelectorAll('[data-suggested-q]').forEach((btn) => {
    btn.addEventListener('click', () => sendMessage(btn.textContent));
  });

  if (window.lucide) window.lucide.createIcons();
}

/* ---------------- Jobs tab ---------------- */

function jobCard(job, savedJobs) {
  const isSaved = savedJobs.includes(job.id);
  const salaryLabel = job.isInternship
    ? `₹${(job.salaryMin / 1000).toFixed(0)}k–₹${(job.salaryMax / 1000).toFixed(0)}k /month`
    : `₹${(job.salaryMin / 100000).toFixed(1)}L–₹${(job.salaryMax / 100000).toFixed(1)}L /year`;

  return `
    <div class="card card-hover" data-job-card="${job.id}">
      <div class="card-header">
        <div>
          <h5 style="margin-bottom:2px;">${job.title}</h5>
          <span class="text-tertiary" style="font-size: var(--text-xs);">${job.company} · ${job.location}${job.remote ? ' · Remote' : ''}</span>
        </div>
        <button class="btn-icon" data-bookmark-btn="${job.id}" aria-label="Bookmark job">
          <i data-lucide="bookmark" width="16" height="16" ${isSaved ? 'fill="currentColor"' : ''} style="color:${isSaved ? 'var(--blue)' : 'var(--text-tertiary)'}"></i>
        </button>
      </div>
      <div style="display:flex; align-items:center; gap: var(--space-3); margin-bottom: var(--space-4);">
        <div class="ring-wrap" style="width:44px;height:44px;">
          <svg width="44" height="44" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="18" fill="none" stroke="var(--surface-input)" stroke-width="5"/>
            <circle cx="22" cy="22" r="18" fill="none" stroke="var(--blue)" stroke-width="5" stroke-linecap="round"
              stroke-dasharray="${2 * Math.PI * 18}" stroke-dashoffset="${2 * Math.PI * 18 * (1 - job.matchPercentage / 100)}"
              transform="rotate(-90 22 22)"/>
          </svg>
        </div>
        <div>
          <div style="font-weight:700; font-size: var(--text-sm);">${job.matchPercentage}% match</div>
          <div class="text-tertiary" style="font-size: var(--text-xs);">${salaryLabel}</div>
        </div>
      </div>
      <div style="display:flex; flex-wrap:wrap; gap: var(--space-2); margin-bottom: var(--space-4);">
        ${job.skills.map((s) => `<span class="badge">${s}</span>`).join('')}
        ${job.isInternship ? '<span class="badge badge-purple">Internship</span>' : ''}
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="text-tertiary" style="font-size: var(--text-xs);">Posted ${job.postedDaysAgo}d ago</span>
        <button class="btn btn-primary btn-sm">View demo match</button>
      </div>
    </div>`;
}

function initJobsTab(jobsData) {
  let savedJobs = getItem('saved_jobs', jobsData.savedJobs || []);

  document.getElementById('job-location-filter').innerHTML +=
    jobsData.filters.locations.map((l) => `<option>${l}</option>`).join('');

  document.getElementById('trending-skills').innerHTML = jobsData.trendingSkills
    .map((s) => `<span class="badge badge-blue"><i data-lucide="trending-up" width="12" height="12"></i> ${s}</span>`)
    .join('');

  function render() {
    const locationFilter = document.getElementById('job-location-filter').value;
    const remoteFilter = document.getElementById('job-remote-filter').value;
    const searchFilter = document.getElementById('job-search-input').value.toLowerCase();

    const filtered = jobsData.recommendations.filter((job) => {
      if (locationFilter && !job.location.includes(locationFilter) && !(locationFilter === 'Remote' && job.remote)) return false;
      if (remoteFilter === 'remote' && !job.remote) return false;
      if (remoteFilter === 'onsite' && job.remote) return false;
      if (searchFilter && !`${job.title} ${job.company}`.toLowerCase().includes(searchFilter)) return false;
      return true;
    });

    const grid = document.getElementById('jobs-grid');
    if (!filtered.length) {
      grid.innerHTML = `<div class="state-block" style="grid-column: 1/-1;">
        <div class="state-icon"><i data-lucide="search-x"></i></div>
        <h5>No jobs match those filters</h5>
        <p>Try widening your location or work-type filters.</p>
      </div>`;
    } else {
      grid.innerHTML = filtered.map((job) => jobCard(job, savedJobs)).join('');
    }
    if (window.lucide) window.lucide.createIcons();

    document.querySelectorAll('[data-bookmark-btn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-bookmark-btn');
        const request = savedJobs.includes(id) ? api.request(`/jobs/${id}/bookmark`, { method: 'DELETE' }) : api.post(`/jobs/${id}/bookmark`, {});
        request.then(() => {
          if (savedJobs.includes(id)) { savedJobs = savedJobs.filter((j) => j !== id); toast.info('Removed from saved jobs.'); }
          else { savedJobs.push(id); toast.success('Job bookmarked.'); }
          setItem('saved_jobs', savedJobs);
          render();
        }).catch((error) => toast.error(error.message));
      });
    });

    document.querySelectorAll('[data-job-card] .btn-primary').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const job = jobsData.recommendations.find((item) => String(item.id) === btn.closest('[data-job-card]')?.dataset.jobCard);
        if (!jobsData.resumeId || !job?.description) {
          toast.info('Demo listing: application submission is not available.');
          return;
        }
        try {
          const match = await api.post('/job-match', { resume_id: jobsData.resumeId, job_id: job.id, job_description: job.description });
          toast.success(`Resume match: ${match.match_percentage || 0}%`);
        } catch (error) { toast.error(error.message); }
      });
    });
  }

  ['job-location-filter', 'job-remote-filter'].forEach((id) => document.getElementById(id).addEventListener('change', render));
  document.getElementById('job-search-input').addEventListener('input', render);

  render();
}

async function init() {
  initTabs();
  const results = await Promise.allSettled([api.get('/jobs/recommendations'), api.get('/resumes'), api.get('/mentor/status'), api.get('/mentor/conversations'), api.get('/mentor/documents')]);
  const [jobsResult, resumesResult, statusResult, historyResult, documentsResult] = results;
  const jobs = jobsResult.status === 'fulfilled' ? jobsResult.value : [];
  const resumes = resumesResult.status === 'fulfilled' ? resumesResult.value : [];
  const status = statusResult.status === 'fulfilled' ? statusResult.value : {};
  const history = historyResult.status === 'fulfilled' ? historyResult.value : [];
  const documents = documentsResult.status === 'fulfilled' ? documentsResult.value : [];
  if (results.some((result) => result.status === 'rejected')) toast.info('Some mentor data is temporarily unavailable. You can retry from this page.');
  renderContextBadges(status);
  const mentorData = { suggestedQuestions: ['Improve my resume', 'Run a mock interview', 'Find internships', 'Build a 30-day roadmap'], documents, history };
  const jobsData = { resumeId: resumes?.[0]?.id, savedJobs: getItem('saved_jobs', []), recommendations: (jobs || []).map((job) => ({ ...job, matchPercentage: job.match_percentage || job.matchPercentage || 0, isInternship: job.is_internship || job.isInternship, salaryMin: job.salary_min || job.salaryMin || 0, salaryMax: job.salary_max || job.salaryMax || 0, postedDaysAgo: job.posted_days_ago || job.postedDaysAgo || 0, skills: job.skills || [] })), filters: { locations: [] }, trendingSkills: [] };
  initMentorTab(mentorData);
  initJobsTab(jobsData);
}

document.addEventListener('DOMContentLoaded', init);
