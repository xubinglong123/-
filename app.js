let GAME = null;
const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- 导航 ----------
function show(id) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  $('#view-' + id).classList.add('active');
}
document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => show(b.dataset.back)));

async function init() {
  GAME = await (await fetch('/data/game.json')).json();
  $('#btn-solo').addEventListener('click', startSolo);
  $('#btn-multi').addEventListener('click', () => show('multi-entry'));
  bindMulti();
}

// ================= 单人模式 =================
let solo = null;
function startSolo() {
  solo = { chapter: 0, answers: [], hints: [0, 0, 0], done: false };
  renderSolo();
  show('solo');
  $('#solo-title').textContent = '单人探案 · ' + GAME.title;
}
function clueById(id) {
  for (const r of GAME.rounds) {
    for (const c of [...r.public, ...r.private]) if (c.id === id) return c;
  }
  return null;
}
function renderSolo() {
  const body = $('#solo-body');
  body.innerHTML = '';
  GAME.solo.chapters.forEach((ch, i) => {
    if (i > solo.chapter) return;
    const panel = el('div', 'panel solo-chapter');
    panel.appendChild(el('h3', null, esc(ch.title)));
    panel.appendChild(el('div', 'solo-brief', esc(ch.brief)));
    ch.clues.forEach((id) => {
      const c = clueById(id);
      panel.appendChild(renderClueCard(c, '线索', 'pub'));
    });
    if (i === solo.chapter && !solo.done) {
      const btn = el('button', 'primary', i < GAME.solo.chapters.length - 1 ? '继续调查 →' : '进入推理作答 →');
      btn.style.marginTop = '8px';
      btn.addEventListener('click', () => { solo.chapter++; renderSolo(); });
      panel.appendChild(btn);
    }
    body.appendChild(panel);
  });
  if (solo.chapter >= GAME.solo.chapters.length - 1 && !solo.done) renderSoloQuestions(body);
  if (solo.done) renderSoloVerdict(body);
}
function renderSoloQuestions(body) {
  const panel = el('div', 'panel');
  panel.appendChild(el('h3', null, '最终推理 · 三道谜题'));
  GAME.solo.questions.forEach((q, qi) => {
    const block = el('div');
    block.appendChild(el('p', 'solo-q', `<b>问题${qi + 1}：</b>${esc(q.q)}`));
    q.options.forEach((opt, oi) => {
      if (solo.answers[qi] !== undefined) return;
      const b = el('button', 'vote-opt', esc(opt));
      b.addEventListener('click', () => { solo.answers[qi] = oi; renderSolo(); });
      block.appendChild(b);
    });
    if (solo.answers[qi] !== undefined) {
      const right = solo.answers[qi] === q.answer;
      const line = el('div', right ? 'answer-right' : 'answer-wrong', `${right ? '✓ 答对了' : '✗ 答错了'} —— ${esc(q.hints[2])}`);
      block.appendChild(line);
      if (!right && solo.hints[qi] < 2) {
        const hb = el('button', 'ghost small', `查看提示（${solo.hints[qi] + 1}/2）`);
        hb.addEventListener('click', () => { solo.hints[qi]++; renderSolo(); });
        block.appendChild(hb);
      }
      if (solo.hints[qi] > 0) {
        block.appendChild(el('div', 'hint-box', esc(q.hints[solo.hints[qi] - 1])));
      }
    }
    panel.appendChild(block);
  });
  const answered = GAME.solo.questions.every((_, qi) => solo.answers[qi] !== undefined);
  if (answered) {
    const score = GAME.solo.questions.filter((q, qi) => solo.answers[qi] === q.answer).length;
    const fb = el('button', 'primary', '查看完整复盘');
    fb.addEventListener('click', () => { solo.done = true; renderSolo(); });
    panel.appendChild(fb);
    panel.appendChild(el('p', 'hint', `当前答对 ${score}/3`));
  }
  body.appendChild(panel);
}
function renderSoloVerdict(body) {
  const score = GAME.solo.questions.filter((q, qi) => solo.answers[qi] === q.answer).length;
  const murderer = GAME.characters.find((c) => c.id === GAME.truth.murderer);
  const panel = el('div', 'panel');
  panel.appendChild(el('div', 'verdict ' + (score >= 2 ? 'right' : 'wrong'),
    `<h3>${score >= 2 ? '推理成功！' : '略有遗憾…'} 答对 ${score}/3</h3><p>真凶是 <b>${esc(murderer.name)}</b>（${esc(murderer.tag)}）</p>`));
  panel.appendChild(el('h3', null, '手法与动机'));
  panel.appendChild(el('p', null, esc(GAME.truth.method)));
  panel.appendChild(el('p', null, esc(GAME.truth.motive)));
  panel.appendChild(el('h3', null, '完整线索链复盘'));
  GAME.truth.recap.forEach((s, i) => {
    panel.appendChild(el('div', 'recap-step', `<div class="recap-num">${i + 1}</div><p>${esc(s)}</p>`));
  });
  panel.appendChild(el('h3', null, '误导线如何被证伪'));
  GAME.misleads.forEach((m) => {
    panel.appendChild(el('div', 'relation', `<b>${esc(m.who)}</b>：${esc(m.claim)} —— ${esc(m.falsified)}`));
  });
  const again = el('button', 'ghost', '重新体验单人模式');
  again.addEventListener('click', startSolo);
  panel.appendChild(again);
  body.appendChild(panel);
}

// ================= 多人模式 =================
let me = { code: null, pid: null };
let pollTimer = null;

// ---------- 语音提示 ----------
let voiceOn = localStorage.getItem('jqVoice') !== 'off';
function say(text) {
  if (!voiceOn || !window.speechSynthesis) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 1.05;
    speechSynthesis.speak(u);
  } catch (e) {}
}
function announceStage(stage) {
  const map = {
    round1: '第一轮搜证开始，建立疑点。公共线索已公布，每人可抽取一张私有线索。',
    round2: '第二轮搜证开始，制造矛盾。',
    round3: '第三轮搜证开始，决定性证据登场。',
    vote: '搜证结束，进入投票阶段，请指认真凶。',
    reveal: '真相揭晓。',
  };
  if (map[stage]) say(map[stage]);
}

// ---------- 回合计时器 ----------
let timerState = null;
let timerEndSpoken = false;
function renderTimer(s) {
  timerState = s.timer;
  const bar = $('#g-timer');
  if (!s.timer) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  updateTimerText();
}
function updateTimerText() {
  const bar = $('#g-timer');
  if (!timerState || !bar) return;
  const remain = Math.max(0, timerState.endsAt - Date.now());
  const m = Math.floor(remain / 60000);
  const sec = Math.floor((remain % 60000) / 1000);
  bar.textContent = `⏱ 本轮剩余 ${m}:${String(sec).padStart(2, '0')}`;
  bar.classList.toggle('urgent', remain < 60000 && remain > 0);
  if (remain <= 0 && !timerEndSpoken) { timerEndSpoken = true; say('时间到'); }
  if (remain > 0) timerEndSpoken = false;
}
setInterval(updateTimerText, 500);


function bindMulti() {
  $('#btn-create').addEventListener('click', async () => {
    const name = $('#in-name').value.trim();
    if (!name) return $('#entry-err').textContent = '请先填写昵称';
    const r = await api('/api/create', { name });
    if (r.error) return $('#entry-err').textContent = r.error;
    me = { code: r.code, pid: r.pid };
    enterLobby();
  });
  $('#btn-join').addEventListener('click', async () => {
    const name = $('#in-name').value.trim();
    const code = $('#in-code').value.trim().toUpperCase();
    if (!name || !code) return $('#entry-err').textContent = '请填写昵称和房间码';
    const r = await api('/api/join', { code, name });
    if (r.error) return $('#entry-err').textContent = r.error;
    me = { code: r.code, pid: r.pid };
    enterLobby();
  });
  $('#btn-copy').addEventListener('click', () => {
    navigator.clipboard && navigator.clipboard.writeText(me.code || '');
    $('#btn-copy').textContent = '已复制';
    setTimeout(() => ($('#btn-copy').textContent = '复制房间码'), 1200);
  });
  $('#btn-start').addEventListener('click', async () => {
    const r = await api('/api/start', act());
    if (r.error) alert(r.error);
  });
  $('#btn-leave').addEventListener('click', leaveGame);
  $('#btn-quit').addEventListener('click', leaveGame);
  $('#chat-send').addEventListener('click', sendChat);
  $('#chat-text').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });
  const vb = $('#btn-voice');
  vb.textContent = voiceOn ? '🔊 语音开' : '🔇 语音关';
  vb.addEventListener('click', () => {
    voiceOn = !voiceOn;
    localStorage.setItem('jqVoice', voiceOn ? 'on' : 'off');
    vb.textContent = voiceOn ? '🔊 语音开' : '🔇 语音关';
    if (voiceOn) say('语音提示已开启');
  });
}
function act(extra) { return Object.assign({ code: me.code, pid: me.pid }, extra || {}); }
async function api(url, body) {
  if (body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.json();
  }
  return (await fetch(url)).json();
}
function sendChat() {
  const t = $('#chat-text').value.trim();
  if (!t) return;
  $('#chat-text').value = '';
  api('/api/chat', act({ text: t }));
}
function leaveGame() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  me = { code: null, pid: null };
  show('multi-entry');
}
function enterLobby() {
  show('lobby');
  $('#lobby-code').textContent = me.code;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(poll, 1500);
  poll();
}
async function poll() {
  if (!me.code) return;
  let s;
  try { s = await api(`/api/state?code=${me.code}&pid=${me.pid}`); }
  catch (e) { return; }
  if (s.error) { alert(s.error); leaveGame(); return; }
  if (s.stage === 'lobby') renderLobby(s);
  else renderGame(s);
}
function renderLobby(s) {
  const list = $('#lobby-players');
  list.innerHTML = '';
  s.players.forEach((p) => list.appendChild(el('span', 'player-chip' + (p.isHost ? ' host' : ''), esc(p.name) + (p.isHost ? ' · 房主' : ''))));
  $('#btn-start').style.display = s.you && s.you.isHost ? '' : 'none';
  if (s.you && !s.you.isHost) $('#btn-start').style.display = 'none';
}

let curStage = null;
function renderGame(s) {
  if (curStage !== s.stage) {
    curStage = s.stage;
    setTabByStage(s.stage);
    announceStage(s.stage);
  }
  $('#g-stage').textContent = s.stageName || s.stage;
  $('#g-code').textContent = '房间 ' + s.code;
  renderTimer(s);

  // tabs
  const tabs = $('#g-tabs');
  tabs.innerHTML = '';
  const tabDefs = [['role', '我的角色'], ['clues', '线索'], ['chat', '讨论室']];
  if (s.stage === 'vote') tabDefs.push(['vote', '投票指认']);
  if (s.stage === 'reveal') tabDefs.push(['reveal', '真相揭晓']);
  tabDefs.forEach(([k, label]) => {
    const b = el('button', 'tab' + (tabs.dataset.cur === k ? ' on' : ''), label);
    b.addEventListener('click', () => { tabs.dataset.cur = k; renderGame(s); });
    tabs.appendChild(b);
  });
  if (!tabs.dataset.cur) { tabs.dataset.cur = 'role'; tabs.firstChild.classList.add('on'); }
  ['role', 'clues', 'chat', 'vote', 'reveal'].forEach((k) => { $('#pane-' + k).style.display = tabs.dataset.cur === k ? '' : 'none'; });

  renderRolePane(s);
  renderCluePane(s);
  renderChatPane(s);
  renderVotePane(s);
  renderRevealPane(s);
  renderHostBar(s);
}
function setTabByStage(stage) {
  const tabs = $('#g-tabs');
  tabs.dataset.cur = stage === 'vote' ? 'vote' : stage === 'reveal' ? 'reveal' : 'role';
}
function renderRolePane(s) {
  const box = $('#role-sheet');
  if (!s.you || s.you.roleIdx == null) { box.innerHTML = '<p class="hint">等待角色分配…</p>'; return; }
  const c = GAME.characters[s.you.roleIdx];
  box.innerHTML = `
    <h3>${esc(c.name)}</h3><div class="role-tag">${esc(c.tag)}</div>
    <div class="role-block"><h4>公开身份</h4><p>${esc(c.open)}</p></div>
    <div class="role-block accent"><h4>你的动机（私密）</h4><p>${esc(c.motive)}</p></div>
    <div class="role-block warn"><h4>你的秘密（私密）</h4><p>${esc(c.secret)}</p></div>
    <div class="role-block dark"><h4>你不能说的理由</h4><p>${esc(c.cannotSay)}</p></div>
    <div class="role-block"><h4>你当晚的行动</h4><ul class="role-night">${c.night.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>
    <div class="role-block"><h4>你知道的事</h4><p>${esc(c.knows)}</p></div>
    <div class="role-block"><h4>人物关系</h4>${c.relations.map((r) => `<div class="relation">${esc(r)}</div>`).join('')}</div>
    <div class="role-secret-tip">守住你的秘密，但记住：真凶要隐藏罪行，无辜者要洗清嫌疑、找出真凶。每人每轮可抽一张私有线索，是否公开由你决定。</div>`;
}
function clueCardHtml(c, kindLabel, kindClass) {
  let media = '';
  if (c.img) media += `<img class="clue-img" src="/media/${encodeURIComponent(c.img)}.png" alt="${esc(c.title)}" loading="lazy">`;
  if (c.video) media += `<video class="clue-video" src="/media/${encodeURIComponent(c.video)}.mp4" controls preload="metadata" playsinline></video>`;
  if (c.img || c.video) media += '<p class="media-tip">👁 细节藏在画面里：放大照片、逐帧看视频，答案不会写在字面上。</p>';
  return `<span class="clue-kind ${kindClass}">${kindLabel}</span><h4>${esc(c.title)}</h4>${media}<p>${esc(c.text)}</p>`;
}
function renderClueCard(c, kindLabel, kindClass, extraBtn) {
  const card = el('div', 'clue-card ' + kindClass, clueCardHtml(c, kindLabel, kindClass));
  const img = card.querySelector('.clue-img');
  if (img) img.addEventListener('click', () => openLightbox(img.src, c.title));
  if (extraBtn) card.appendChild(extraBtn);
  return card;
}
function openLightbox(src, title) {
  const overlay = el('div', 'lightbox');
  overlay.innerHTML = `<div class="lightbox-inner"><h3>${esc(title)}</h3><img src="${src}" alt=""></div>`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}
function renderCluePane(s) {
  const pub = $('#clue-public');
  pub.innerHTML = s.publicClues.length ? '<div class="clue-section-title">公共线索（全员可见）</div>' : '';
  s.publicClues.forEach((c) => pub.appendChild(renderClueCard(c, '公共', 'pub')));
  const draw = $('#clue-draw');
  draw.innerHTML = '';
  if (s.stage.startsWith('round')) {
    if (s.you && s.you.roleIdx != null) {
      if (s.you.canDraw) {
        const b = el('button', 'primary draw-btn', `抽取本轮私有线索（${gameRoundName(s.stage)}）`);
        b.addEventListener('click', async () => { const r = await api('/api/draw', act()); if (r.error) alert(r.error); });
        draw.appendChild(b);
      } else if (s.you.drawnThisRound) {
        draw.appendChild(el('p', 'hint', '本轮已抽取，私有线索见下方。是否公开、何时公开，由你决定。'));
      }
    }
  }
  const mine = $('#clue-mine');
  mine.innerHTML = s.you && s.you.clues.length ? '<div class="clue-section-title">我的私有线索</div>' : '';
  (s.you ? s.you.clues : []).forEach((c) => {
    const b = null;
    if (s.stage !== 'reveal') {
      const btn = el('button', 'ghost small', '公开到讨论室');
      btn.style.marginTop = '8px';
      btn.addEventListener('click', () => api('/api/revealClue', act({ clueId: c.id })));
      mine.appendChild(renderClueCard(c, '私有', 'mine', btn));
    } else {
      mine.appendChild(renderClueCard(c, '私有', 'mine'));
    }
  });
}
function gameRoundName(stage) {
  return { round1: GAME.rounds[0].name, round2: GAME.rounds[1].name, round3: GAME.rounds[2].name }[stage] || '';
}
function renderChatPane(s) {
  const list = $('#chat-list');
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  list.innerHTML = '';
  s.chat.forEach((m) => {
    const isMe = m.name === (s.you && s.you.name) && m.kind === 'chat';
    const item = el('div', 'chat-msg ' + (m.kind === 'sys' ? 'sys' : m.kind === 'clue' ? 'clue' : isMe ? 'me' : ''),
      `<div class="who">${esc(m.name)} · ${new Date(m.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</div><div class="bubble">${esc(m.text)}</div>`);
    list.appendChild(item);
  });
  if (atBottom) list.scrollTop = list.scrollHeight;
}
function renderVotePane(s) {
  const box = $('#vote-panel');
  if (s.stage !== 'vote') { box.innerHTML = ''; return; }
  box.innerHTML = '<h3>指认真凶</h3><p class="hint">结合三轮线索投票。全员投完后，房主可揭晓真相。</p>';
  const myVote = s.you && s.you.voted;
  if (myVote) {
    const name = GAME.characters.find((c) => c.id === myVote).name;
    box.appendChild(el('div', 'answer-right', `你已指认：${esc(name)}，等待其他玩家…`));
  }
  const readyN = s.players.filter((p) => p.ready).length;
  box.appendChild(el('p', 'hint', `已投票：${readyN}/${s.players.length}`));
  if (s.you && s.you.roleIdx != null && !myVote) {
    GAME.characters.forEach((c) => {
      const b = el('button', 'vote-opt', `<b>${esc(c.name)}</b><span>${esc(c.tag)}</span>`);
      b.addEventListener('click', async () => { const r = await api('/api/vote', act({ target: c.id })); if (r.error) alert(r.error); });
      box.appendChild(b);
    });
  }
}
function renderRevealPane(s) {
  const box = $('#reveal-box');
  if (s.stage !== 'reveal' || !s.reveal) { box.innerHTML = ''; return; }
  box.innerHTML = '';
  const murderer = GAME.characters.find((c) => c.id === s.reveal.murdererId);
  const myVote = s.you && s.you.voted;
  const right = myVote === s.reveal.murdererId;
  box.appendChild(el('div', 'verdict ' + (right ? 'right' : 'wrong'),
    `<h3>${right ? '恭喜，你指认正确！' : '很遗憾，你指认错了。'}</h3><p>真凶是 <b>${esc(murderer.name)}</b>（${esc(murderer.tag)}）</p>`));
  const votesPanel = el('div', 'panel');
  votesPanel.appendChild(el('h3', null, '投票结果'));
  Object.entries(s.reveal.tally).forEach(([id, n]) => {
    const name = GAME.characters.find((c) => c.id === id).name;
    const voters = (s.reveal.voters[id] || []).join('、');
    const hit = id === s.reveal.murdererId;
    votesPanel.appendChild(el('div', 'relation', `${esc(name)}：${n} 票（${esc(voters)}）${hit ? ' ← 真凶' : ''}`));
  });
  box.appendChild(votesPanel);
  const truthPanel = el('div', 'panel');
  truthPanel.appendChild(el('h3', null, '作案手法'));
  truthPanel.appendChild(el('p', null, esc(s.reveal.truth.method)));
  truthPanel.appendChild(el('h3', null, '动机'));
  truthPanel.appendChild(el('p', null, esc(s.reveal.truth.motive)));
  truthPanel.appendChild(el('h3', null, '留下的痕迹'));
  truthPanel.appendChild(el('p', null, esc(s.reveal.truth.trace)));
  box.appendChild(truthPanel);
  const recap = el('div', 'panel');
  recap.appendChild(el('h3', null, '完整线索链复盘'));
  s.reveal.truth.recap.forEach((t, i) => recap.appendChild(el('div', 'recap-step', `<div class="recap-num">${i + 1}</div><p>${esc(t)}</p>`)));
  box.appendChild(recap);
  const mis = el('div', 'panel');
  mis.appendChild(el('h3', null, '误导线与证伪'));
  s.reveal.misleads.forEach((m) => mis.appendChild(el('div', 'relation', `<b>${esc(m.who)}</b>：${esc(m.claim)} —— ${esc(m.falsified)}`)));
  box.appendChild(mis);
  const roster = el('div', 'panel');
  roster.appendChild(el('h3', null, '角色归属与秘密'));
  s.players.forEach((p) => {
    if (p.roleIdx == null) return;
    const c = GAME.characters[p.roleIdx];
    roster.appendChild(el('div', 'relation', `<b>${esc(p.name)}</b> 扮演 ${esc(c.name)}（${esc(c.tag)}）<br>动机：${esc(c.motive)}<br>秘密：${esc(c.secret)}<br>不能说的理由：${esc(c.cannotSay)}`));
  });
  box.appendChild(roster);
}
function renderHostBar(s) {
  const bar = $('#hostbar');
  const isHost = s.you && s.you.isHost;
  bar.innerHTML = '';
  bar.classList.toggle('hidden', !isHost || s.stage === 'lobby');
  if (!isHost) return;
  if (['round1', 'round2', 'round3'].includes(s.stage)) {
    const sel = el('select', 'timer-sel');
    [3, 5, 8, 10, 15].forEach((n) => {
      const o = el('option', null, n + ' 分钟');
      o.value = n;
      sel.appendChild(o);
    });
    sel.value = '8';
    bar.appendChild(sel);
    if (s.timer && !s.timer.announced) {
      const stop = el('button', 'ghost', '停止计时');
      stop.addEventListener('click', () => api('/api/timer', act({ mode: 'stop' })));
      bar.appendChild(stop);
    } else {
      const tb = el('button', 'ghost', '⏱ 开始计时');
      tb.addEventListener('click', () => api('/api/timer', act({ mode: 'start', minutes: parseInt(sel.value, 10) })));
      bar.appendChild(tb);
    }
    const b = el('button', 'primary', '进入下一阶段 →');
    b.addEventListener('click', async () => { const r = await api('/api/next', act()); if (r.error) alert(r.error); });
    bar.appendChild(b);
    const tip = el('span', 'hint', '建议每轮 8-12 分钟搜证讨论');
    bar.appendChild(tip);
  }
  if (s.stage === 'vote') {
    const readyN = s.players.filter((p) => p.ready).length;
    const b = el('button', 'primary', `揭晓真相（已投 ${readyN}/${s.players.length}）`);
    b.addEventListener('click', async () => { const r = await api('/api/reveal', act()); if (r.error) alert(r.error); });
    bar.appendChild(b);
  }
  if (s.stage === 'reveal') {
    const b = el('button', 'ghost', '重新开局（回大厅）');
    b.addEventListener('click', async () => { const r = await api('/api/restart', act()); if (r.error) alert(r.error); });
    bar.appendChild(b);
  }
}

init();
