let GAME = null;
let DATA = null; // { scripts: [...] }
let scriptId = null;
const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- 导航 ----------
function show(id) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  $('#view-' + id).classList.add('active');
  if (id !== 'game') setBgmStage(id === 'solo' ? 1 : 0);
}
document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => show(b.dataset.back)));
// 浏览器自动播放限制：首次任意点击后解锁音频
document.addEventListener('pointerdown', function bgmUnlock() {
  document.removeEventListener('pointerdown', bgmUnlock);
  if (bgmOn) bgmStart();
});

async function init() {
  DATA = await (await fetch('/data/scripts.json')).json();
  scriptId = store.get('jqScript') || DATA.scripts[0].id;
  GAME = DATA.scripts.find((s) => s.id === scriptId) || DATA.scripts[0];
  renderStatBar();
  renderScriptPicker('#entry-script-cards');
  $('#btn-solo').addEventListener('click', startSolo);
  $('#btn-multi').addEventListener('click', () => {
    renderScriptPicker('#entry-script-cards');
    show('multi-entry');
  });
  $('#btn-bgm').addEventListener('click', toggleBgm);
  updateBgmButton();
  bindMulti();
}
// ---------- 剧本选择（板块化 + 筛选 + 封面卡片，点击进详情页） ----------
const PICKER_BOXES = ['#entry-script-cards', '#solo-script-cards'];
let pickerGenre = 'mystery';
let filterDiff = 'all';
let filterTag = 'all';
function starStr(n) { return '★'.repeat(n) + '☆'.repeat(5 - n); }
function diffLabel(stars) { return stars <= 2 ? '入门' : stars === 3 ? '进阶' : stars === 4 ? '困难' : '专家'; }
function renderScriptPicker(boxSel, opts) {
  const box = $(boxSel);
  if (!box) return;
  box.innerHTML = '';
  const soloMode = boxSel === '#solo-script-cards';
  if (soloMode) {
    const tabs = el('div', 'genre-tabs');
    [['mystery', '🕵 疑案追踪'], ['story', '📖 剧情探索']].forEach(([g, label]) => {
      const cnt = DATA.scripts.filter((s) => s.genre === g).length;
      const b = el('button', 'genre-tab' + (pickerGenre === g ? ' on' : ''), label + `（${cnt}）`);
      b.addEventListener('click', () => {
        pickerGenre = g;
        filterDiff = 'all'; filterTag = 'all';
        // 切换板块时，若当前选中剧本不属于该板块，自动选中该板块第一本
        if (!GAME || GAME.genre !== g) {
          const first = DATA.scripts.find((s) => s.genre === g);
          if (first) { scriptId = first.id; GAME = first; store.set('jqScript', scriptId); }
        }
        renderScriptPicker(boxSel);
      });
      tabs.appendChild(b);
    });
    box.appendChild(tabs);
  } else {
    pickerGenre = 'mystery';
    // 多人组局只支持疑案本：若残留剧情本选择，自动切回疑案第一本
    if (!GAME || GAME.genre !== 'mystery') {
      const first = DATA.scripts.find((s) => s.genre === 'mystery');
      if (first) { scriptId = first.id; GAME = first; store.set('jqScript', scriptId); }
    }
  }
  // 筛选条：难度 + 类型
  const poolAll = DATA.scripts.filter((s) => s.genre === pickerGenre);
  const tagSet = [...new Set(poolAll.map((s) => s.tag))];
  const filters = el('div', 'filter-row');
  const diffChips = el('div', 'chip-group');
  [['all', '难度·全部'], ['12', '入门'], ['3', '进阶'], ['4', '困难'], ['5', '专家']].forEach(([v, label]) => {
    const c = el('button', 'chip' + (filterDiff === v ? ' on' : ''), label);
    c.addEventListener('click', () => { filterDiff = v; renderScriptPicker(boxSel); });
    diffChips.appendChild(c);
  });
  const tagChips = el('div', 'chip-group');
  [['all', '类型·全部'], ...tagSet.map((t) => [t, t])].forEach(([v, label]) => {
    const c = el('button', 'chip' + (filterTag === v ? ' on' : ''), label);
    c.addEventListener('click', () => { filterTag = v; renderScriptPicker(boxSel); });
    tagChips.appendChild(c);
  });
  filters.appendChild(diffChips);
  filters.appendChild(tagChips);
  box.appendChild(filters);
  let pool = poolAll.filter((s) =>
    (filterDiff === 'all' || String(s.stars) === filterDiff || (filterDiff === '12' && s.stars <= 2)));
  if (filterTag !== 'all') pool = pool.filter((s) => s.tag === filterTag);
  if (!pool.length) box.appendChild(el('p', 'hint', '该筛选条件下暂无剧本，换个条件试试。'));
  const activeId = pool.some((s) => s.id === scriptId) ? scriptId : null;
  pool.forEach((s) => {
    const cleared = store.get('jqClear_' + s.id) === '1';
    const card = el('div', 'script-card cover-card' + (s.id === activeId ? ' on' : ''), `
      <div class="cover-wrap"><img class="cover-img" src="${esc(s.cover)}" alt="" loading="lazy">
        <span class="reward-badge">悬赏 ${s.reward}</span>
        ${cleared ? '<span class="badge-clear cover-clear">🏅已通关</span>' : ''}
      </div>
      <div class="card-body">
        <div class="script-title">${esc(s.title)}</div>
        <div class="card-meta">
          <span class="meta-tag">${esc(s.tag)}</span>
          <span class="meta-stars">${starStr(s.stars)}</span>
          <span class="meta-diff">${diffLabel(s.stars)}</span>
          <span class="meta-time">⏱ ${s.minutes}分钟</span>
        </div>
        <p>${esc(s.intro.slice(0, 46))}…</p>
      </div>`);
    card.addEventListener('click', () => openDetail(s.id, soloMode ? 'solo' : 'multi'));
    box.appendChild(card);
  });
  if (!soloMode) {
    const hint = el('p', 'hint', '点击剧本查看案件详情，详情页内可直接开团；单人开局支持 AI 补位。剧情探索类为单人沉浸玩法。');
    box.appendChild(hint);
  }
}
// ---------- 侦探成长：经验 / 悬赏 / 等级 ----------
function myExp() { return parseInt(store.get('jqExp'), 10) || 0; }
function myReward() { return parseInt(store.get('jqReward'), 10) || 0; }
function addExp(n) { store.set('jqExp', String(myExp() + n)); renderStatBar(); }
function addReward(n) { store.set('jqReward', String(myReward() + n)); renderStatBar(); }
function renderStatBar() {
  const bar = $('#stat-bar');
  if (!bar) return;
  const exp = myExp();
  bar.innerHTML = `<span class="stat-chip">🎖 侦探等级 ${Math.floor(exp / 120) + 1}</span><span class="stat-chip">⭐ 经验 ${exp}</span><span class="stat-chip">💰 悬赏 ${myReward()}</span>`;
}

// ---------- 案件详情页（大封面 + 背景介绍 + 人物关系 + 开始解谜） ----------
let detailCtx = 'solo';
function openDetail(id, ctx) {
  detailCtx = ctx || 'solo';
  const s = DATA.scripts.find((x) => x.id === id);
  if (!s) return;
  scriptId = s.id;
  GAME = s;
  store.set('jqScript', scriptId);
  renderDetail();
  show('detail');
}
function renderDetail() {
  const s = GAME;
  const isM = s.genre === 'mystery';
  const cleared = store.get('jqClear_' + s.id) === '1';
  const castList = s.characters.slice();
  const victimInCast = s.characters.some((c) => s.victim && c.name === s.victim.name);
  if (isM && s.victim && !victimInCast) {
    castList.unshift({ id: '__victim__', name: s.victim.name, tag: '死者', victimCard: true });
  }
  const cast = castList.map((c) => `
    <div class="cast-card photo">
      ${avatarHtml(c.name, hashStr(c.id) * 47 % 360).replace('class="avatar"', 'class="avatar cast-big"')}
      <div class="cast-name">${esc(c.name)}</div>
      <div class="cast-tag">${esc(c.tag)}</div>
      ${c.victimCard ? '<span class="cast-role dead">☠ 死者</span>' : isM ? '<span class="cast-role">嫌疑</span>' : ''}
    </div>`).join('');
  const clearedLine = cleared ? '<span class="badge-clear">🏅已通关 · 可重复游玩</span>' : '';
  const box = $('#detail-body');
  box.innerHTML = `
    <div class="detail-hero"><img src="${esc(s.cover)}" alt=""></div>
    <div class="panel detail-head">
      <h2 class="detail-title">${esc(s.title)}</h2>
      <div class="card-meta">
        <span class="meta-tag">${esc(s.tag)}</span>
        <span class="meta-stars">${starStr(s.stars)}</span>
        <span class="meta-diff">${diffLabel(s.stars)}</span>
        <span class="meta-time">⏱ 预计 ${s.minutes} 分钟</span>
      </div>
      <div class="detail-stats">⭐ 经验 ${s.exp} · 💰 悬赏值 ${s.reward} ${clearedLine}</div>
    </div>
    <div class="panel"><h3>📖 ${isM ? '案件简介' : '剧情简介'}</h3><p class="detail-intro">${esc(s.intro)}</p></div>
    <div class="panel"><h3>${isM ? '🔗 人物关系图' : '👥 登场人物'}<span class="h-sub">${isM ? `共 ${s.characters.length} 人 · ${s.victim ? esc(s.victim.name) + ' 已遇害' : ''}` : `共 ${s.characters.length} 人`}</span></h3>
      <div class="cast-grid detail-cast">${cast}</div></div>
    <div class="detail-actions">
      <button class="primary" id="btn-detail-solo">🔍 开始解谜</button>
      ${isM ? '<button class="ghost" id="btn-detail-multi">👥 用它组局开团（3-6人）</button>' : '<p class="hint">剧情探索为单人沉浸玩法，暂不支持组局。</p>'}
    </div>`;
  $('#btn-detail-solo').addEventListener('click', () => {
    show('solo');
    if (!solo || !solo.pick) solo = { mode: null, pick: false };
    solo.pick = false;
    renderSolo();
    $('#solo-title').textContent = '单人探案 · ' + GAME.title;
  });
  const bm = $('#btn-detail-multi');
  if (bm) bm.addEventListener('click', () => {
    renderScriptPicker('#entry-script-cards');
    show('multi-entry');
  });
}
// 详情页返回：按进入来源回单人/多人
$('#btn-detail-back').addEventListener('click', () => {
  if (detailCtx === 'solo') { show('solo'); if (solo) renderSolo(); }
  else { renderScriptPicker('#entry-script-cards'); show('multi-entry'); }
});

// ---------- 对话流 · 自由提问（像视频里一样直接打字问话） ----------
function askReply(q) {
  // 关键词命中谁的话题，谁就回答（含撒谎/被戳穿逻辑）
  for (const c of GAME.characters) {
    const t = (c.chat || []).find((x) => (x.k || []).some((k) => q.includes(k)));
    if (t) {
      let text;
      if (t.lie && solo.found.has(t.clue)) {
        if (!solo.busted[c.id]) solo.busted[c.id] = [];
        if (!solo.busted[c.id].includes(t.label)) solo.busted[c.id].push(t.label);
        text = t.truth || t.text;
      } else text = t.text;
      return { who: c.id, q, text };
    }
  }
  const fb = GAME.genre === 'story'
    ? ['这个问题，答案也许就藏在某段回忆里——继续往下读，别急。', '故事还没讲完，先别急着下判断。注意每个人没说出口的话。', '嗯……这个问题我现在还不能回答你。等线索再多一些。']
    : ['这个问题，现有线索还回答不了——继续搜证，答案会自己浮出来。', '好问题。但先别下结论，把每条证据和人物时间线交叉对一遍。', '我把案卷又翻了一遍——注意那些「谁都知道」的细节，往往最可疑。', '等下一轮搜证结果出来，这个问题也许就有答案了。'];
  const i = (solo.asks || []).length % fb.length;
  return { who: 'dm', q, text: fb[i] };
}


function scriptBriefHTML(s) {
  const cast = s.characters.map((c) =>
    `<div class="cast-card"><div class="cast-name">${esc(c.name)}</div><div class="cast-tag">${esc(c.tag)}</div><p>${esc(c.open)}</p></div>`).join('');
  const victim = s.victim
    ? `<div class="brief-block"><h4>🕯 死者档案</h4><p><b>${esc(s.victim.name)}</b> · ${esc(s.victim.desc)}</p></div>`
    : '';
  const castTitle = s.genre === 'story' ? `🎭 登场人物（${s.characters.length} 人）` : `🎭 人物介绍（${s.characters.length} 人 · 案发当晚均在场）`;
  return `
    <div class="brief-block"><h4>📖 游戏背景</h4><p>${esc(s.intro)}</p></div>
    ${victim}
    <div class="brief-block"><h4>${castTitle}</h4><div class="cast-grid">${cast}</div></div>`;
}

// ================= 单人模式（三玩法：A侦探陪跑 / B我是嫌疑人 / C海龟汤） =================
let solo = null;
function startSolo() {
  solo = { mode: null, pick: true };
  renderSolo();
  show('solo');
  $('#solo-title').textContent = '单人探案';
}
function renderSoloScriptPick(body) {
  const panel = el('div', 'panel');
  panel.appendChild(el('h3', null, '① 选择剧本（点击切换）'));
  panel.appendChild(el('p', 'hint', '选好后进入玩法选择，开局前可随时返回重选。'));
  const box = el('div', 'script-cards');
  box.id = 'solo-script-cards';
  panel.appendChild(box);
  body.appendChild(panel);
  renderScriptPicker('#solo-script-cards');
}
function renderSoloModeSelect(body) {
  $('#solo-title').textContent = '单人探案 · ' + GAME.title;
  const brief = el('div', 'panel');
  brief.innerHTML = '<h3>' + esc(GAME.title) + ' · 背景 & 人物</h3>' + scriptBriefHTML(GAME);
  body.appendChild(brief);
  const panel = el('div', 'panel');
  panel.appendChild(el('h3', null, '选择玩法'));
  panel.appendChild(el('p', 'hint', GAME.genre === 'story'
    ? '剧情探索本没有凶案与投票——跟随对话流走进故事与人心，理解得越深，结局越完整。'
    : '三种玩法共用同一套剧本数据，但推理逻辑完全不同——先当侦探，再当凶手，最后玩汤，体验最完整。'));
  const defs = [
    ['A', '🔍 模式A · 侦探陪跑', '你查案，NPC 会撒谎、藏线索。系统当 DM：三章发线索、弱→强分级提示卡、人物私聊套话，结尾清算「你漏了哪条线索、谁在骗你」。'],
  ];
  if (GAME.suspect) defs.push(['B', '🎭 模式B · 我是嫌疑人', '你就是真凶。审讯官步步紧逼，你要在咬死原话、模糊带过、抛出新细节之间压低怀疑值——爆表就被捕，撑过全部审讯即逃脱。']);
  defs.push(['C', '🍲 模式C · 海龟汤', '系统只回答「是 / 不是 / 无关」。靠提问逼近核心诡计，卡关可要三级提示，说出关键手法即通关。']);
  defs.forEach(([m, t, d]) => {
    const card = el('div', 'mode-card solo-mode');
    card.innerHTML = `<h3>${t}</h3><p>${d}</p>`;
    card.addEventListener('click', () => { solo = makeSolo(m); renderSolo(); });
    panel.appendChild(card);
  });
  body.appendChild(panel);
}
function makeSolo(mode) {
  const base = {
    mode, chapter: 0, answers: [], hints: [0, 0, 0], done: false,
    found: new Set(), asked: new Set(), lies: {}, busted: {}, chats: {}, chatWho: null,
    asks: [], seen: new Set(), rewarded: false,
  };
  if (mode === 'B') Object.assign(base, { susp: GAME.suspect.startSusp, scene: 0, log: [], conf: false, over: null });
  if (mode === 'C') Object.assign(base, { qa: [], soupHints: 0, soupDone: false, soupWin: false });
  return base;
}
function renderSolo() {
  const body = $('#solo-body');
  body.innerHTML = '';
  if (solo.pick) return renderSoloScriptPick(body);
  if (!solo.mode) return renderSoloModeSelect(body);
  if (solo.mode === 'B') return renderSoloSuspect(body);
  if (solo.mode === 'C') return renderSoloSoup(body);
  return renderSoloA(body);
}
function clueById(id) {
  for (const r of GAME.rounds) {
    for (const c of [...r.public, ...r.private]) if (c.id === id) return c;
  }
  return null;
}
// ---------- 单人模式A · 对话流破案（NPC气泡 + 旁白 + 证据卡，案件/线索/私聊三页签） ----------
const SOLO_DM = { name: '浮生探长', hue: 210 };
const SOLO_LEADS = ['我有新发现，你看这个——', '报告侦探，这里有些不对劲。', '侦探，注意这个细节——', '刚查到的东西，你过目。', '这个很关键，你看看。', '你看这个，事情没那么简单。'];
function hashStr(s) { return [...s].reduce((a, c) => a + c.charCodeAt(0), 0); }
function soloSpeaker(id) { return GAME.characters[hashStr(id) % GAME.characters.length]; }
function avatarHtml(name, hue) { return `<div class="avatar" style="background:hsl(${hue} 42% 44%)">${esc(name.slice(0, 1))}</div>`; }
function npcRow(c, html) {
  const hue = c.hue != null ? c.hue : hashStr(c.id || c.name) * 47 % 360;
  return `<div class="npc-row">${avatarHtml(c.name, hue)}<div class="npc-col"><div class="npc-name">${esc(c.name)}</div><div class="bubble-npc">${html}</div></div></div>`;
}
function renderSoloA(body) {
  if (!solo.tab) solo.tab = 'case';
  const tabs = el('div', 'solo-tabs');
  [['case', '🗂 案件'], ['clues', '🔎 线索'], ['chat', '💬 私聊']].forEach(([k, label]) => {
    const b = el('button', 'solo-tab' + (solo.tab === k ? ' on' : ''), label);
    b.addEventListener('click', () => { solo.tab = k; renderSolo(); });
    tabs.appendChild(b);
  });
  body.appendChild(tabs);
  const pane = el('div', 'solo-pane');
  body.appendChild(pane);
  if (solo.tab === 'clues') return renderSoloClueTab(pane);
  if (solo.tab === 'chat') return renderSoloChat(pane);
  renderSoloCaseTab(pane);
}
function renderSoloClueTab(pane) {
  const panel = el('div', 'panel');
  const total = GAME.solo.chapters.reduce((a, c) => a + c.clues.length, 0);
  panel.appendChild(el('h3', null, (GAME.genre === 'story' ? '已拾起的记忆' : '已掌握的线索') + `<span class="h-sub">已收集 ${(() => { let k = 0; GAME.solo.chapters.forEach((ch, i) => { if (i <= solo.chapter) k += ch.clues.length; }); return k; })()} / ${total} 条</span>`));
  let n = 0;
  GAME.solo.chapters.forEach((ch, i) => {
    if (i > solo.chapter) return;
    ch.clues.forEach((id) => {
      const c = clueById(id);
      const wrap = el('div', 'clue-wrap');
      wrap.appendChild(renderClueCard(c, GAME.genre === 'story' ? '记忆' : '线索', 'pub'));
      if (!solo.seen.has(id)) { wrap.appendChild(el('span', 'new-badge', '新线索')); solo.seen.add(id); }
      panel.appendChild(wrap);
      n++;
    });
  });
  if (!n) panel.appendChild(el('p', 'hint', '还没有线索，回「案件」推进调查。'));
  pane.appendChild(panel);
}
function renderSoloCaseTab(pane) {
  const stream = el('div', 'solo-stream');
  GAME.solo.chapters.forEach((ch, i) => {
    if (i > solo.chapter) return;
    stream.appendChild(el('div', 'stream-div', esc(ch.title)));
    stream.appendChild(el('div', 'nar-block', esc(ch.brief)));
    ch.clues.forEach((id) => {
      const c = clueById(id);
      const sp = soloSpeaker(c.id);
      const lead = SOLO_LEADS[hashStr(c.id + 'l') % SOLO_LEADS.length];
      stream.appendChild(el('div', null, npcRow(sp, `${lead}<b>《${esc(c.title)}》</b>`)));
      const attach = el('div', 'clue-attach');
      attach.appendChild(renderClueCard(c, GAME.genre === 'story' ? '记忆' : '证物', 'pub'));
      if (solo.seen && !solo.seen.has(c.id)) attach.appendChild(el('span', 'new-badge', '新线索'));
      stream.appendChild(attach);
    });
    if (i < solo.chapter) stream.appendChild(el('div', 'nar-block', '……你把新线索收进证物袋，继续往下查。'));
  });
  const isLast = solo.chapter >= GAME.solo.chapters.length - 1;
  if (isLast && !solo.done) {
    stream.appendChild(el('div', 'stream-div', '最终推理 · 三道谜题'));
    stream.appendChild(el('div', 'nar-block', '所有线索都摆在眼前了。浮生探长敲了敲桌子，提出三个关键问题——'));
    GAME.solo.questions.forEach((q, qi) => {
      stream.appendChild(el('div', null, npcRow(SOLO_DM, `问题${qi + 1}：${esc(q.q)}`)));
      if (solo.answers[qi] === undefined) {
        const opts = el('div', 'q-opts');
        q.options.forEach((opt, oi) => {
          const b = el('button', 'vote-opt', esc(opt));
          b.addEventListener('click', () => { solo.answers[qi] = oi; renderSolo(); });
          opts.appendChild(b);
        });
        stream.appendChild(opts);
      } else {
        const right = solo.answers[qi] === q.answer;
        stream.appendChild(el('div', 'me-row', `<div class="bubble-me">${esc(q.options[solo.answers[qi]])}</div></div>`));
        const fb = el('div', 'dm-feedback', `${right ? '✓ 答对了' : '✗ 答错了'} —— ${esc(q.hints[q.hints.length - 1])}`);
        stream.appendChild(fb);
        if (!right && solo.hints[qi] < 2) {
          const hb = el('button', 'ghost small', `查看提示（${solo.hints[qi] + 1}/2）`);
          hb.addEventListener('click', () => { solo.hints[qi]++; renderSolo(); });
          stream.appendChild(hb);
        }
        if (solo.hints[qi] > 0) stream.appendChild(el('div', 'hint-box', esc(q.hints[solo.hints[qi] - 1])));
      }
    });
  }
  // 自由提问：历史问答 + 提问输入条
  (solo.asks || []).forEach((a) => {
    stream.appendChild(el('div', 'me-row', `<div class="bubble-me">${esc(a.q)}</div>`));
    if (a.who && a.who !== 'dm') {
      const c = GAME.characters.find((x) => x.id === a.who);
      if (c) stream.appendChild(el('div', null, npcRow(c, esc(a.text))));
    } else {
      stream.appendChild(el('div', null, npcRow(SOLO_DM, esc(a.text))));
    }
  });
  // 控制按钮
  const ctrl = el('div', 'stream-ctrl');
  if (!solo.done) {
    if (!isLast) {
      const btn = el('button', 'primary', '继续调查 →');
      btn.addEventListener('click', () => { solo.chapter++; renderSolo(); });
      ctrl.appendChild(btn);
    } else {
      const answered = GAME.solo.questions.every((_, qi) => solo.answers[qi] !== undefined);
      if (answered) {
        const score = GAME.solo.questions.filter((q, qi) => solo.answers[qi] === q.answer).length;
        const fb = el('button', 'primary', '查看完整复盘');
        fb.addEventListener('click', () => { solo.done = true; renderSolo(); });
        ctrl.appendChild(fb);
        ctrl.appendChild(el('p', 'hint', `当前答对 ${score}/3`));
      }
    }
  }
  pane.appendChild(stream);
  if (solo.done) renderSoloVerdict(pane);
  if (ctrl.children.length) pane.appendChild(ctrl);
  // 自由提问输入条（未通关时始终可问）
  if (!solo.done) {
    const askBar = el('div', 'ask-bar');
    const inp = el('input', null);
    inp.placeholder = GAME.genre === 'story' ? '向故事里的人提问…' : '向在场人物提问…';
    inp.maxLength = 60;
    const btn = el('button', 'primary ask-send', '发送');
    const doAsk = () => {
      const q = inp.value.trim();
      if (!q) return;
      inp.value = '';
      if (!solo.asks) solo.asks = [];
      solo.asks.push(askReply(q));
      renderSolo();
    };
    btn.addEventListener('click', doAsk);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAsk(); });
    askBar.appendChild(inp);
    askBar.appendChild(btn);
    pane.appendChild(askBar);
  }
  setTimeout(() => { stream.scrollTop = stream.scrollHeight; }, 0);
}

// ---------- 单人模式 · 人物私聊 ----------
function soloCharReply(ch, input) {
  const t = (ch.chat || []).find((x) => (x.k || []).some((k) => input.includes(k)));
  if (!t) return { text: ch.d || '这个我帮不上你。' };
  if (t.lie) {
    if (solo.found.has(t.clue)) {
      if (!solo.busted[ch.id]) solo.busted[ch.id] = [];
      if (!solo.busted[ch.id].includes(t.label)) solo.busted[ch.id].push(t.label);
      return { text: t.truth };
    }
    if (!solo.lies[ch.id]) solo.lies[ch.id] = {};
    if (!solo.lies[ch.id][t.label]) solo.lies[ch.id][t.label] = t.clue;
    return { text: t.text };
  }
  return { text: t.text };
}
function renderSoloChat(body) {
  const panel = el('div', 'panel');
  panel.appendChild(el('h3', null, '人物私聊 · 当面套话'));
  panel.appendChild(el('p', 'hint', '人物可能对你撒谎——手里握着能戳穿他的证据再去问，他就会改口说真话。问了什么、骗了你什么，结尾复盘都会算账。'));
  const chips = el('div', 'chat-chips');
  GAME.characters.forEach((c) => {
    const chip = el('button', 'chat-chip' + (solo.chatWho === c.id ? ' on' : '') + (solo.asked.has(c.id) ? ' talked' : ''), esc(c.name));
    chip.addEventListener('click', () => { solo.chatWho = c.id; renderSolo(); });
    chips.appendChild(chip);
  });
  panel.appendChild(chips);
  const who = GAME.characters.find((c) => c.id === solo.chatWho);
  if (who) {
    const box = el('div', 'chat-box');
    const thread = el('div', 'chat-thread');
    (solo.chats[who.id] || []).forEach((m) => thread.appendChild(el('div', 'chat-msg ' + m.who, esc(m.text))));
    box.appendChild(thread);
    const quick = el('div', 'chat-quick');
    (who.chat || []).forEach((t) => {
      const qb = el('button', 'ghost small', '问：「' + esc(t.label) + '」');
      qb.addEventListener('click', () => sendSoloChat(who, t.label, thread));
      quick.appendChild(qb);
    });
    box.appendChild(quick);
    const row = el('div', 'chat-input-row');
    const inp = el('input');
    inp.type = 'text'; inp.placeholder = '输入想问的话，如「九点的时候你在哪」「你换了药吗」…';
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && inp.value.trim()) sendSoloChat(who, inp.value.trim(), thread); });
    const send = el('button', 'primary small', '发送');
    send.addEventListener('click', () => { if (inp.value.trim()) sendSoloChat(who, inp.value.trim(), thread); });
    row.appendChild(inp); row.appendChild(send);
    box.appendChild(row);
    panel.appendChild(box);
    setTimeout(() => { thread.scrollTop = thread.scrollHeight; inp.focus(); }, 0);
  }
  body.appendChild(panel);
}
function sendSoloChat(who, text, thread) {
  const reply = soloCharReply(who, text);
  solo.asked.add(who.id);
  if (!solo.chats[who.id]) solo.chats[who.id] = [];
  solo.chats[who.id].push({ who: 'me', text }, { who: 'char', text: reply.text });
  thread.appendChild(el('div', 'chat-msg me', esc(text)));
  const charMsg = el('div', 'chat-msg char', esc(reply.text));
  thread.appendChild(charMsg);
  thread.scrollTop = thread.scrollHeight;
  if (window.speechSynthesis && store.get('jqVoice') !== 'off') {
    try {
      const u = new SpeechSynthesisUtterance(reply.text);
      u.lang = 'zh-CN'; u.rate = 1.05;
      speechSynthesis.speak(u);
    } catch (e) {}
  }
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
      const line = el('div', right ? 'answer-right' : 'answer-wrong', `${right ? '✓ 答对了' : '✗ 答错了'} —— ${esc(q.hints[q.hints.length - 1])}`);
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
  let expGain = 0, rewardGain = 0;
  if (!solo.rewarded) {
    solo.rewarded = true;
    expGain = Math.max(10, Math.round((GAME.exp || 60) * (0.4 + 0.2 * score)));
    rewardGain = score >= 2 ? (GAME.reward || 100) : Math.round((GAME.reward || 100) * 0.3);
    addExp(expGain);
    addReward(rewardGain);
  }
  const panel = el('div', 'panel');
  panel.appendChild(el('div', 'gain-line', `本局收获：⭐ 经验 +${expGain} · 💰 悬赏 +${rewardGain} · 累计经验 ${myExp()}（等级 ${Math.floor(myExp() / 120) + 1}）`));
  // 剧情探索本：无真凶，展示终章与故事复盘
  if (GAME.genre === 'story') {
    const f = GAME.truth.finale || { title: '终章', text: '' };
    panel.appendChild(el('div', 'verdict ' + (score >= 2 ? 'right' : 'wrong'),
      `<h3>${score >= 2 ? '故事圆满收官！' : '故事已读完…'} 理解度 ${score}/3</h3><p><b>${esc(f.title)}</b></p>`));
    panel.appendChild(el('p', null, esc(f.text)));
    panel.appendChild(el('h3', null, '故事脉络复盘'));
    GAME.truth.recap.forEach((s, i) => {
      panel.appendChild(el('div', 'recap-step', `<div class="recap-num">${i + 1}</div><p>${esc(s)}</p>`));
    });
    body.appendChild(panel);
    return;
  }
  const murderer = GAME.characters.find((c) => c.id === GAME.truth.murderer);
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
  // 复盘诊断一：你漏掉了哪些线索
  panel.appendChild(el('h3', null, '你漏掉的线索'));
  const allSoloIds = [];
  GAME.solo.chapters.forEach((c) => c.clues.forEach((id) => { if (!allSoloIds.includes(id)) allSoloIds.push(id); }));
  const missed = allSoloIds.filter((id) => !solo.found.has(id));
  if (!missed.length) {
    panel.appendChild(el('div', 'answer-right', '✓ 一条都没漏——本章所有线索你都亲手查验过了。'));
  } else {
    panel.appendChild(el('p', 'hint', `共 ${missed.length} 条线索你没有查验：`));
    missed.forEach((id) => {
      const c = clueById(id);
      panel.appendChild(el('div', 'relation', `<b>《${esc(c.title)}》（漏看）</b>：${esc(c.text)}`));
    });
  }
  // 复盘诊断二：谁在骗你
  panel.appendChild(el('h3', null, '谁在骗你'));
  const liars = GAME.characters.filter((c) => (c.chat || []).some((t) => t.lie));
  liars.forEach((c) => {
    const lieMap = solo.lies[c.id] || {};
    Object.keys(lieMap).forEach((label) => {
      const clue = clueById(lieMap[label]);
      panel.appendChild(el('div', 'relation',
        `<b>${esc(c.name)}</b> 在「${esc(label)}」上骗了你 —— 能戳穿他的证据是《${esc(clue ? clue.title : lieMap[label])}》${solo.found.has(lieMap[label]) ? '（你已查验）' : '（你从未拿到）'}。真话是：${esc((c.chat.find((t) => t.label === label) || {}).truth || '')}`));
    });
    (solo.busted[c.id] || []).forEach((label) => {
      panel.appendChild(el('div', 'answer-right', `✓ 你握着证据当面质问，${esc(c.name)} 不得不在「${esc(label)}」上说了真话。`));
    });
    if (!solo.asked.has(c.id)) {
      panel.appendChild(el('div', 'relation', `<b>${esc(c.name)}</b>：他对你撒了谎——但你从头到尾没问过他一句。`));
    }
  });
  const chatScore = liars.reduce((n, c) => n + Object.keys(solo.lies[c.id] || {}).length, 0);
  const again = el('button', 'ghost', '重新体验单人模式');
  again.addEventListener('click', startSolo);
  panel.appendChild(again);
  body.appendChild(panel);
}

// ---------- 模式B · 我是嫌疑人（圆谎引擎） ----------
const SUSPECT_OPTS = [
  { label: '咬死原话，绝不松口', delta: 14, tag: '危险' },
  { label: '换个说法，模糊带过', delta: 7, tag: '稳健' },
  { label: '主动抛出无关细节，带偏节奏', delta: 2, tag: '冒险' },
];
function renderSoloSuspect(body) {
  const S = GAME.suspect;
  const role = GAME.characters.find((c) => c.id === S.role);
  const pct = Math.min(100, Math.round((solo.susp / S.burst) * 100));
  const head = el('div', 'panel');
  head.appendChild(el('div', 'solo-brief', esc(S.brief)));
  head.appendChild(el('p', null, `你扮演：<b>${esc(role.name)}</b>（${esc(role.tag)}）　怀疑值：<b>${solo.susp}</b> / ${S.burst}`));
  head.appendChild(el('div', 'susp-bar', `<div class="susp-fill${pct > 60 ? ' hot' : ''}" style="width:${pct}%"></div>`));
  body.appendChild(head);
  const panel = el('div', 'panel');
  if (solo.log.length) {
    panel.appendChild(el('h3', null, '审讯记录'));
    solo.log.forEach((l) => panel.appendChild(el('div', 'relation', `<b>第${l.n}问</b>：${esc(l.q)}<br>你的回答（${esc(l.choice)}，怀疑 +${l.delta}）`)));
  }
  if (solo.over) {
    const map = {
      busted: ['verdict wrong', '🔒 谎言被当场戳穿，怀疑值爆表', S.role],
      caught: ['verdict wrong', '🔒 怀疑值爆表——审讯结束，你被正式逮捕', S.role],
      conf: ['verdict wrong', '🕊 你选择了自首。案子破了，故事也结束了', S.role],
      escape: ['verdict wrong', '🌫 你撑过了全部审讯——案子成了悬案，真凶永远是你', S.role],
      perfect: ['verdict right', '🏆 完美犯罪（隐藏结局）——怀疑值压得极低，连审讯官都开始怀疑自己的判断', S.role],
    }[solo.over];
    panel.appendChild(el('div', map[0], `<h3>${map[1]}</h3><p>真凶 ${esc(role.name)}：${esc(GAME.truth.method)}</p>`));
    const again = el('button', 'ghost', '换一种玩法');
    again.addEventListener('click', startSolo);
    panel.appendChild(again);
    body.appendChild(panel);
    return;
  }
  if (solo.scene >= S.scenes.length) {
    solo.over = solo.susp <= Math.round(S.burst / 2) ? 'perfect' : 'escape';
    renderSolo();
    return;
  }
  const sc = S.scenes[solo.scene];
  panel.appendChild(el('h3', null, `第 ${solo.scene + 1}/${S.scenes.length} 轮审讯`));
  panel.appendChild(el('p', 'solo-q', esc(sc.q)));
  panel.appendChild(el('p', 'hint', `你原本的说法：「${esc(sc.lie)}…」`));
  SUSPECT_OPTS.forEach((o) => {
    const b = el('button', 'vote-opt', `<b>${esc(o.label)}</b><span>${o.tag} · 怀疑 +${o.delta}</span>`);
    b.addEventListener('click', () => {
      solo.susp += o.delta;
      solo.log.push({ n: solo.scene + 1, q: sc.q.slice(0, 24) + '…', choice: o.label, delta: o.delta });
      solo.scene++;
      if (solo.susp >= S.burst) solo.over = 'caught';
      renderSolo();
    });
    panel.appendChild(b);
  });
  const conf = el('button', 'ghost', '压力太大……自首');
  conf.addEventListener('click', () => { solo.over = 'conf'; renderSolo(); });
  panel.appendChild(conf);
  body.appendChild(panel);
}

// ---------- 模式C · 海龟汤 ----------
function soupReply(sp, input) {
  const rule = sp.rules.find((r) => r.k.some((k) => input.includes(k)));
  return rule ? rule.a : '无关';
}
function renderSoloSoup(body) {
  const sp = GAME.soup;
  const panel = el('div', 'panel');
  panel.appendChild(el('h3', null, '海龟汤 · 汤面'));
  panel.appendChild(el('div', 'solo-brief', esc(sp.surface)));
  if (solo.soupDone) {
    panel.appendChild(el('div', solo.soupWin ? 'verdict right' : 'verdict wrong',
      `<h3>${solo.soupWin ? '🎯 汤底揭盅！你说中了核心手法' : '💧 汤底公布'}</h3><p>${esc(sp.truth)}</p>`));
    panel.appendChild(el('p', 'hint', `共提问 ${solo.qa.length} 次，用了 ${solo.soupHints} 条提示。`));
    const again = el('button', 'ghost', '换一种玩法');
    again.addEventListener('click', startSolo);
    panel.appendChild(again);
    body.appendChild(panel);
    return;
  }
  panel.appendChild(el('p', 'hint', '直接输入你的问题，系统只回「是 / 不是 / 无关」。问出核心诡计即通关；卡关可要提示。'));
  const thread = el('div', 'chat-thread');
  solo.qa.forEach((m) => thread.appendChild(el('div', 'chat-msg ' + (m.who === 'me' ? 'me' : 'char'), esc(m.text))));
  panel.appendChild(thread);
  const row = el('div', 'chat-input-row');
  const inp = el('input');
  inp.type = 'text';
  inp.placeholder = '问点什么，如「毒在茶里吗」「凶手是女人吗」…';
  const ask = () => {
    const t = inp.value.trim();
    if (!t) return;
    inp.value = '';
    const win = sp.winK.some((k) => t.includes(k));
    const rep = win ? '🎉 是——汤底揭盅！' : soupReply(sp, t);
    solo.qa.push({ who: 'me', text: t }, { who: 'sys', text: rep });
    if (win) { solo.soupDone = true; solo.soupWin = true; }
    renderSolo();
  };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ask(); });
  const send = el('button', 'primary small', '提问');
  send.addEventListener('click', ask);
  row.appendChild(inp); row.appendChild(send);
  panel.appendChild(row);
  if (solo.soupHints < 3) {
    const hb = el('button', 'ghost small', `要一条提示（${solo.soupHints + 1}/3）`);
    hb.addEventListener('click', () => {
      solo.qa.push({ who: 'sys', text: '💡 提示：' + sp.hints[solo.soupHints] });
      solo.soupHints++;
      renderSolo();
    });
    panel.appendChild(hb);
  }
  const giveup = el('button', 'ghost small', '直接看汤底');
  giveup.addEventListener('click', () => { solo.soupDone = true; solo.soupWin = false; renderSolo(); });
  panel.appendChild(giveup);
  setTimeout(() => { thread.scrollTop = thread.scrollHeight; inp.focus(); }, 0);
  body.appendChild(panel);
}

// ================= 多人模式 =================
function copyFallback(text, done) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;left:-999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    done();
  } catch (e) { alert('房间码：' + text); }
}

// localStorage 安全封装：iOS 隐私模式/部分 webview 直接调用会抛异常
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};

let me = { code: null, pid: null };
let pollTimer = null;

// ---------- 语音提示 ----------
let voiceOn = store.get('jqVoice') !== 'off';
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

// ---------- 背景音乐（Web Audio 程序化氛围乐，零音频文件依赖） ----------
let bgmOn = store.get('jqBgm') !== 'off';
let bgm = null; // { ctx, master, chordTimer, noteTimer, chordIdx }
let bgmStage = 0; // 0 首页/大厅 · 1 搜证 · 2 投票/揭晓
const BGM_CHORDS = [
  [110.0, 130.81, 164.81],  // Am
  [87.31, 110.0, 130.81],   // F
  [130.81, 164.81, 196.0],  // C
  [82.41, 123.47, 164.81],  // E
];
const BGM_BELL = [440.0, 523.25, 587.33, 659.25, 783.99]; // A小调五声音阶
function bgmInit() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  // 雾山风声：循环噪声 + 带通滤波
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buf; noise.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 0.6;
  const ng = ctx.createGain(); ng.gain.value = 0.02;
  noise.connect(bp); bp.connect(ng); ng.connect(master); noise.start();
  return { ctx, master, chordTimer: null, noteTimer: null, chordIdx: 0 };
}
function bgmPadChord(b) {
  const chord = BGM_CHORDS[b.chordIdx++ % BGM_CHORDS.length];
  const t = b.ctx.currentTime, dur = 10;
  chord.forEach((f, i) => {
    [['sine', 0], ['triangle', 4]].forEach(([type, det]) => {
      const o = b.ctx.createOscillator(); o.type = type; o.frequency.value = f + det * 0.4;
      const g = b.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(i === 0 ? 0.055 : 0.032, t + 3.2);
      g.gain.setValueAtTime(i === 0 ? 0.05 : 0.028, t + dur - 3.2);
      g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(g); g.connect(b.master);
      o.start(t); o.stop(t + dur + 0.1);
    });
  });
}
function bgmBell(b) {
  const f = BGM_BELL[Math.floor(Math.random() * BGM_BELL.length)];
  const t = b.ctx.currentTime;
  const o = b.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
  const g = b.ctx.createGain();
  g.gain.setValueAtTime(0.065 * (0.6 + Math.random() * 0.4), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
  o.connect(g); g.connect(b.master); o.start(t); o.stop(t + 2.4);
  const o2 = b.ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f / 2;
  const g2 = b.ctx.createGain();
  g2.gain.setValueAtTime(0.028, t);
  g2.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
  o2.connect(g2); g2.connect(b.master); o2.start(t); o2.stop(t + 3);
}
function bgmBellLoop(b) {
  if (bgm !== b) return;
  bgmBell(b);
  const [min, max] = bgmStage === 2 ? [1800, 3800] : bgmStage === 1 ? [2600, 5200] : [3600, 7000];
  b.noteTimer = setTimeout(() => bgmBellLoop(b), min + Math.random() * (max - min));
}
function bgmStart() {
  if (!bgm) {
    bgm = bgmInit();
    if (!bgm) return;
  }
  if (bgm.ctx.resume) bgm.ctx.resume();
  bgm.master.gain.cancelScheduledValues(bgm.ctx.currentTime);
  bgm.master.gain.setTargetAtTime(bgmStage === 2 ? 0.95 : 0.85, bgm.ctx.currentTime, 1.2);
  if (!bgm.chordTimer) {
    bgmPadChord(bgm);
    bgm.chordTimer = setInterval(() => bgmPadChord(bgm), 9200);
    bgmBellLoop(bgm);
  }
  updateBgmButton();
}
function bgmStop() {
  if (bgm) {
    const b = bgm;
    b.master.gain.setTargetAtTime(0, b.ctx.currentTime, 0.6);
    clearInterval(b.chordTimer); clearTimeout(b.noteTimer);
    bgm = null;
    setTimeout(() => { try { b.ctx.close(); } catch (e) {} }, 12000);
  }
  updateBgmButton();
}
function toggleBgm() {
  bgmOn = !bgmOn;
  store.set('jqBgm', bgmOn ? 'on' : 'off');
  bgmOn ? bgmStart() : bgmStop();
}
function setBgmStage(level) {
  bgmStage = level;
  if (bgm) bgm.master.gain.setTargetAtTime(level === 2 ? 0.95 : 0.85, bgm.ctx.currentTime, 2);
}
function updateBgmButton() {
  const b = document.getElementById('btn-bgm');
  if (!b) return;
  b.classList.toggle('off', !bgmOn);
  b.title = bgmOn ? '关闭背景音乐' : '开启背景音乐';
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


// ---------- 信誉分（按昵称本地存档） ----------
function myRep(name) {
  const n = name || $('#in-name').value.trim() || '无名玩家';
  const v = parseInt(store.get('jqRep_' + n), 10);
  return Number.isFinite(v) ? v : 50;
}
function addRep(name, delta) {
  const cur = parseInt(store.get('jqRep_' + name), 10) || 50;
  store.set('jqRep_' + name, Math.max(0, Math.min(100, cur + delta)));
}
function bindMulti() {
  $('#in-name').addEventListener('input', () => {
    const v = $('#in-name').value.trim();
    $('#my-rep').textContent = v ? `你的信誉分：${myRep(v)}（满分100 · 跳车/挂机/剧透会扣分，指认正确/完整对局会加分）` : '';
  });
  // ---- 侦探联盟式公开房间大厅 ----
  $('#btn-refresh-rooms').addEventListener('click', loadRoomList);
  setInterval(() => {
    const active = document.querySelector('.view.active');
    if (active && active.id === 'view-multi-entry') loadRoomList();
  }, 4000);
  loadRoomList();
  async function loadRoomList() {
  const box = $('#room-list');
  if (!box) return;
  try {
    const r = await (await fetch('/api/rooms')).json();
    box.innerHTML = '';
    if (!r.rooms.length) { box.innerHTML = '<p class="hint">暂时没有等待中的房间——创建一个，把房间码发给好友，或等别人开团。</p>'; return; }
    r.rooms.forEach((room) => {
      const row = el('div', 'room-item');
      row.innerHTML = `<div class="room-info"><b>《${esc(room.scriptTitle)}》</b><span class="room-meta">${esc(room.diffLabel)} · 房主 ${esc(room.host)} · ${room.humans}/${room.target} 人${room.aiFill ? ' · 可AI补位' : ''}</span></div><div class="room-side"><span class="roomcode-inline">${esc(room.code)}</span></div>`;
      const btn = el('button', 'primary small', '加入');
      btn.addEventListener('click', () => quickJoin(room.code));
      row.querySelector('.room-side').appendChild(btn);
      box.appendChild(row);
    });
  } catch (e) {
    box.innerHTML = '<p class="hint">房间列表加载失败，稍后自动重试。</p>';
  }
}
async function quickJoin(code) {
  const name = $('#in-name').value.trim();
  if (!name) return $('#entry-err').textContent = '请先填写昵称，再一键加入';
  const r = await api('/api/join', { code, name, tag: $('#in-tag').value, score: myRep(name) });
  if (r.error) return $('#entry-err').textContent = r.error;
  me = { code: r.code, pid: r.pid };
  enterLobby();
}

$('#btn-create').addEventListener('click', async () => {
    const name = $('#in-name').value.trim();
    if (!name) return $('#entry-err').textContent = '请先填写昵称';
    const r = await api('/api/create', {
      name, scriptId,
      difficulty: $('#in-diff').value,
      aiFill: $('#in-aifill').checked,
      targetPlayers: parseInt($('#in-target').value, 10),
      minScore: parseInt($('#in-minscore').value, 10) || 0,
      tag: $('#in-tag').value,
      score: myRep(name),
    });
    if (r.error) return $('#entry-err').textContent = r.error;
    me = { code: r.code, pid: r.pid };
    enterLobby();
  });
  $('#btn-join').addEventListener('click', async () => {
    const name = $('#in-name').value.trim();
    const code = $('#in-code').value.trim().toUpperCase();
    if (!name || !code) return $('#entry-err').textContent = '请填写昵称和房间码';
    const r = await api('/api/join', { code, name, tag: $('#in-tag').value, score: myRep(name) });
    if (r.error) return $('#entry-err').textContent = r.error;
    me = { code: r.code, pid: r.pid };
    enterLobby();
  });
  $('#btn-copy').addEventListener('click', () => {
    const code = me.code || '';
    const done = () => { $('#btn-copy').textContent = '已复制'; setTimeout(() => ($('#btn-copy').textContent = '复制房间码'), 1200); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(code).then(done).catch(() => copyFallback(code, done));
    } else {
      copyFallback(code, done); // 微信/旧内核 webview 在非 HTTPS 下禁用 clipboard API，走降级
    }
  });
  $('#btn-start').addEventListener('click', async () => {
    const r = await api('/api/start', act());
    if (r.error) alert(r.error);
  });
  $('#btn-leave').addEventListener('click', leaveGame);
  $('#btn-quit').addEventListener('click', leaveGame);
  const bm = $('#btn-manage');
  if (bm) bm.addEventListener('click', () => api('/api/manage', act()));
  $('#chat-send').addEventListener('click', sendChat);
  $('#chat-text').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });
  const vb = $('#btn-voice');
  if (!window.speechSynthesis) {
    // 部分安卓微信 X5 内核不支持语音合成，直接隐藏按钮避免无效功能
    vb.style.display = 'none';
  } else {
    vb.textContent = voiceOn ? '🔊 语音开' : '🔇 语音关';
    vb.addEventListener('click', () => {
      voiceOn = !voiceOn;
      store.set('jqVoice', voiceOn ? 'on' : 'off');
      vb.textContent = voiceOn ? '🔊 语音开' : '🔇 语音关';
      if (voiceOn) say('语音提示已开启');
    });
  }
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
// 微信/手机后台切回时立即刷新一次（后台时浏览器会暂停定时器，回来先补一拍）
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && me.code && pollTimer) poll();
});
async function poll() {
  if (!me.code) return;
  let s;
  try { s = await api(`/api/state?code=${me.code}&pid=${me.pid}`); }
  catch (e) { return; }
  if (s.error) { alert(s.error); leaveGame(); return; }
  if (s.scriptId && s.scriptId !== scriptId) {
    scriptId = s.scriptId;
    GAME = DATA.scripts.find((x) => x.id === scriptId) || GAME;
  }
  if (s.stage === 'lobby') renderLobby(s);
  else renderGame(s);
}
function renderLobby(s) {
  const list = $('#lobby-players');
  $('#lobby-script').textContent = '本局剧本：《' + (s.scriptTitle || GAME.title) + '》';
  list.innerHTML = '';
  s.players.forEach((p) => list.appendChild(el('span', 'player-chip' + (p.isHost ? ' host' : ''), esc(p.name) + (p.isHost ? ' · 房主' : ''))));
  $('#btn-start').style.display = s.you && s.you.isHost ? '' : 'none';
  if (s.you && !s.you.isHost) $('#btn-start').style.display = 'none';
  const lb = $('#lobby-brief');
  if (lb) lb.innerHTML = '<div class="script-detail compact">' + scriptBriefHTML(GAME) + '</div>';
}

let curStage = null;
function renderGame(s) {
  if (curStage !== s.stage) {
    curStage = s.stage;
    setTabByStage(s.stage);
    announceStage(s.stage);
    setBgmStage(['round1', 'round2', 'round3'].includes(s.stage) ? 1 : ['vote', 'reveal'].includes(s.stage) ? 2 : 0);
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
  renderPmPane(s);
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
    <div class="role-secret-tip">守住你的秘密，但记住：真凶要隐藏罪行，无辜者要洗清嫌疑、找出真凶。每人每轮可抽一张私有线索，是否公开由你决定。</div>
    <details class="brief-details"><summary>📖 剧本背景 & 全员人物介绍（随时查看）</summary>${scriptBriefHTML(GAME)}</details>`;
}
function clueCardHtml(c, kindLabel, kindClass) {
  let media = '';
  if (c.img) media += `<img class="clue-img" src="/media/${encodeURIComponent(c.img)}.png" alt="${esc(c.title)}" loading="lazy">`;
  if (c.video) media += `<video class="clue-video" src="/media/${encodeURIComponent(c.video)}.mp4" controls preload="metadata" playsinline webkit-playsinline x5-playsinline x5-video-player-type="h5"></video>`;
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
  const charOf = (name) => {
    const p = s.players.find((x) => x.name === name);
    return p && p.roleIdx != null ? GAME.characters[p.roleIdx] : null;
  };
  s.chat.forEach((m) => {
    if (m.kind === 'sys' || m.kind === 'clue') {
      list.appendChild(el('div', 'chat-notice', esc(m.text)));
      return;
    }
    const isMe = m.name === (s.you && s.you.name);
    const c = charOf(m.name);
    const who = c || { name: m.name, id: m.name };
    const hue = hashStr(who.id || who.name) * 47 % 360;
    const time = new Date(m.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    if (isMe) {
      list.appendChild(el('div', 'me-row chat-row', `<div class="chat-meta">${time}</div><div class="bubble-me">${esc(m.text)}</div>${avatarHtml(who.name, hue)}`));
    } else {
      list.appendChild(el('div', 'npc-row chat-row', `${avatarHtml(who.name, hue)}<div class="npc-col"><div class="npc-name">${esc(m.name)}${c ? ' · ' + esc(c.name) : ''} · ${time}</div><div class="bubble-npc">${esc(m.text)}</div></div>`));
    }
  });
  if (atBottom) list.scrollTop = list.scrollHeight;
}
function renderVotePane(s) {
  const box = $('#vote-panel');
  if (s.stage !== 'vote') { box.innerHTML = ''; return; }
  box.innerHTML = '<h3>指认真凶</h3><p class="hint">结合三轮线索投票。全员投完后，房主可揭晓真相。</p>';
  if (s.voteBlockReason) {
    box.appendChild(el('div', 'answer-wrong', `🔒 ${esc(s.voteBlockReason)}`));
    box.appendChild(el('p', 'hint', `提示：你手上已有 ${s.you ? s.you.keyCount : 0} 条关键线索（带「关键」徽章的线索）。把手里关键线索公开、或等第三轮公共线索，就能解锁投票。`));
  } else if (s.you && s.you.roleIdx != null) {
    box.appendChild(el('div', 'answer-right', `✓ 投票资格已解锁（已掌握 ${s.you.keyCount} 条关键线索）`));
  }
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
  // ---- 结局树 ----
  if (s.reveal.ending) {
    const e = s.reveal.ending;
    box.appendChild(el('div', 'ending-card',
      `<h3>📖 ${esc(e.title)}</h3><p>${esc(e.text)}</p><p class="hint">关键证据公开进度：${e.keyPublic}/${e.keyTotal}${e.id === 'perfect' ? ' —— 神探结局达成！' : e.id === 'escaped' ? ' —— 关键证据没能凑齐，让他走了。' : ''}</p>`));
    // ---- 结算卡 & 信誉分 ----
    if (s.you) {
      const chatCount = s.chat.filter((m) => m.kind === 'chat' && m.name === s.you.name).length;
      const detective = right ? 5 : 0;
      const reliable = 2;
      const drama = Math.min(5, Math.floor(chatCount / 3));
      addRep(s.you.name, detective + reliable);
      store.set('jqClear_' + s.scriptId, '1');
      box.appendChild(el('div', 'panel scorecard',
        `<h3>🧾 本局结算</h3>
         <div class="relation">神探值：${detective ? '+' + detective : '+0'}（${right ? '指认正确' : '指认失误'}）</div>
         <div class="relation">靠谱值：+${reliable}（完整对局）</div>
         <div class="relation">戏精值：${drama ? '+' + drama : '+0'}（发言 ${chatCount} 条）</div>
         <div class="relation">当前信誉分：<b>${myRep(s.you.name)}</b>（按昵称存档，下次开局可用）</div>
         <p class="hint">🏅 本剧本通关徽章已点亮，首页剧本卡可见。</p>`));
    }
  }
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
    sel.value = String({ rookie: 10, adv: 8, hard: 6 }[s.options && s.options.difficulty] || 8);
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
