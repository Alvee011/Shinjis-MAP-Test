// ===== SHINJI'S MAP TEST - APPLICATION LOGIC =====

// ── State ──
let state = {
  selectedTime: 15, // minutes
  currentQuestionIndex: 0,
  questions: [],          // current test queue
  answers: [],            // { questionId, selectedOption, correct, timeSpent }
  testStartTime: null,
  questionStartTime: null,
  timerInterval: null,
  qTimerInterval: null,
  totalElapsed: 0,        // seconds
  questionElapsed: 0,     // seconds
  timesUp: false,
  testActive: false,
};

// ── LocalStorage Keys ──
const STORAGE = {
  HISTORY: 'shinji_map_history',      // array of past test results
  ATTEMPTED: 'shinji_map_attempted',  // set of question ids attempted correctly
  WRONG: 'shinji_map_wrong',          // set of question ids answered wrong
};

// ── Helpers ──
function loadData(key, fallback) {
  try { const d = localStorage.getItem(key); return d ? JSON.parse(d) : fallback; }
  catch { return fallback; }
}
function saveData(key, data) { localStorage.setItem(key, JSON.stringify(data)); }
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// ══════════════════════════════════
//  PARTICLES BACKGROUND
// ══════════════════════════════════
function initParticles() {
  const canvas = document.getElementById('particles-canvas');
  const ctx = canvas.getContext('2d');
  let particles = [];
  const COLORS = ['#667eea', '#764ba2', '#4facfe', '#f093fb', '#43e97b', '#ffd200'];

  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < 50; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 3 + 1,
      dx: (Math.random() - 0.5) * 0.5,
      dy: (Math.random() - 0.5) * 0.5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      alpha: Math.random() * 0.4 + 0.1,
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.fill();
      p.x += p.dx; p.y += p.dy;
      if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
    });
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }
  draw();
}

// ══════════════════════════════════
//  SCREEN NAVIGATION
// ══════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');

  if (id === 'home-screen') updateHomeStats();
  if (id === 'setup-screen') checkAllCompleted();
  if (id === 'history-screen') renderHistory();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ══════════════════════════════════
//  HOME SCREEN
// ══════════════════════════════════
function updateHomeStats() {
  const history = loadData(STORAGE.HISTORY, []);
  const attempted = loadData(STORAGE.ATTEMPTED, []);

  const latestEl = document.getElementById('home-latest-score');
  const progressEl = document.getElementById('home-progress');
  const bestEl = document.getElementById('home-best-score');
  const testsEl = document.getElementById('home-tests-taken');

  if (history.length > 0) {
    const latest = history[history.length - 1];
    latestEl.textContent = latest.scorePercent + '%';
    const best = Math.max(...history.map(h => h.scorePercent));
    bestEl.textContent = best + '%';
  } else {
    latestEl.textContent = '—';
    bestEl.textContent = '—';
  }

  const uniqueAttempted = new Set(attempted).size;
  progressEl.textContent = `${uniqueAttempted} / ${QUESTIONS.length}`;
  testsEl.textContent = history.length;
}

// ══════════════════════════════════
//  SETUP SCREEN
// ══════════════════════════════════
function selectTime(minutes) {
  if (!minutes || minutes < 1) return;
  state.selectedTime = minutes;
  document.querySelectorAll('.time-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.minutes) === minutes);
  });
  const customInput = document.getElementById('custom-time');
  if (![5, 10, 15, 20, 30].includes(minutes)) {
    customInput.value = minutes;
  }
}

function checkAllCompleted() {
  const attempted = new Set(loadData(STORAGE.ATTEMPTED, []));
  const wrong = loadData(STORAGE.WRONG, []);
  const allDone = attempted.size >= QUESTIONS.length && wrong.length === 0;

  document.getElementById('all-done-message').style.display = allDone ? 'block' : 'none';
  document.getElementById('btn-begin-test').style.display = allDone ? 'none' : '';
}

function resetAllProgress() {
  saveData(STORAGE.ATTEMPTED, []);
  saveData(STORAGE.WRONG, []);
  checkAllCompleted();
  updateHomeStats();
}

// ══════════════════════════════════
//  TEST FLOW
// ══════════════════════════════════
function beginTest() {
  // Build question queue
  const attempted = new Set(loadData(STORAGE.ATTEMPTED, []));
  const wrong = loadData(STORAGE.WRONG, []);

  let queue = [];
  // Unanswered questions first
  const unanswered = QUESTIONS.filter(q => !attempted.has(q.id));
  if (unanswered.length > 0) {
    queue = shuffle(unanswered);
  } else if (wrong.length > 0) {
    // All answered — retry wrong ones
    const wrongSet = new Set(wrong);
    queue = shuffle(QUESTIONS.filter(q => wrongSet.has(q.id)));
  } else {
    // Everything completed correctly
    checkAllCompleted();
    return;
  }

  state.questions = queue;
  state.answers = [];
  state.currentQuestionIndex = 0;
  state.totalElapsed = 0;
  state.questionElapsed = 0;
  state.timesUp = false;
  state.testActive = true;

  document.getElementById('times-up-banner').style.display = 'none';
  document.getElementById('timer-display').classList.remove('overtime');

  showScreen('test-screen');
  startTimers();
  renderQuestion();
}

function startTimers() {
  state.testStartTime = Date.now();
  state.questionStartTime = Date.now();

  clearInterval(state.timerInterval);
  clearInterval(state.qTimerInterval);

  state.timerInterval = setInterval(() => {
    state.totalElapsed = Math.floor((Date.now() - state.testStartTime) / 1000);
    document.getElementById('timer-value').textContent = formatTime(state.totalElapsed);

    // Check time limit
    if (!state.timesUp && state.totalElapsed >= state.selectedTime * 60) {
      state.timesUp = true;
      document.getElementById('times-up-banner').style.display = 'block';
      document.getElementById('timer-display').classList.add('overtime');
    }
  }, 1000);

  state.qTimerInterval = setInterval(() => {
    state.questionElapsed = Math.floor((Date.now() - state.questionStartTime) / 1000);
    document.getElementById('q-timer-value').textContent = state.questionElapsed + 's';
  }, 1000);
}

function renderQuestion() {
  const q = state.questions[state.currentQuestionIndex];
  if (!q) { endTest(); return; }

  // Update header
  document.querySelector('.q-current').textContent = state.currentQuestionIndex + 1;
  document.querySelector('.q-total').textContent = state.questions.length;
  const pct = ((state.currentQuestionIndex) / state.questions.length) * 100;
  document.getElementById('progress-fill').style.width = pct + '%';

  // Category badge
  document.getElementById('category-badge').textContent = q.category;

  // Question text
  document.getElementById('question-text').textContent = q.question;

  // Options
  const grid = document.getElementById('options-grid');
  grid.innerHTML = '';
  const letters = ['A', 'B', 'C', 'D'];
  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.id = `option-${i}`;
    btn.innerHTML = `<span class="option-letter">${letters[i]}</span><span class="option-text">${opt}</span>`;
    btn.onclick = () => selectOption(i);
    grid.appendChild(btn);
  });

  // Reset next button
  document.getElementById('btn-next').disabled = true;

  // Reset question timer
  state.questionStartTime = Date.now();
  state.questionElapsed = 0;
  document.getElementById('q-timer-value').textContent = '0s';

  // Animate in
  const area = document.getElementById('question-area');
  area.style.animation = 'none';
  area.offsetHeight; // reflow
  area.style.animation = 'fadeSlideIn 0.4s ease';
}

function selectOption(index) {
  const q = state.questions[state.currentQuestionIndex];
  const btns = document.querySelectorAll('.option-btn');
  const isCorrect = index === q.answer;

  // Disable all
  btns.forEach((btn, i) => {
    btn.classList.add('disabled');
    btn.classList.remove('selected');
    if (i === q.answer) btn.classList.add('correct');
    if (i === index && !isCorrect) btn.classList.add('incorrect');
  });
  btns[index].classList.add('selected');

  // Record answer
  const timeSpent = Math.floor((Date.now() - state.questionStartTime) / 1000);
  state.answers.push({
    questionId: q.id,
    selectedOption: index,
    correct: isCorrect,
    timeSpent: timeSpent,
  });

  // Update localStorage
  const attempted = loadData(STORAGE.ATTEMPTED, []);
  if (isCorrect && !attempted.includes(q.id)) {
    attempted.push(q.id);
    saveData(STORAGE.ATTEMPTED, attempted);
  }

  let wrong = loadData(STORAGE.WRONG, []);
  if (isCorrect) {
    wrong = wrong.filter(id => id !== q.id);
  } else if (!wrong.includes(q.id)) {
    wrong.push(q.id);
  }
  saveData(STORAGE.WRONG, wrong);

  // Enable next
  document.getElementById('btn-next').disabled = false;
}

function nextQuestion() {
  state.currentQuestionIndex++;
  if (state.currentQuestionIndex >= state.questions.length) {
    endTest();
  } else {
    renderQuestion();
  }
}

function confirmEndTest() {
  showModal('🏁', 'End Test?', 'Do you want to end the test and see your score?', () => {
    endTest();
  });
}

function endTest() {
  state.testActive = false;
  clearInterval(state.timerInterval);
  clearInterval(state.qTimerInterval);

  const correct = state.answers.filter(a => a.correct).length;
  const total = state.answers.length;
  const scorePercent = total > 0 ? Math.round((correct / total) * 100) : 0;
  const totalTime = state.totalElapsed;
  const avgTime = total > 0 ? Math.round(state.answers.reduce((s, a) => s + a.timeSpent, 0) / total) : 0;

  // Save to history
  const history = loadData(STORAGE.HISTORY, []);
  history.push({
    date: new Date().toISOString(),
    correct,
    total,
    scorePercent,
    totalTime,
    avgTime,
    answers: state.answers.map(a => ({
      questionId: a.questionId,
      selectedOption: a.selectedOption,
      correct: a.correct,
      timeSpent: a.timeSpent,
    })),
  });
  saveData(STORAGE.HISTORY, history);

  // Show results
  renderResults(correct, total, scorePercent, totalTime, avgTime);
  showScreen('results-screen');
}

// ══════════════════════════════════
//  RESULTS SCREEN
// ══════════════════════════════════
function renderResults(correct, total, pct, totalTime, avgTime) {
  // Emoji & text
  const emoji = document.getElementById('results-emoji');
  const title = document.getElementById('results-title');
  const subtitle = document.getElementById('results-subtitle');

  if (pct >= 90) { emoji.textContent = '🏆'; title.textContent = 'Outstanding!'; subtitle.textContent = 'You\'re a math superstar!'; }
  else if (pct >= 70) { emoji.textContent = '🎉'; title.textContent = 'Great Job!'; subtitle.textContent = 'Keep up the awesome work!'; }
  else if (pct >= 50) { emoji.textContent = '👍'; title.textContent = 'Good Effort!'; subtitle.textContent = 'Practice makes perfect!'; }
  else { emoji.textContent = '💪'; title.textContent = 'Keep Trying!'; subtitle.textContent = 'Every mistake is a chance to learn!'; }

  // Score ring
  const circumference = 2 * Math.PI * 54; // r=54
  const fill = document.getElementById('score-ring-fill');
  const offset = circumference - (pct / 100) * circumference;
  // Add SVG gradient if not exists
  const svg = document.querySelector('.score-svg');
  if (!svg.querySelector('defs')) {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    grad.id = 'scoreGradient'; grad.setAttribute('x1', '0%'); grad.setAttribute('y1', '0%');
    grad.setAttribute('x2', '100%'); grad.setAttribute('y2', '100%');
    const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', '#667eea');
    const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', '#43e97b');
    grad.appendChild(s1); grad.appendChild(s2);
    defs.appendChild(grad); svg.prepend(defs);
  }

  fill.style.strokeDasharray = circumference;
  fill.style.strokeDashoffset = circumference;
  requestAnimationFrame(() => {
    setTimeout(() => { fill.style.strokeDashoffset = offset; }, 100);
  });

  // Animate score count-up
  const scoreEl = document.getElementById('score-percent');
  animateValue(scoreEl, 0, pct, 1200, v => v + '%');

  // Stats
  document.getElementById('result-correct').textContent = correct;
  document.getElementById('result-incorrect').textContent = total - correct;
  document.getElementById('result-time').textContent = formatTime(totalTime);
  document.getElementById('result-avg-time').textContent = avgTime + 's';

  // Reset review
  document.getElementById('review-section').style.display = 'none';
}

function animateValue(el, start, end, duration, fmt) {
  const startTime = performance.now();
  function update(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const val = Math.round(start + (end - start) * eased);
    el.textContent = fmt ? fmt(val) : val;
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

function showReview() {
  document.getElementById('review-section').style.display = 'block';
  document.getElementById('review-section').scrollIntoView({ behavior: 'smooth' });
  filterReview('all');
}

function filterReview(filter) {
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === filter);
  });

  const list = document.getElementById('review-list');
  list.innerHTML = '';
  const letters = ['A', 'B', 'C', 'D'];

  state.answers.forEach((a, i) => {
    if (filter === 'correct' && !a.correct) return;
    if (filter === 'incorrect' && a.correct) return;

    const q = QUESTIONS.find(qu => qu.id === a.questionId);
    if (!q) return;

    const item = document.createElement('div');
    item.className = `review-item ${a.correct ? 'is-correct' : 'is-incorrect'}`;
    item.innerHTML = `
      <div class="review-q-header">
        <span class="review-q-num">Q${i + 1} ${a.correct ? '✅' : '❌'}</span>
        <span class="review-q-time">⏱️ ${a.timeSpent}s</span>
      </div>
      <div class="review-q-text">${q.question}</div>
      <div class="review-answer-row">
        <span class="review-your-answer">Your answer: <strong>${letters[a.selectedOption]}) ${q.options[a.selectedOption]}</strong></span>
        ${!a.correct ? `<span class="review-correct-answer">Correct answer: <strong>${letters[q.answer]}) ${q.options[q.answer]}</strong></span>` : ''}
      </div>
      <div class="review-explanation">💡 ${q.explanation}</div>
    `;
    list.appendChild(item);
  });

  if (list.children.length === 0) {
    list.innerHTML = `<div class="review-item" style="text-align:center;color:var(--text-secondary);">No questions match this filter.</div>`;
  }
}

// ══════════════════════════════════
//  HISTORY SCREEN
// ══════════════════════════════════
function renderHistory() {
  const history = loadData(STORAGE.HISTORY, []);
  const emptyEl = document.getElementById('history-empty');
  const chartArea = document.getElementById('history-chart-area');
  const listEl = document.getElementById('history-list');

  if (history.length === 0) {
    emptyEl.style.display = 'block';
    chartArea.style.display = 'none';
    listEl.innerHTML = '';
    return;
  }

  emptyEl.style.display = 'none';
  chartArea.style.display = 'block';

  // Render chart
  drawChart(history);

  // Render list (most recent first)
  listEl.innerHTML = '';
  [...history].reverse().forEach((h, i) => {
    const d = new Date(h.date);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const badgeClass = h.scorePercent >= 70 ? 'good' : h.scorePercent >= 50 ? 'okay' : 'needs-work';

    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <div class="history-score-badge ${badgeClass}">${h.scorePercent}%</div>
      <div class="history-item-info">
        <div class="history-item-date">${dateStr} at ${timeStr}</div>
        <div class="history-item-details">${h.correct}/${h.total} correct · ${formatTime(h.totalTime)} · Avg ${h.avgTime}s/q</div>
      </div>
    `;
    listEl.appendChild(item);
  });
}

function drawChart(history) {
  const canvas = document.getElementById('history-chart');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width, H = rect.height;

  ctx.clearRect(0, 0, W, H);

  const data = history.slice(-15).map(h => h.scorePercent);
  if (data.length < 2) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '14px Nunito';
    ctx.textAlign = 'center';
    ctx.fillText('Take more tests to see your trend!', W / 2, H / 2);
    return;
  }

  const padX = 40, padY = 20;
  const chartW = W - padX * 2, chartH = H - padY * 2;
  const stepX = chartW / (data.length - 1);

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  for (let p = 0; p <= 100; p += 25) {
    const y = padY + chartH - (p / 100) * chartH;
    ctx.beginPath(); ctx.moveTo(padX, y); ctx.lineTo(W - padX, y); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '10px Nunito'; ctx.textAlign = 'right';
    ctx.fillText(p + '%', padX - 6, y + 3);
  }

  // Line
  const grad = ctx.createLinearGradient(padX, 0, W - padX, 0);
  grad.addColorStop(0, '#667eea'); grad.addColorStop(1, '#43e97b');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = padX + i * stepX;
    const y = padY + chartH - (v / 100) * chartH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Fill
  const fillGrad = ctx.createLinearGradient(0, padY, 0, H - padY);
  fillGrad.addColorStop(0, 'rgba(102,126,234,0.3)'); fillGrad.addColorStop(1, 'rgba(102,126,234,0)');
  ctx.lineTo(padX + (data.length - 1) * stepX, H - padY);
  ctx.lineTo(padX, H - padY);
  ctx.closePath();
  ctx.fillStyle = fillGrad;
  ctx.fill();

  // Dots
  data.forEach((v, i) => {
    const x = padX + i * stepX;
    const y = padY + chartH - (v / 100) * chartH;
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#667eea'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  });
}

// ══════════════════════════════════
//  MODAL
// ══════════════════════════════════
function showModal(icon, title, message, onConfirm) {
  document.getElementById('modal-icon').textContent = icon;
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-message').textContent = message;
  document.getElementById('confirm-modal').style.display = 'flex';
  document.getElementById('modal-confirm').onclick = () => { closeModal(); onConfirm(); };
}
function closeModal() { document.getElementById('confirm-modal').style.display = 'none'; }

function confirmClearHistory() {
  showModal('🗑️', 'Clear All Data?', 'This will erase all your scores and progress. Are you sure?', () => {
    localStorage.removeItem(STORAGE.HISTORY);
    localStorage.removeItem(STORAGE.ATTEMPTED);
    localStorage.removeItem(STORAGE.WRONG);
    renderHistory();
    updateHomeStats();
  });
}

// ══════════════════════════════════
//  INIT
// ══════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initParticles();
  updateHomeStats();
  selectTime(15);
});
