// Debate Coach — vanilla JS, no dependencies.
// State persists per-topic in localStorage.

const TOPIC_FILE = 'topics/crows.json';
const STORAGE_KEY = 'debate-coach:crows:v1';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  topic: null,
  stakeholderNotes: {},   // { stakeholderId: text }
  savedArguments: [],     // [{ id, p, e1, e2, l, createdAt }]
  rebuttals: {}           // { oppositionId: text }
};

// --- Persistence ---------------------------------------------------------

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    state.stakeholderNotes = data.stakeholderNotes || {};
    state.savedArguments = data.savedArguments || [];
    state.rebuttals = data.rebuttals || {};
  } catch (e) {
    console.warn('Could not load saved work:', e);
  }
}

function save() {
  const data = {
    stakeholderNotes: state.stakeholderNotes,
    savedArguments: state.savedArguments,
    rebuttals: state.rebuttals
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// --- Boot ----------------------------------------------------------------

async function boot() {
  load();
  try {
    const res = await fetch(TOPIC_FILE, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.topic = await res.json();
  } catch (err) {
    document.querySelector('main').innerHTML =
      `<p style="padding:20px;background:#fee;border-radius:8px">Could not load topic file. (${err.message})</p>`;
    return;
  }

  renderStepper();
  renderMotion();
  renderFacts();
  renderStakeholders();
  renderOpposition();
  renderSavedArguments();
  renderSpeechOutline();
  renderGlossary();
  wirePeel();
  wireSpeechAndTimer();
  wireGlossaryToggle();
  wireResetAll();
  wireFlipCards();
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
  $('#motion-card').innerHTML = `
    <p class="motion-text">${state.topic.motion}</p>
    <span class="side-tag">Your side: ${state.topic.side}</span>
    <p style="margin:10px 0 0">${state.topic.sideExplainer}</p>
  `;
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
  grid.innerHTML = state.topic.facts.map((f, i) => `
    <div class="fact-card" tabindex="0" role="button" data-idx="${i}" aria-label="Reveal fact: ${escapeHtml(f.title)}">
      <p class="fact-title">${escapeHtml(f.title)}</p>
      <p class="fact-prompt">Tap to reveal</p>
      <p class="fact-body">${escapeHtml(f.body)}</p>
    </div>
  `).join('');
  grid.addEventListener('click', e => {
    const card = e.target.closest('.fact-card');
    if (card) toggleFact(card);
  });
  grid.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.fact-card');
    if (card) { e.preventDefault(); toggleFact(card); }
  });
}

function toggleFact(card) {
  card.classList.toggle('revealed');
  const prompt = card.querySelector('.fact-prompt');
  prompt.textContent = card.classList.contains('revealed') ? 'Tap to hide' : 'Tap to reveal';
}

// --- Section 3: Stakeholders --------------------------------------------

function renderStakeholders() {
  const tabs = $('#stakeholder-tabs');
  const panels = $('#stakeholder-panels');
  tabs.innerHTML = state.topic.stakeholders.map((s, i) => `
    <button class="tab-btn" role="tab"
      id="tab-${s.id}" aria-controls="panel-${s.id}"
      aria-selected="${i === 0 ? 'true' : 'false'}"
      data-stakeholder="${s.id}">
      ${s.icon} ${escapeHtml(s.title)}
    </button>
  `).join('');
  panels.innerHTML = state.topic.stakeholders.map((s, i) => `
    <div class="tab-panel" id="panel-${s.id}" role="tabpanel"
         aria-labelledby="tab-${s.id}" ${i === 0 ? '' : 'hidden'}>
      <p><strong>Starter ideas:</strong></p>
      <ul class="starter-list">
        ${s.starters.map(st => `<li>${escapeHtml(st)}</li>`).join('')}
      </ul>
      <label>
        <strong>Now write your own idea, in your own words:</strong>
        <textarea class="stakeholder-input" data-stakeholder="${s.id}"
          rows="3" placeholder="My idea about ${escapeHtml(s.title.toLowerCase())}…">${escapeHtml(state.stakeholderNotes[s.id] || '')}</textarea>
      </label>
      <p class="saved-status" data-saved-for="${s.id}"></p>
    </div>
  `).join('');

  tabs.addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    selectStakeholderTab(btn.dataset.stakeholder);
  });
  panels.addEventListener('input', e => {
    const ta = e.target.closest('textarea[data-stakeholder]');
    if (!ta) return;
    state.stakeholderNotes[ta.dataset.stakeholder] = ta.value;
    save();
    const status = panels.querySelector(`[data-saved-for="${ta.dataset.stakeholder}"]`);
    if (status) {
      status.textContent = '✓ Saved';
      clearTimeout(status._t);
      status._t = setTimeout(() => { status.textContent = ''; }, 1200);
    }
  });
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
  const kw = state.topic.linterKeywords;
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

  // 2. Evidence has a marker
  const e1lower = e1.toLowerCase();
  const hasMarker =
    /\d/.test(e1) ||
    /"[^"]+"/.test(e1) ||
    kw.evidenceMarkers.some(k => e1lower.includes(k));
  checks.push(hasMarker
    ? { ok: true, text: 'Your Evidence includes a number, place, or source — well done!' }
    : { ok: false, text: 'Strong evidence usually has a number, year, place (like Bishan or Singapore), or a source (like NEA). Can you add one?' });

  // 3. Explanation uses a connective
  const e2lower = e2.toLowerCase();
  const hasConnective = kw.explanationConnectives.some(c => e2lower.includes(c));
  checks.push(hasConnective
    ? { ok: true, text: 'Your Explanation uses a "so-what" word like "this means" or "because" — great!' }
    : { ok: false, text: 'Try starting your Explanation with "This means…", "This shows that…", or "Because…". Tell the audience why your evidence matters.' });

  // 4. Link refers to motion
  const llower = l.toLowerCase();
  const linkHits = kw.linkKeywords.filter(k => llower.includes(k));
  checks.push(linkHits.length >= 2
    ? { ok: true, text: 'Your Link refers back to the motion clearly.' }
    : { ok: false, text: 'End your Link by mentioning the motion — use words like "kill", "crows", and "Singapore".' });

  // 5. Avoid absolutes
  const allText = `${p} ${e1} ${e2} ${l}`.toLowerCase();
  const absoluteFound = kw.absolutes.find(a => new RegExp(`\\b${a}\\b`).test(allText));
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
}

function saveArgument() {
  const inputs = getPeelInputs();
  if (!inputs.p && !inputs.e1 && !inputs.e2 && !inputs.l) {
    alert('Write something in the PEEL boxes first!');
    return;
  }
  state.savedArguments.push({
    id: `arg_${Date.now()}`,
    ...inputs,
    createdAt: new Date().toISOString()
  });
  save();
  renderSavedArguments();
  renderSpeechOutline();
  setPeelInputs();
  $('#linter-output').innerHTML =
    '<div class="lint-summary all-good">💾 Saved! Scroll down to see it in your list, or build another argument.</div>';
}

function renderSavedArguments() {
  const list = $('#saved-arguments');
  if (!state.savedArguments.length) {
    list.innerHTML = '<li style="background:transparent;border:none;color:var(--ink-soft);font-style:italic">No saved arguments yet.</li>';
    return;
  }
  list.innerHTML = state.savedArguments.map((a, i) => `
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
    const arg = state.savedArguments.find(x => x.id === btn.dataset.id);
    if (!arg) return;
    if (btn.dataset.action === 'edit') {
      setPeelInputs(arg);
      state.savedArguments = state.savedArguments.filter(x => x.id !== arg.id);
      save();
      renderSavedArguments();
      renderSpeechOutline();
      $('#step-4').scrollIntoView({ behavior: 'smooth' });
    } else if (btn.dataset.action === 'delete') {
      if (confirm('Delete this argument?')) {
        state.savedArguments = state.savedArguments.filter(x => x.id !== arg.id);
        save();
        renderSavedArguments();
        renderSpeechOutline();
      }
    }
  };
}

// --- Section 5: Opposition / rebuttals ----------------------------------

function renderOpposition() {
  const root = $('#opposition-cards');
  root.innerHTML = state.topic.oppositionCards.map(o => `
    <div class="opposition-card" data-op="${o.id}">
      <h3>"${escapeHtml(o.title)}"</h3>
      <p class="opposition-claim">${escapeHtml(o.claim)}</p>
      <label>
        <strong>Your rebuttal:</strong>
        <textarea data-op-input="${o.id}" rows="3"
          placeholder="Even though they say this, I think…">${escapeHtml(state.rebuttals[o.id] || '')}</textarea>
      </label>
      <button class="ghost-btn hint-toggle" data-op-hint="${o.id}">💡 Reveal coaching hint</button>
      <div class="hint-box" hidden data-op-hintbox="${o.id}">${escapeHtml(o.hint)}</div>
    </div>
  `).join('');

  root.addEventListener('input', e => {
    const ta = e.target.closest('textarea[data-op-input]');
    if (!ta) return;
    state.rebuttals[ta.dataset.opInput] = ta.value;
    save();
    renderSpeechOutline();
  });
  root.addEventListener('click', e => {
    const btn = e.target.closest('button[data-op-hint]');
    if (!btn) return;
    const box = root.querySelector(`[data-op-hintbox="${btn.dataset.opHint}"]`);
    box.hidden = !box.hidden;
    btn.textContent = box.hidden ? '💡 Reveal coaching hint' : '💡 Hide hint';
  });
}

// --- Section 6: Speech outline + speech synth + timer -------------------

function renderSpeechOutline() {
  const root = $('#speech-outline');
  if (!state.savedArguments.length && !Object.values(state.rebuttals).some(Boolean)) {
    root.innerHTML = '<p class="muted">Save at least one PEEL argument in Step 4 to see your outline here.</p>';
    return;
  }

  const intro = `<h3>Introduction</h3>
    <p>Good morning, judges and friends. The motion today is: <strong>${escapeHtml(state.topic.motion)}</strong>. My team is the proposition, and we believe the answer is YES.</p>`;

  const args = state.savedArguments.length
    ? `<h3>My Arguments</h3>` + state.savedArguments.map((a, i) => `
        <p><strong>${i + 1}. ${escapeHtml(a.p)}</strong></p>
        <p>${escapeHtml(a.e1)}</p>
        <p>${escapeHtml(a.e2)}</p>
        <p><em>${escapeHtml(a.l)}</em></p>
      `).join('')
    : '';

  const rebuttals = Object.entries(state.rebuttals).filter(([, v]) => v && v.trim());
  const rebuttalSection = rebuttals.length
    ? `<h3>Replies to the Opposition</h3>` + rebuttals.map(([opId, text]) => {
        const card = state.topic.oppositionCards.find(c => c.id === opId);
        return `<p><strong>They might say: "${escapeHtml(card ? card.title : '')}"</strong><br>${escapeHtml(text)}</p>`;
      }).join('')
    : '';

  const conclusion = `<h3>Conclusion</h3>
    <p>For these reasons — public safety, public health, ecology, and quality of life — my team strongly believes that we SHOULD kill crows in Singapore. Thank you.</p>`;

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
  $('#glossary-list').innerHTML = state.topic.glossary
    .map(g => `<dt>${escapeHtml(g.term)}</dt><dd>${escapeHtml(g.definition)}</dd>`)
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
    if (!confirm('This will delete all your saved arguments and notes on this device. Continue?')) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });
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
