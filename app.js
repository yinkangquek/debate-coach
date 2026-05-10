// Debate Coach — multi-topic version, vanilla JS, no dependencies.
// Topics + per-topic state are persisted in localStorage.

const EXAMPLE_TOPIC_FILE = 'topics/crows.json';
const STORAGE_KEY = 'debate-coach:v2';
const LEGACY_STORAGE_KEY = 'debate-coach:crows:v1';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// State shape:
// {
//   topics: { [id]: TopicData },
//   currentTopicId: string | null,
//   perTopicState: { [topicId]: { stakeholderNotes, savedArguments, rebuttals } }
// }
//
// TopicData = {
//   id, name, motion, side ('FOR' | 'AGAINST'), sideExplainer,
//   facts: [{ title, body }],
//   stakeholders: [{ id, title, icon, starters: [text] }],
//   oppositionCards: [{ id, title, claim, hint }],
//   linterKeywords?: { evidenceMarkers, explanationConnectives, linkKeywords, absolutes },
//   glossary?: [{ term, definition }]
// }

const DEFAULT_GLOSSARY = [
  { term: "Motion", definition: "The statement being debated." },
  { term: "Proposition (For)", definition: "The team that argues YES — they agree with the motion." },
  { term: "Opposition (Against)", definition: "The team that argues NO — they disagree with the motion." },
  { term: "Argument", definition: "A reason that supports your side, with proof to back it up." },
  { term: "Evidence", definition: "Facts, examples, numbers, or sources that prove your point is true." },
  { term: "Rebuttal", definition: "Your reply to the other team's argument — explaining why they are wrong or why your point is stronger." },
  { term: "PEEL", definition: "A way to build a strong argument: Point → Evidence → Explanation → Link." },
  { term: "Stakeholder", definition: "A group of people (or animals!) affected by an issue." }
];

const DEFAULT_LINTER = {
  evidenceMarkers: [],
  explanationConnectives: ["because", "this means", "this shows", "this proves", "as a result", "therefore", "so that", "which means"],
  linkKeywords: [],
  absolutes: ["always", "never", "everyone", "nobody", "all people", "no one"]
};

// Words to ignore when auto-deriving keywords from a motion
const STOP_WORDS = new Set([
  "a","an","the","is","are","was","were","be","been","being","am",
  "do","does","did","have","has","had","will","would","should","could","can","may","might","must","shall",
  "to","of","in","on","at","by","for","with","from","about","as","into","through","during","before","after",
  "above","below","up","down","out","off","over","under","again","further","then","once",
  "and","but","or","if","because","so","than","too","very",
  "that","this","these","those","i","you","he","she","it","we","they",
  "what","which","who","whom","my","your","his","her","its","our","their",
  "any","all","some","most","more","few","no","not","nor","only","own","same",
  "here","there","when","where","why","how"
]);

const state = {
  topics: {},
  currentTopicId: null,
  perTopicState: {}
};

// --- Persistence ---------------------------------------------------------

function load() {
  // Try v2 first
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      state.topics = data.topics || {};
      state.currentTopicId = data.currentTopicId || null;
      state.perTopicState = data.perTopicState || {};
      return;
    }
  } catch (e) { console.warn('Could not load v2 state', e); }

  // Migrate from legacy crows-only storage
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw) {
      const old = JSON.parse(raw);
      // We'll seed the example topic later; for now stash legacy state to merge in
      state._legacy = old;
    }
  } catch (e) { /* ignore */ }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    topics: state.topics,
    currentTopicId: state.currentTopicId,
    perTopicState: state.perTopicState
  }));
}

// --- Topic + state helpers ----------------------------------------------

function currentTopic() { return state.topics[state.currentTopicId] || null; }

function currentState() {
  if (!state.currentTopicId) return { stakeholderNotes: {}, savedArguments: [], rebuttals: {} };
  if (!state.perTopicState[state.currentTopicId]) {
    state.perTopicState[state.currentTopicId] = { stakeholderNotes: {}, savedArguments: [], rebuttals: {} };
  }
  return state.perTopicState[state.currentTopicId];
}

function deriveLinkKeywords(motion) {
  const words = (motion || '').toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  return [...new Set(words)].slice(0, 8);
}

function defaultSideExplainer(motion, side) {
  if (side === 'FOR') {
    return `Your job is to convince the audience that the answer is YES. You need to give clear reasons, real examples, and reply to the other team's points.`;
  }
  return `Your job is to convince the audience that the answer is NO. You need to give clear reasons, real examples, and reply to the other team's points.`;
}

function newTopicId() { return `topic_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`; }

function addTopic(topicData, { switchTo = true } = {}) {
  const id = topicData.id || newTopicId();
  const topic = {
    id,
    name: topicData.name || topicData.motion || 'Untitled topic',
    motion: topicData.motion || '',
    side: topicData.side || 'FOR',
    sideExplainer: topicData.sideExplainer || defaultSideExplainer(topicData.motion, topicData.side || 'FOR'),
    facts: topicData.facts || [],
    stakeholders: (topicData.stakeholders || []).map((s, i) => ({
      id: s.id || `s_${i}_${Math.random().toString(36).slice(2,5)}`,
      title: s.title || `Angle ${i+1}`,
      icon: s.icon || '💡',
      starters: s.starters || []
    })),
    oppositionCards: (topicData.oppositionCards || []).map((o, i) => ({
      id: o.id || `o_${i}_${Math.random().toString(36).slice(2,5)}`,
      title: o.title || '',
      claim: o.claim || '',
      hint: o.hint || ''
    })),
    linterKeywords: {
      ...DEFAULT_LINTER,
      ...(topicData.linterKeywords || {}),
      linkKeywords:
        (topicData.linterKeywords && topicData.linterKeywords.linkKeywords && topicData.linterKeywords.linkKeywords.length)
          ? topicData.linterKeywords.linkKeywords
          : deriveLinkKeywords(topicData.motion || '')
    },
    glossary: topicData.glossary && topicData.glossary.length ? topicData.glossary : DEFAULT_GLOSSARY
  };
  state.topics[id] = topic;
  if (switchTo) state.currentTopicId = id;
  save();
  return topic;
}

function deleteTopic(id) {
  delete state.topics[id];
  delete state.perTopicState[id];
  if (state.currentTopicId === id) {
    state.currentTopicId = Object.keys(state.topics)[0] || null;
  }
  save();
}

function switchTopic(id) {
  if (state.topics[id]) {
    state.currentTopicId = id;
    save();
    renderEverything();
  }
}

// --- Boot ----------------------------------------------------------------

async function boot() {
  load();
  wireGlobalUI();

  // First-run: no topics yet → show welcome
  if (!Object.keys(state.topics).length) {
    showWelcome();
    return;
  }

  // Make sure currentTopicId points at something valid
  if (!state.currentTopicId || !state.topics[state.currentTopicId]) {
    state.currentTopicId = Object.keys(state.topics)[0];
    save();
  }

  renderEverything();
}

function renderEverything() {
  if (!currentTopic()) return;
  renderTopicSwitcher();
  renderStepper();
  renderMotion();
  renderFacts();
  renderStakeholders();
  renderOpposition();
  renderSavedArguments();
  renderSpeechOutline();
  renderGlossary();
  updateProgress();
}

// --- First-run welcome ---------------------------------------------------

function showWelcome() {
  $('main').innerHTML = `
    <div class="step welcome-step">
      <div class="welcome-mascot">🐦</div>
      <h2>Hi! I'm Cawie, your debate coach.</h2>
      <p class="lead">Let's set up your first debate topic. You can either try our example, or create your own from scratch.</p>
      <div class="welcome-actions">
        <button id="welcome-example" class="primary-btn big">📚 Try the example<br><span class="btn-sub">Should we kill crows in Singapore?</span></button>
        <button id="welcome-new" class="primary-btn ghost big">✨ Create my own topic</button>
      </div>
      ${state._legacy ? `<p class="muted" style="margin-top:20px">We found some saved work from before — choose the example to keep it!</p>` : ''}
    </div>
  `;
  $('#welcome-example').addEventListener('click', loadExampleTopic);
  $('#welcome-new').addEventListener('click', () => openTopicModal(null));
}

async function loadExampleTopic({ silent = false } = {}) {
  try {
    const res = await fetch(EXAMPLE_TOPIC_FILE, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const topic = addTopic({ ...data, name: data.motion });
    // Migrate legacy state into this topic if present
    if (state._legacy) {
      state.perTopicState[topic.id] = {
        stakeholderNotes: state._legacy.stakeholderNotes || {},
        savedArguments: state._legacy.savedArguments || [],
        rebuttals: state._legacy.rebuttals || {}
      };
      delete state._legacy;
      save();
    }
    if (!silent) {
      celebrate();
      showMascotTip("Example loaded! Read each step to see how a debate is built.", 4500);
    }
    renderEverything();
  } catch (err) {
    alert(`Could not load the example topic: ${err.message}`);
  }
}

// --- Topic modal (create / edit) ----------------------------------------

let modalDraft = null;  // working copy of topic during edit

function openTopicModal(topicId) {
  const isNew = !topicId;
  const source = isNew
    ? { motion: '', side: 'FOR', facts: [], stakeholders: [], oppositionCards: [] }
    : JSON.parse(JSON.stringify(state.topics[topicId]));
  modalDraft = source;

  const modal = $('#topic-modal');
  $('#modal-title').textContent = isNew ? '✨ Create a debate topic' : '✏️ Edit topic';
  $('#t-motion').value = source.motion || '';
  $('#t-side-for').checked = source.side !== 'AGAINST';
  $('#t-side-against').checked = source.side === 'AGAINST';

  renderModalLists();

  $('#t-save').dataset.editingId = isNew ? '' : topicId;
  modal.hidden = false;
  $('#t-motion').focus();
}

function closeTopicModal() {
  $('#topic-modal').hidden = true;
  modalDraft = null;
}

function renderModalLists() {
  const factsRoot = $('#t-facts-list');
  factsRoot.innerHTML = (modalDraft.facts || []).map((f, i) => `
    <div class="dyn-row">
      <input type="text" class="dyn-input" placeholder="Title (e.g. Why is this an issue?)" value="${escapeHtml(f.title)}" data-section="facts" data-i="${i}" data-key="title">
      <textarea class="dyn-input" rows="2" placeholder="Write the fact in your own words…" data-section="facts" data-i="${i}" data-key="body">${escapeHtml(f.body)}</textarea>
      <button class="dyn-remove" data-section="facts" data-i="${i}" aria-label="Remove">✕</button>
    </div>
  `).join('');

  const stakeRoot = $('#t-stakeholders-list');
  stakeRoot.innerHTML = (modalDraft.stakeholders || []).map((s, i) => `
    <div class="dyn-row">
      <div class="dyn-row-head">
        <input type="text" class="dyn-input dyn-icon" placeholder="🛡" maxlength="2" value="${escapeHtml(s.icon || '')}" data-section="stakeholders" data-i="${i}" data-key="icon">
        <input type="text" class="dyn-input" placeholder="Angle (e.g. Public Safety)" value="${escapeHtml(s.title)}" data-section="stakeholders" data-i="${i}" data-key="title">
      </div>
      <textarea class="dyn-input" rows="2" placeholder="Starter ideas, one per line" data-section="stakeholders" data-i="${i}" data-key="starters">${escapeHtml((s.starters || []).join('\n'))}</textarea>
      <button class="dyn-remove" data-section="stakeholders" data-i="${i}" aria-label="Remove">✕</button>
    </div>
  `).join('');

  const oppRoot = $('#t-opposition-list');
  oppRoot.innerHTML = (modalDraft.oppositionCards || []).map((o, i) => `
    <div class="dyn-row">
      <input type="text" class="dyn-input" placeholder="Short name (e.g. Animal welfare)" value="${escapeHtml(o.title)}" data-section="oppositionCards" data-i="${i}" data-key="title">
      <textarea class="dyn-input" rows="2" placeholder="What might the other team say?" data-section="oppositionCards" data-i="${i}" data-key="claim">${escapeHtml(o.claim)}</textarea>
      <textarea class="dyn-input" rows="2" placeholder="Coaching hint (a nudge, not the answer)" data-section="oppositionCards" data-i="${i}" data-key="hint">${escapeHtml(o.hint)}</textarea>
      <button class="dyn-remove" data-section="oppositionCards" data-i="${i}" aria-label="Remove">✕</button>
    </div>
  `).join('');
}

function wireModal() {
  $('#modal-close').addEventListener('click', closeTopicModal);
  $('#t-cancel').addEventListener('click', closeTopicModal);
  $('#topic-modal').addEventListener('click', e => {
    if (e.target.id === 'topic-modal') closeTopicModal();
  });

  $('#t-add-fact').addEventListener('click', () => {
    modalDraft.facts.push({ title: '', body: '' });
    renderModalLists();
  });
  $('#t-add-stakeholder').addEventListener('click', () => {
    modalDraft.stakeholders.push({ title: '', icon: '💡', starters: [] });
    renderModalLists();
  });
  $('#t-add-opposition').addEventListener('click', () => {
    modalDraft.oppositionCards.push({ title: '', claim: '', hint: '' });
    renderModalLists();
  });

  // Live edits + remove
  ['t-facts-list', 't-stakeholders-list', 't-opposition-list'].forEach(rootId => {
    const root = $('#' + rootId);
    root.addEventListener('input', e => {
      const el = e.target.closest('[data-section]');
      if (!el) return;
      const section = el.dataset.section;
      const i = parseInt(el.dataset.i, 10);
      const key = el.dataset.key;
      const value = el.value;
      if (section === 'stakeholders' && key === 'starters') {
        modalDraft[section][i][key] = value.split('\n').map(s => s.trim()).filter(Boolean);
      } else {
        modalDraft[section][i][key] = value;
      }
    });
    root.addEventListener('click', e => {
      const btn = e.target.closest('.dyn-remove');
      if (!btn) return;
      const section = btn.dataset.section;
      const i = parseInt(btn.dataset.i, 10);
      modalDraft[section].splice(i, 1);
      renderModalLists();
    });
  });

  $('#t-save').addEventListener('click', () => {
    const motion = $('#t-motion').value.trim();
    if (!motion) {
      alert('Please type the motion (the question being debated).');
      $('#t-motion').focus();
      return;
    }
    const side = $('#t-side-against').checked ? 'AGAINST' : 'FOR';
    const editingId = $('#t-save').dataset.editingId;

    const topicData = {
      ...(editingId ? { id: editingId } : {}),
      motion,
      name: motion,
      side,
      sideExplainer: defaultSideExplainer(motion, side),
      facts: modalDraft.facts.filter(f => f.title || f.body),
      stakeholders: modalDraft.stakeholders.filter(s => s.title),
      oppositionCards: modalDraft.oppositionCards.filter(o => o.title || o.claim)
    };

    if (editingId) {
      // Update in place, preserve glossary + custom linter
      const existing = state.topics[editingId];
      state.topics[editingId] = {
        ...existing,
        ...topicData,
        linterKeywords: {
          ...DEFAULT_LINTER,
          ...(existing.linterKeywords || {}),
          linkKeywords: deriveLinkKeywords(motion)
        }
      };
      save();
    } else {
      addTopic(topicData);
    }

    closeTopicModal();
    renderEverything();
    celebrate();
    showMascotTip(editingId ? "Topic updated! ✨" : "Topic created! Time to start building arguments. 🚀", 4500);
  });
}

// --- Topic switcher ------------------------------------------------------

function renderTopicSwitcher() {
  const t = currentTopic();
  $('#current-topic-name').textContent = t ? t.name : '—';
  // Build menu list
  const list = $('#topic-list');
  list.innerHTML = Object.values(state.topics).map(topic => `
    <li class="${topic.id === state.currentTopicId ? 'active' : ''}">
      <button class="topic-pick" data-id="${topic.id}">
        <span class="topic-pick-name">${escapeHtml(topic.name)}</span>
        <span class="topic-pick-side">${topic.side}</span>
      </button>
      <button class="topic-del" data-id="${topic.id}" aria-label="Delete topic" title="Delete topic">🗑</button>
    </li>
  `).join('');
}

function wireTopicSwitcher() {
  const btn = $('#topic-name-btn');
  const menu = $('#topic-menu');
  btn.addEventListener('click', e => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  document.addEventListener('click', e => {
    if (!menu.contains(e.target) && e.target !== btn) menu.hidden = true;
  });

  $('#topic-list').addEventListener('click', e => {
    const pick = e.target.closest('.topic-pick');
    const del = e.target.closest('.topic-del');
    if (pick) {
      switchTopic(pick.dataset.id);
      menu.hidden = true;
    } else if (del) {
      const t = state.topics[del.dataset.id];
      if (!t) return;
      if (confirm(`Delete topic "${t.name}" and all its saved work?`)) {
        deleteTopic(del.dataset.id);
        if (!Object.keys(state.topics).length) {
          location.reload();
        } else {
          renderEverything();
        }
      }
    }
  });

  $('#new-topic-btn').addEventListener('click', () => {
    menu.hidden = true;
    openTopicModal(null);
  });
  $('#edit-topic-btn').addEventListener('click', () => {
    menu.hidden = true;
    if (state.currentTopicId) openTopicModal(state.currentTopicId);
  });
  $('#load-example-btn').addEventListener('click', () => {
    menu.hidden = true;
    if (Object.values(state.topics).some(t => t.name === 'Should we kill crows in Singapore?')) {
      if (!confirm('You already have the example topic. Load another copy?')) return;
    }
    loadExampleTopic();
  });
}

// --- Stepper -------------------------------------------------------------

function renderStepper() {
  const items = [
    ['#step-1', '1 · Motion'],
    ['#step-2', '2 · Issue'],
    ['#step-3', '3 · Brainstorm'],
    ['#step-4', '4 · PEEL'],
    ['#step-5', '5 · Rebuttal'],
    ['#step-6', '6 · Practice']
  ];
  $('#stepper-list').innerHTML = items
    .map(([href, label]) => `<li><a href="${href}">${label}</a></li>`)
    .join('');
}

// --- Section 1: Motion ---------------------------------------------------

function renderMotion() {
  const t = currentTopic();
  const sideLabel = t.side === 'FOR' ? 'FOR (Proposition)' : 'AGAINST (Opposition)';
  $('#motion-card').innerHTML = `
    <p class="motion-text">${escapeHtml(t.motion)}</p>
    <span class="side-tag">Your side: ${sideLabel}</span>
    <p style="margin:10px 0 0">${escapeHtml(t.sideExplainer || '')}</p>
  `;
  // Update flip-card labels based on which side she's on
  const props = $$('.flip-front.prop p, .flip-back.prop p');
  if (t.side === 'AGAINST') {
    // Just swap visual emphasis: the opposition card is "her team" now
    document.querySelectorAll('.flip-card').forEach(card => card.classList.remove('flipped'));
  }
}

function wireFlipCards() {
  $$('.flip-card').forEach(card => {
    const flip = () => card.classList.toggle('flipped');
    card.addEventListener('click', flip);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
    });
  });
}

// --- Section 2: Facts ----------------------------------------------------

function renderFacts() {
  const grid = $('#facts-grid');
  const facts = currentTopic().facts || [];
  if (!facts.length) {
    grid.innerHTML = `<div class="empty-section">
      <p>No facts yet. Click <button class="link-btn inline-edit">✏️ Edit topic</button> to add some — or research them as you go!</p>
    </div>`;
    grid.querySelector('.inline-edit')?.addEventListener('click', () => openTopicModal(state.currentTopicId));
  } else {
    grid.innerHTML = facts.map((f, i) => `
      <div class="fact-card" tabindex="0" role="button" data-idx="${i}" aria-label="Reveal fact: ${escapeHtml(f.title)}">
        <p class="fact-title">${escapeHtml(f.title)}</p>
        <p class="fact-prompt">Tap to reveal</p>
        <p class="fact-body">${escapeHtml(f.body)}</p>
      </div>
    `).join('');
  }
  grid.onclick = e => {
    const card = e.target.closest('.fact-card');
    if (card) toggleFact(card);
  };
  grid.onkeydown = e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.fact-card');
    if (card) { e.preventDefault(); toggleFact(card); }
  };
}

function toggleFact(card) {
  card.classList.toggle('revealed');
  const prompt = card.querySelector('.fact-prompt');
  prompt.textContent = card.classList.contains('revealed') ? 'Tap to hide' : 'Tap to reveal';
  updateProgress();
}

// --- Section 3: Stakeholders --------------------------------------------

function renderStakeholders() {
  const tabs = $('#stakeholder-tabs');
  const panels = $('#stakeholder-panels');
  const stakeholders = currentTopic().stakeholders || [];
  const notes = currentState().stakeholderNotes;

  if (!stakeholders.length) {
    tabs.innerHTML = '';
    panels.innerHTML = `<div class="empty-section">
      <p>No angles yet. Click <button class="link-btn inline-edit">✏️ Edit topic</button> to add stakeholder angles!</p>
    </div>`;
    panels.querySelector('.inline-edit')?.addEventListener('click', () => openTopicModal(state.currentTopicId));
    return;
  }

  tabs.innerHTML = stakeholders.map((s, i) => `
    <button class="tab-btn" role="tab"
      id="tab-${s.id}" aria-controls="panel-${s.id}"
      aria-selected="${i === 0 ? 'true' : 'false'}"
      data-stakeholder="${s.id}">
      ${escapeHtml(s.icon || '💡')} ${escapeHtml(s.title)}
    </button>
  `).join('');

  panels.innerHTML = stakeholders.map((s, i) => `
    <div class="tab-panel" id="panel-${s.id}" role="tabpanel"
         aria-labelledby="tab-${s.id}" ${i === 0 ? '' : 'hidden'}>
      ${(s.starters && s.starters.length) ? `
        <p><strong>Starter ideas:</strong></p>
        <ul class="starter-list">
          ${s.starters.map(st => `<li>${escapeHtml(st)}</li>`).join('')}
        </ul>
      ` : ''}
      <label>
        <strong>Now write your own idea, in your own words:</strong>
        <textarea class="stakeholder-input" data-stakeholder="${s.id}"
          rows="3" placeholder="My idea about ${escapeHtml((s.title || 'this angle').toLowerCase())}…">${escapeHtml(notes[s.id] || '')}</textarea>
      </label>
      <p class="saved-status" data-saved-for="${s.id}"></p>
    </div>
  `).join('');

  tabs.onclick = e => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    selectStakeholderTab(btn.dataset.stakeholder);
  };
  panels.oninput = e => {
    const ta = e.target.closest('textarea[data-stakeholder]');
    if (!ta) return;
    currentState().stakeholderNotes[ta.dataset.stakeholder] = ta.value;
    save();
    updateProgress();
    const status = panels.querySelector(`[data-saved-for="${ta.dataset.stakeholder}"]`);
    if (status) {
      status.textContent = '✓ Saved';
      clearTimeout(status._t);
      status._t = setTimeout(() => { status.textContent = ''; }, 1200);
    }
  };
}

function selectStakeholderTab(id) {
  $$('#stakeholder-tabs .tab-btn').forEach(b =>
    b.setAttribute('aria-selected', b.dataset.stakeholder === id ? 'true' : 'false')
  );
  $$('#stakeholder-panels .tab-panel').forEach(p => {
    p.hidden = p.id !== `panel-${id}`;
  });
}

// --- Section 4: PEEL builder + linter -----------------------------------

function wirePeel() {
  $('#check-argument').addEventListener('click', runLinter);
  $('#save-argument').addEventListener('click', saveArgument);
  $('#clear-argument').addEventListener('click', clearArgument);
}

function getPeelInputs() {
  return {
    p: $('#peel-p').value.trim(),
    e1: $('#peel-e1').value.trim(),
    e2: $('#peel-e2').value.trim(),
    l: $('#peel-l').value.trim()
  };
}

function setPeelInputs({ p = '', e1 = '', e2 = '', l = '' } = {}) {
  $('#peel-p').value = p;
  $('#peel-e1').value = e1;
  $('#peel-e2').value = e2;
  $('#peel-l').value = l;
}

function clearArgument() {
  setPeelInputs();
  $('#linter-output').innerHTML = '';
}

function runLinter() {
  const { p, e1, e2, l } = getPeelInputs();
  const t = currentTopic();
  const kw = t.linterKeywords || DEFAULT_LINTER;
  const checks = [];

  // 1. All four boxes have content
  const minWords = 5;
  const wc = s => s.split(/\s+/).filter(Boolean).length;
  const empties = [];
  if (wc(p) < minWords) empties.push('Point');
  if (wc(e1) < minWords) empties.push('Evidence');
  if (wc(e2) < minWords) empties.push('Explanation');
  if (wc(l) < minWords) empties.push('Link');
  if (empties.length) {
    checks.push({ ok: false, text: `Try writing more in: ${empties.join(', ')}. Each box should be at least one full sentence.` });
  } else {
    checks.push({ ok: true, text: 'You have written something in all four PEEL boxes.' });
  }

  // 2. Evidence has a marker (digit, quote, or topic-specific keyword)
  const e1lower = e1.toLowerCase();
  const hasMarker =
    /\d/.test(e1) ||
    /"[^"]+"/.test(e1) ||
    (kw.evidenceMarkers || []).some(k => e1lower.includes(k.toLowerCase()));
  checks.push(hasMarker
    ? { ok: true, text: 'Your Evidence includes a number, place, or source — well done!' }
    : { ok: false, text: 'Strong evidence usually has a number, year, place, or a source. Can you add one?' });

  // 3. Explanation uses a connective
  const e2lower = e2.toLowerCase();
  const hasConnective = (kw.explanationConnectives || []).some(c => e2lower.includes(c));
  checks.push(hasConnective
    ? { ok: true, text: 'Your Explanation uses a "so-what" word like "this means" or "because" — great!' }
    : { ok: false, text: 'Try starting your Explanation with "This means…", "This shows that…", or "Because…". Tell the audience why your evidence matters.' });

  // 4. Link refers to motion (use auto-derived keywords)
  const llower = l.toLowerCase();
  const linkHits = (kw.linkKeywords || []).filter(k => llower.includes(k));
  const minLinkHits = Math.min(2, Math.max(1, (kw.linkKeywords || []).length));
  checks.push(linkHits.length >= minLinkHits
    ? { ok: true, text: 'Your Link refers back to the motion clearly.' }
    : { ok: false, text: `End your Link by mentioning the motion — use words like "${(kw.linkKeywords || []).slice(0,3).join('", "')}".` });

  // 5. Avoid absolutes
  const allText = `${p} ${e1} ${e2} ${l}`.toLowerCase();
  const absoluteFound = (kw.absolutes || []).find(a => new RegExp(`\\b${a}\\b`).test(allText));
  checks.push(absoluteFound
    ? { ok: false, text: `You used the word "${absoluteFound}" — that is a strong word. Could you say "most" or "many" instead? It makes your argument harder to attack.` }
    : { ok: true, text: 'You avoided over-strong words like "always" or "never" — your argument is balanced.' });

  // Render
  const out = $('#linter-output');
  const goodCount = checks.filter(c => c.ok).length;
  out.innerHTML = checks.map(c => `
    <div class="lint-item ${c.ok ? 'good' : 'warn'}">
      <span class="lint-icon">${c.ok ? '✅' : '⚠️'}</span>
      <span>${escapeHtml(c.text)}</span>
    </div>
  `).join('') + `
    <div class="lint-summary ${goodCount === checks.length ? 'all-good' : 'has-warn'}">
      ${goodCount === checks.length
        ? '🎉 Excellent! Your argument is strong on all 5 checks.'
        : `${goodCount} of ${checks.length} checks passed. Try the suggestions above and check again!`}
    </div>
  `;

  if (goodCount === checks.length) {
    celebrate();
    showMascotTip("Wow — all 5 checks passed! Save this argument before you forget! 💾", 5000);
  }
}

function saveArgument() {
  const inputs = getPeelInputs();
  if (!inputs.p && !inputs.e1 && !inputs.e2 && !inputs.l) {
    alert('Write something in the PEEL boxes first!');
    return;
  }
  currentState().savedArguments.push({
    id: `arg_${Date.now()}`,
    ...inputs,
    createdAt: new Date().toISOString()
  });
  save();
  renderSavedArguments();
  renderSpeechOutline();
  updateProgress();
  setPeelInputs();
  $('#linter-output').innerHTML =
    '<div class="lint-summary all-good">💾 Saved! Scroll down to see it in your list, or build another argument.</div>';
  celebrate();
  showMascotTip(`Awesome! That's argument #${currentState().savedArguments.length} saved. Keep building! 🌟`, 4000);
}

function renderSavedArguments() {
  const list = $('#saved-arguments');
  const args = currentState().savedArguments;
  if (!args.length) {
    list.innerHTML = '<li class="empty">No saved arguments yet — build one above! 👆</li>';
    return;
  }
  list.innerHTML = args.map((a, i) => `
    <li>
      <div class="saved-text">
        <strong>Argument ${i + 1}: ${escapeHtml(truncate(a.p, 80))}</strong>
        <span style="color:var(--ink-soft);font-size:0.88rem">
          ${escapeHtml(truncate(a.e1, 60))}
        </span>
      </div>
      <button data-action="edit" data-id="${a.id}" title="Edit">✏️</button>
      <button data-action="delete" data-id="${a.id}" title="Delete">🗑</button>
    </li>
  `).join('');
  list.onclick = e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const arr = currentState().savedArguments;
    const arg = arr.find(x => x.id === btn.dataset.id);
    if (!arg) return;
    if (btn.dataset.action === 'edit') {
      setPeelInputs(arg);
      currentState().savedArguments = arr.filter(x => x.id !== arg.id);
      save();
      renderSavedArguments();
      renderSpeechOutline();
      updateProgress();
      $('#step-4').scrollIntoView({ behavior: 'smooth' });
    } else if (btn.dataset.action === 'delete') {
      if (confirm('Delete this argument?')) {
        currentState().savedArguments = arr.filter(x => x.id !== arg.id);
        save();
        renderSavedArguments();
        renderSpeechOutline();
        updateProgress();
      }
    }
  };
}

// --- Section 5: Opposition / rebuttals ----------------------------------

function renderOpposition() {
  const root = $('#opposition-cards');
  const cards = currentTopic().oppositionCards || [];
  const rebuttals = currentState().rebuttals;
  if (!cards.length) {
    root.innerHTML = `<div class="empty-section">
      <p>No opposition counter-arguments yet. Click <button class="link-btn inline-edit">✏️ Edit topic</button> to add some!</p>
    </div>`;
    root.querySelector('.inline-edit')?.addEventListener('click', () => openTopicModal(state.currentTopicId));
    return;
  }
  root.innerHTML = cards.map(o => `
    <div class="opposition-card" data-op="${o.id}">
      <h3>"${escapeHtml(o.title)}"</h3>
      ${o.claim ? `<p class="opposition-claim">${escapeHtml(o.claim)}</p>` : ''}
      <label>
        <strong>Your rebuttal:</strong>
        <textarea data-op-input="${o.id}" rows="3"
          placeholder="Even though they say this, I think…">${escapeHtml(rebuttals[o.id] || '')}</textarea>
      </label>
      ${o.hint ? `
        <button class="ghost-btn hint-toggle" data-op-hint="${o.id}">💡 Reveal coaching hint</button>
        <div class="hint-box" hidden data-op-hintbox="${o.id}">${escapeHtml(o.hint)}</div>
      ` : ''}
    </div>
  `).join('');

  root.oninput = e => {
    const ta = e.target.closest('textarea[data-op-input]');
    if (!ta) return;
    currentState().rebuttals[ta.dataset.opInput] = ta.value;
    save();
    renderSpeechOutline();
    updateProgress();
  };
  root.onclick = e => {
    const btn = e.target.closest('button[data-op-hint]');
    if (!btn) return;
    const box = root.querySelector(`[data-op-hintbox="${btn.dataset.opHint}"]`);
    box.hidden = !box.hidden;
    btn.textContent = box.hidden ? '💡 Reveal coaching hint' : '💡 Hide hint';
  };
}

// --- Section 6: Speech outline + speech synth + timer -------------------

function renderSpeechOutline() {
  const root = $('#speech-outline');
  const t = currentTopic();
  const cs = currentState();
  const yes = t.side === 'FOR' ? 'YES' : 'NO';
  const sideLabel = t.side === 'FOR' ? 'proposition' : 'opposition';

  if (!cs.savedArguments.length && !Object.values(cs.rebuttals).some(Boolean)) {
    root.innerHTML = '<p class="muted">Save at least one PEEL argument in Step 4 to see your outline here.</p>';
    return;
  }

  const intro = `<h3>Introduction</h3>
    <p>Good morning, judges and friends. The motion today is: <strong>${escapeHtml(t.motion)}</strong>. My team is the ${sideLabel}, and we believe the answer is ${yes}.</p>`;

  const args = cs.savedArguments.length
    ? `<h3>My Arguments</h3>` + cs.savedArguments.map((a, i) => `
        <p><strong>${i + 1}. ${escapeHtml(a.p)}</strong></p>
        <p>${escapeHtml(a.e1)}</p>
        <p>${escapeHtml(a.e2)}</p>
        <p><em>${escapeHtml(a.l)}</em></p>
      `).join('')
    : '';

  const reb = Object.entries(cs.rebuttals).filter(([, v]) => v && v.trim());
  const rebuttalSection = reb.length
    ? `<h3>Replies to the Opposition</h3>` + reb.map(([opId, text]) => {
        const card = (t.oppositionCards || []).find(c => c.id === opId);
        return `<p><strong>They might say: "${escapeHtml(card ? card.title : '')}"</strong><br>${escapeHtml(text)}</p>`;
      }).join('')
    : '';

  const conclusion = `<h3>Conclusion</h3>
    <p>For these reasons, my team strongly believes that the answer to "${escapeHtml(t.motion)}" is ${yes}. Thank you.</p>`;

  root.innerHTML = intro + args + rebuttalSection + conclusion;
}

function getSpeechText() {
  return $('#speech-outline').innerText;
}

function wireSpeechAndTimer() {
  // Speech synthesis
  const speakBtn = $('#speak-btn');
  const stopBtn = $('#stop-speak-btn');
  if (!('speechSynthesis' in window)) {
    speakBtn.disabled = true;
    speakBtn.title = 'Your browser does not support read-aloud.';
  }
  speakBtn.addEventListener('click', () => {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const text = getSpeechText();
    if (!text.trim()) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.pitch = 1.0;
    speechSynthesis.speak(u);
  });
  stopBtn.addEventListener('click', () => {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  });

  // Print
  $('#print-btn').addEventListener('click', () => window.print());

  // Timer
  let timerInterval = null;
  const display = $('#timer-display');
  const timerBtns = $$('.timer-btn');
  timerBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      timerBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      startTimer(parseInt(btn.dataset.seconds, 10));
    });
  });
  $('#timer-stop').addEventListener('click', resetTimer);

  function startTimer(target) {
    resetTimer();
    const start = Date.now();
    display.classList.remove('warning', 'over');
    timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const remaining = target - elapsed;
      if (remaining <= 0) {
        const over = Math.abs(remaining);
        display.textContent = `+${formatTime(over)}`;
        display.classList.add('over');
        return;
      }
      display.textContent = formatTime(remaining);
      if (remaining <= 10) display.classList.add('warning');
    }, 250);
    display.textContent = formatTime(target);
  }
  function resetTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    display.textContent = '00:00';
    display.classList.remove('warning', 'over');
    timerBtns.forEach(b => b.classList.remove('active'));
  }
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// --- Glossary ------------------------------------------------------------

function renderGlossary() {
  const g = (currentTopic() && currentTopic().glossary) ? currentTopic().glossary : DEFAULT_GLOSSARY;
  $('#glossary-list').innerHTML = g
    .map(item => `<dt>${escapeHtml(item.term)}</dt><dd>${escapeHtml(item.definition)}</dd>`)
    .join('');
}

function wireGlossaryToggle() {
  const btn = $('#glossary-toggle');
  const panel = $('#glossary');
  btn.addEventListener('click', () => {
    const open = !panel.hidden;
    panel.hidden = open;
    btn.setAttribute('aria-expanded', String(!open));
  });
}

// --- Reset ---------------------------------------------------------------

function wireResetAll() {
  $('#reset-all').addEventListener('click', () => {
    if (!confirm('This will delete ALL your topics and saved work on this device. Continue?')) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    location.reload();
  });
}

// --- Progress + mascot tips ---------------------------------------------

function updateProgress() {
  if (!currentTopic()) return;
  const t = currentTopic();
  const cs = currentState();
  const factsRevealed = document.querySelectorAll('.fact-card.revealed').length;
  const totalFacts = t.facts ? t.facts.length : 0;
  const stakeholderCount = Object.values(cs.stakeholderNotes).filter(v => v && v.trim().length > 5).length;
  const argCount = cs.savedArguments.length;
  const rebuttalCount = Object.values(cs.rebuttals).filter(v => v && v.trim().length > 5).length;

  // For sections with no source content, count as "n/a" (true) so missing data doesn't block progress
  const stepsDone = [
    true,
    totalFacts === 0 ? true : factsRevealed >= Math.min(3, totalFacts),
    (t.stakeholders && t.stakeholders.length) ? stakeholderCount >= 1 : true,
    argCount >= 1,
    (t.oppositionCards && t.oppositionCards.length) ? rebuttalCount >= 1 : true,
    argCount >= 2
  ];

  const total = stepsDone.length;
  const done = stepsDone.filter(Boolean).length;
  const pct = Math.round((done / total) * 100);

  const fill = $('#progress-fill');
  const label = $('#progress-label');
  if (fill) fill.style.width = `${pct}%`;
  if (label) label.textContent = `${pct}% adventure complete`;
  $('.progress-track')?.setAttribute('aria-valuenow', String(pct));

  document.querySelectorAll('.step').forEach(sec => {
    const idx = parseInt(sec.dataset.step, 10) - 1;
    sec.classList.toggle('done', !!stepsDone[idx]);
  });
  document.querySelectorAll('#stepper-list a').forEach((a, i) => {
    a.classList.toggle('done', !!stepsDone[i]);
  });

  const fp = $('#facts-progress');
  if (fp) fp.textContent = totalFacts ? `${factsRevealed} of ${totalFacts} facts revealed` : '';
}

let mascotTimer = null;
function showMascotTip(text, durationMs = 4500) {
  const tip = $('#mascot-tip');
  const txt = $('#mascot-tip-text');
  if (!tip || !txt) return;
  txt.textContent = text;
  tip.hidden = false;
  clearTimeout(mascotTimer);
  if (durationMs > 0) {
    mascotTimer = setTimeout(() => { tip.hidden = true; }, durationMs);
  }
}

function wireMascotTip() {
  $('#mascot-close')?.addEventListener('click', () => {
    $('#mascot-tip').hidden = true;
    clearTimeout(mascotTimer);
  });
}

// --- Confetti -----------------------------------------------------------

function celebrate() {
  const colors = ['#7c3aed', '#ec4899', '#fb7185', '#fbbf24', '#34d399', '#38bdf8'];
  const container = $('#confetti');
  if (!container) return;
  for (let i = 0; i < 60; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = `${2 + Math.random() * 2}s`;
    piece.style.animationDelay = `${Math.random() * 0.4}s`;
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    piece.style.width = `${6 + Math.random() * 8}px`;
    piece.style.height = `${10 + Math.random() * 10}px`;
    container.appendChild(piece);
    setTimeout(() => piece.remove(), 4500);
  }
}

// --- Wire global UI once -------------------------------------------------

function wireGlobalUI() {
  wirePeel();
  wireSpeechAndTimer();
  wireGlossaryToggle();
  wireResetAll();
  wireFlipCards();
  wireMascotTip();
  wireTopicSwitcher();
  wireModal();
}

// --- Helpers -------------------------------------------------------------

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function truncate(s, n) {
  s = s || '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

document.addEventListener('DOMContentLoaded', boot);
