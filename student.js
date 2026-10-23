/* 学生端：登录 → 仿真桌面 → 作答 → 交卷 */
'use strict';

const Student = (() => {
  const app = $('#studentApp');
  let running = false;          // 计时循环是否工作
  let submitted = false;
  let timerHandle = null;
  let ideWin = null;            // { win, iframe, problemId }
  let winSeq = 0;
  const wins = new Map();       // wid -> {el, taskBtn, title, ico, minimized}

  /* ================= 登录 ================= */
  function show(){
    $('#startScreen').classList.add('hidden');
    $('#studentLogin').classList.remove('hidden');
    const s = Store.getSettings();
    const hasData = localStorage.getItem(Store.K.settings) && localStorage.getItem(Store.K.problems);
    $('#loginExamName').textContent = s.examName || 'CSP-S 复赛模拟考试';
    $('#loginNoData').classList.toggle('hidden', !!hasData);
    $('#loginForm').classList.toggle('hidden', !hasData);
    if (!hasData){ $('#loginStatus').textContent = '等待考试数据…'; return; }
    const st = Store.getState();
    const statusText = { notstarted: '考试尚未开始', running: '考试进行中', ended: '考试已结束' }[st.status] || '';
    let extra = '';
    if (st.status === 'running' && remainingSec() != null) extra = ' · 剩余 ' + fmtClock(remainingSec());
    if (s.startMode === 'scheduled' && s.scheduledAt && st.status === 'notstarted')
      extra = ' · 定时 ' + s.scheduledAt.replace('T', ' ') + ' 开考';
    if (s.startMode === 'manual' && st.status === 'notstarted') extra = ' · 请等待监考老师开始';
    $('#loginStatus').textContent = statusText + extra;
    const prev = Store.getStudent();
    if (prev){ $('#loginName').value = prev.name || ''; $('#loginId').value = prev.id || ''; }
    if (!Store.fs.supported) $('#loginFolderRow').classList.add('hidden');
    // 本机没有配置时，尝试从已授权的考试文件夹静默读取（管理员在同一浏览器授权过）
    if (!hasData) trySilentFolderLoad();
  }
  async function trySilentFolderLoad(){
    try{
      const r = await Store.fs.restore();
      if (r !== 'granted') return;
      const data = await Store.fs.readExamData();
      if (!data) return;
      if (data.settings) Store.saveSettings(Object.assign(Store.getSettings(), data.settings));
      if (data.problems && data.problems.length) Store.saveProblems(data.problems);
      if (data.state) Store.saveState(data.state);
      toast('已从考试文件夹同步配置', 'ok');
      show(); // 重新渲染登录页
    }catch(e){ /* 静默失败 */ }
  }
  $('#loginForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('#loginName').value.trim();
    const sid = $('#loginId').value.trim();
    if (!name || !sid){ toast('请填写姓名和准考证号', 'err'); return; }
    Store.saveStudent({ name, id: sid });
    tryFullscreen();
    enterDesktop();
  });
  function tryFullscreen(){
    const elx = document.documentElement;
    if (elx.requestFullscreen) elx.requestFullscreen().catch(() => {});
  }
  $('#btnLoginExit').onclick = () => {
    $('#studentLogin').classList.add('hidden');
    $('#startScreen').classList.remove('hidden');
  };
  $('#btnEndBack').onclick = () => {
    app.classList.add('hidden');
    $('#sEndOverlay').classList.add('hidden');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    showStartAgain();
  };
  function showStartAgain(){
    $('#startScreen').classList.remove('hidden');
    running = false;
    if (timerHandle){ clearInterval(timerHandle); timerHandle = null; }
  }

  /* 登录页导入考试数据 */
  $('#loginImportPack').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try{
      const data = JSON.parse(await f.text());
      if (!data || !Array.isArray(data.problems)) throw new Error('不是有效的考试包文件');
      if (data.settings) Store.saveSettings(Object.assign(Store.getSettings(), data.settings));
      if (data.state) Store.saveState(data.state);
      Store.saveProblems(data.problems);
      toast('考试数据导入成功', 'ok');
      show();
    }catch(err){ toast('导入失败：' + (err.message || err), 'err'); }
  });
  $('#loginPickFolder').addEventListener('change', () => {});
  $('#loginPickFolder').addEventListener('click', async e => {
    e.preventDefault();
    if (!Store.fs.supported){ toast('当前浏览器不支持文件夹访问，请使用 Chrome / Edge 或导入考试包', 'err'); return; }
    try{
      const h = await window.showDirectoryPicker({ id: 'csp-exam', mode: 'read' });
      const read = async path => {
        const fh = await h.getFileHandle(path);
        const file = await fh.getFile();
        return file.text();
      };
      const settings = JSON.parse(await read('settings.json'));
      const problems = JSON.parse(await read('problems.json'));
      let state = null;
      try{ state = JSON.parse(await read('state.json')); }catch(_){}
      Store.saveSettings(Object.assign(Store.getSettings(), settings));
      if (problems && problems.length) Store.saveProblems(problems);
      if (state) Store.saveState(state);
      toast('已从文件夹「' + h.name + '」读取考试数据', 'ok');
      show();
    }catch(err){
      if (err && err.name === 'AbortError') return;
      toast('读取考试文件夹失败：' + (err.message || err), 'err');
    }
  });

  /* ================= 进入桌面 ================= */
  function enterDesktop(){
    const st = Store.getState();
    const s = Store.getSettings();
    if (st.status === 'ended'){ showEnded('考试已结束', '本场考试已结束。'); return; }
    if (st.status === 'notstarted'){
      if (s.startMode === 'auto'){
        Store.saveState({ status: 'running', startedAt: Date.now() });
      } else if (s.startMode === 'scheduled' && s.scheduledAt){
        const startTs = new Date(s.scheduledAt).getTime();
        if (Date.now() >= startTs){
          Store.saveState({ status: 'running', startedAt: startTs });
        } else {
          showWaiting(startTs);
          return;
        }
      } else { // manual
        showWaiting(null);
        return;
      }
    }
    bootDesktop();
  }
  function showWaiting(startTs){
    app.classList.remove('hidden');
    $('#studentLogin').classList.add('hidden');
    $('#sWaitOverlay').classList.remove('hidden');
    const tick = () => {
      const st = Store.getState();
      if (st.status === 'running'){
        $('#sWaitOverlay').classList.add('hidden');
        clearInterval(waitHandle);
        bootDesktop();
        return;
      }
      if (st.status === 'ended'){
        $('#sWaitOverlay').classList.add('hidden');
        clearInterval(waitHandle);
        showEnded('考试已结束', '本场考试在等待开始期间被结束。');
        return;
      }
      if (startTs){
        const left = startTs - Date.now();
        $('#waitCount').textContent = left > 0 ? fmtClock(left / 1000) : '';
        if (left <= 0){
          Store.saveState({ status: 'running', startedAt: startTs });
          $('#sWaitOverlay').classList.add('hidden');
          clearInterval(waitHandle);
          bootDesktop();
        }
      }
    };
    const waitHandle = setInterval(tick, 500);
    tick();
  }

  function bootDesktop(){
    submitted = Store.getStudentState().submitted || false;
    if (submitted){ showEnded('已交卷', '你已在之前提交了试卷。'); return; }
    app.classList.remove('hidden');
    $('#studentLogin').classList.add('hidden');
    $('#sWaitOverlay').classList.add('hidden');
    const s = Store.getSettings();
    $('#sExamTag').textContent = s.examName || 'CSP-S 模拟考';
    buildIcons();
    renderWatermark();
    if (timerHandle) clearInterval(timerHandle);
    timerHandle = setInterval(tick, 1000);
    tick();
    window.addEventListener('beforeunload', guardUnload);
  }
  function guardUnload(e){
    if (submitted) return undefined;
    e.preventDefault();
    e.returnValue = '';
    return '';
  }

  /* ================= 图标 ================= */
  function buildIcons(){
    const desk = $('#sDesktop');
    desk.innerHTML = '';
    const problems = enabledProblems();
    problems.forEach((p, i) => {
      desk.appendChild(makeIcon('📦', p.id + '.zip', () => openZip(p), i));
    });
    desk.appendChild(makeIcon('🖥️', '编辑器', () => openIDE(), 'ide'));
    desk.appendChild(makeIcon('⬛', '终端', () => openTerminal(), 'term'));
    desk.appendChild(makeIcon('📄', '考试须知.txt', () => openNotice(), 'notice'));
    desk.appendChild(makeIcon('📤', '提交试卷', () => openSubmit(), 'submit'));
  }
  function enabledProblems(){
    return Store.resolveProblems(Store.getProblems() || []).filter(p => p.enabled);
  }
  function makeIcon(ico, label, onOpen, key){
    const d = el('div', 's-icon',
      '<span class="ico' + (ico === '📦' ? ' ico-zip' : '') + '">' + ico + '</span><span class="lbl">' + esc(label) + '</span>');
    d.dataset.key = String(key);
    d.addEventListener('click', () => {
      $$('.s-icon').forEach(x => x.classList.remove('selected'));
      d.classList.add('selected');
    });
    d.addEventListener('dblclick', onOpen);
    return d;
  }
  function renderWatermark(){
    const s = Store.getSettings();
    const stu = Store.getStudent() || {};
    const wm = $('#sWatermark');
    if (!s.watermark){ wm.classList.add('hidden'); return; }
    wm.classList.remove('hidden');
    const text = stu.id + ' ' + stu.name;
    let out = '';
    for (let r = 0; r < 10; r++){
      let line = '';
      for (let c = 0; c < 6; c++) line += text + '　　　';
      out += line + '\n';
    }
    wm.textContent = out;
  }

  /* ================= 窗口管理器 ================= */
  function createWindow(opts){
    // opts: {id?, title, ico, w, h, onClose}
    if (opts.id){
      const ex = [...wins.values()].find(w => w.id === opts.id);
      if (ex){ focusWin(ex); if (ex.minimized) toggleMin(ex); return ex; }
    }
    const wid = 'w' + (++winSeq);
    const win = el('div', 's-win focused');
    const dw = $('#sDesktop');
    const W = Math.min(opts.w || 720, dw.clientWidth - 40);
    const H = Math.min(opts.h || 520, dw.clientHeight - 40);
    const off = (wins.size % 6) * 26;
    win.style.width = W + 'px';
    win.style.height = H + 'px';
    win.style.left = Math.max(10, (dw.clientWidth - W) / 2 - 60 + off) + 'px';
    win.style.top = Math.max(10, (dw.clientHeight - H) / 2 - 40 + off) + 'px';
    const head = el('div', 's-win-head',
      '<span class="win-ico">' + (opts.ico || 'WINDOW') + '</span><span class="win-title">' + esc(opts.title) + '</span>');
    const bMin = el('button', 'win-btn', '—');
    const bX = el('button', 'win-btn close', '✕');
    head.appendChild(bMin); head.appendChild(bX);
    const body = el('div', 's-win-body');
    win.appendChild(head); win.appendChild(body);
    $('#sDesktop').appendChild(win);

    const rec = { id: opts.id || wid, el: win, head, body, title: opts.title, ico: opts.ico, minimized: false, onClose: opts.onClose };
    wins.set(wid, rec);

    const taskBtn = el('button', 's-taskbtn active', (opts.ico ? opts.ico + ' ' : '') + opts.title);
    taskBtn.onclick = () => {
      if (rec.minimized){ toggleMin(rec); focusWin(rec); }
      else if (win.classList.contains('focused')) toggleMin(rec);
      else focusWin(rec);
    };
    $('#sTaskWins').appendChild(taskBtn);
    rec.taskBtn = taskBtn;

    win.addEventListener('mousedown', () => focusWin(rec));
    bX.onclick = e => { e.stopPropagation(); closeWin(rec); };
    bMin.onclick = e => { e.stopPropagation(); toggleMin(rec); };
    dragify(head, win);
    focusWin(rec);
    return rec;
  }
  function focusWin(rec){
    wins.forEach(w => { w.el.classList.remove('focused'); w.taskBtn.classList.remove('active'); });
    rec.el.classList.add('focused');
    rec.taskBtn.classList.add('active');
  }
  function closeWin(rec){
    if (rec.onClose){ try{ rec.onClose(); }catch(e){} }
    rec.el.remove();
    rec.taskBtn.remove();
    for (const [k, w] of wins){ if (w === rec){ wins.delete(k); break; } }
  }
  function toggleMin(rec){
    rec.minimized = !rec.minimized;
    rec.el.style.display = rec.minimized ? 'none' : 'flex';
  }
  function dragify(head, win){
    let sx, sy, ox, oy, on = false;
    head.addEventListener('mousedown', e => {
      if (e.target.closest('.win-btn')) return;
      on = true; sx = e.clientX; sy = e.clientY;
      ox = win.offsetLeft; oy = win.offsetTop;
      e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
      if (!on) return;
      win.style.left = Math.max(-80, ox + e.clientX - sx) + 'px';
      win.style.top = Math.max(0, oy + e.clientY - sy) + 'px';
    });
    window.addEventListener('mouseup', () => { on = false; });
  }
  function closeAllWins(){
    for (const [, w] of [...wins]){ closeWin(w); }
    $('#sTaskWins').innerHTML = '';
    ideWin = null;
  }

  /* ================= 各类窗口 ================= */
  /* --- 题目 zip --- */
  function openZip(p){
    const win = createWindow({ id: 'zip:' + p.id, title: p.id + '.zip — 压缩包查看器', ico: '📦', w: 620, h: 420 });
    const list = el('div', 'zip-list');
    const stmtRow = el('div', 'zip-row', '<span class="zi">📕</span><span class="zname">' + esc(p.id) + '.pdf</span><span class="zmeta">题面</span>');
    stmtRow.ondblclick = () => openStatement(p);
    stmtRow.onclick = () => { [...list.children].forEach(c => c.style.background = ''); stmtRow.style.background = '#dbe7f7'; };
    list.appendChild(stmtRow);

    const samples = p.tests.map((t, i) => ({ t, i })).filter(x => x.t.sample);
    const dirRow = el('div', 'zip-row', '<span class="zi">📂</span><span class="zname zdir">' + esc(p.id) + '/</span><span class="zmeta">' + samples.length + ' 组样例数据</span>');
    list.appendChild(dirRow);
    samples.forEach(({ t, i }) => {
      [['.in', t.input, '输入'], ['.out', t.expected, '输出']].forEach(([ext, content, kind]) => {
        const r = el('div', 'zip-row', '<span class="zi">📄</span><span class="zname">' + esc(p.id) + (i + 1) + ext + '</span><span class="zmeta">样例' + (i + 1) + ' ' + kind + '</span>');
        r.style.paddingLeft = '34px';
        r.ondblclick = () => openText(p.id + (i + 1) + ext, content);
        list.appendChild(r);
      });
    });
    win.body.appendChild(list);
  }
  function openText(name, content){
    const win = createWindow({ title: name, ico: '📄', w: 560, h: 380 });
    const pre = el('div', 'txt-view');
    pre.textContent = content;
    win.body.appendChild(pre);
  }
  function openStatement(p){
    const win = createWindow({ id: 'stmt:' + p.id, title: p.id + '.pdf — PDF 阅读器', ico: '📕', w: 900, h: 640 });
    const bar = el('div', 'pdf-bar', '<span class="pdf-name">' + esc(p.id) + '.pdf</span><span>·</span><span>第 1/1 页</span><span style="margin-left:auto">CSP-S 模拟考题面</span>');
    const bodyEl = el('div', 'pdf-body');
    const st = p.statement || { type: 'text', data: '' };
    if (st.type === 'pdf'){
      const f = el('iframe');
      f.src = st.data;
      bodyEl.appendChild(f);
    } else if (st.type === 'html'){
      bodyEl.innerHTML = '<div class="prob-doc">' + st.data + '</div>';
    } else {
      bodyEl.innerHTML = '<div class="prob-doc"><h2>' + esc(p.title) + '</h2><pre style="white-space:pre-wrap;font:13px/1.7 Consolas,monospace">' + esc(st.data) + '</pre></div>';
    }
    win.body.appendChild(bar);
    win.body.appendChild(bodyEl);
  }

  /* --- IDE --- */
  function openIDE(preferId){
    const problems = enabledProblems();
    if (!problems.length){ toast('管理员未启用任何题目', 'err'); return; }
    const win = createWindow({ id: 'ide', title: '编辑器 — NOI Linux', ico: '🖥️', w: 1080, h: 700, onClose(){ ideWin = null; } });
    const bar = el('div', 'ide-bar');
    bar.innerHTML = '<span>当前题目</span>';
    const sel = el('select');
    problems.forEach(p => {
      const o = el('option', '', esc(p.id) + ' — ' + esc(p.title));
      o.value = p.id;
      sel.appendChild(o);
    });
    if (preferId) sel.value = preferId;
    const dot = el('span', 'save-dot', '');
    bar.appendChild(sel);
    bar.appendChild(dot);
    win.body.appendChild(bar);
    const frame = el('iframe', 'ide-frame');
    frame.src = 'ide.html';
    win.body.appendChild(frame);

    ideWin = { win, frame, problemId: sel.value, ready: false, pendingCode: null };
    const s = Store.getSettings();

    function loadCurrent(){
      const p = problems.find(x => x.id === ideWin.problemId);
      if (!p) return;
      const code = Store.getCode(p.id);
      postIDE({ type: 'ide:setCode', code });
      postIDE({
        type: 'ide:setJudge',
        cases: (p.tests || []).map(t => ({ input: t.input, expected: t.expected })),
        tl: p.tl || 1000,
      });
      dot.textContent = '已载入 ' + p.id + '（' + (code ? '已有代码' : '新文件') + '）';
    }
    sel.onchange = () => {
      // 切题前先保存当前代码
      postIDE({ type: 'ide:getCode' });
      setTimeout(() => {
        ideWin.problemId = sel.value;
        loadCurrent();
      }, 60);
    };
    ideWin.loadCurrent = loadCurrent;

    frame.addEventListener('load', () => {
      postIDE({ type: 'ide:config', showJudge: s.allowJudge !== false, allowCopy: s.allowCopy !== false });
      // 等编辑器内部脚本初始化完
      setTimeout(() => { ideWin.ready = true; loadCurrent(); }, 400);
    });
    setTimeout(() => { if (ideWin && !ideWin.ready){ ideWin.ready = true; loadCurrent(); } }, 1500);
  }
  function postIDE(msg){
    try{ ideWin && ideWin.frame.contentWindow.postMessage(msg, '*'); }catch(e){}
  }
  window.addEventListener('message', ev => {
    const d = ev.data;
    if (!d || d.type !== 'ide:code') return;
    if (!ideWin) return;
    const pid = ideWin.problemId;
    if (pid){
      Store.saveCode(pid, d.code);
      const dot = ideWin.win.body.querySelector('.save-dot');
      if (dot) dot.textContent = pid + '.cpp 已自动保存 · ' + fmtSize(d.code.length);
    }
  });

  /* --- 终端 --- */
  function openTerminal(){
    const win = createWindow({ title: '终端 — NOI Linux', ico: '⬛', w: 700, h: 440 });
    const out = el('div', 'term');
    const row = el('div', 'term-input-row', '<span class="prompt">student@noi:~$</span>');
    const inp = el('input');
    inp.autocomplete = 'off'; inp.spellcheck = false;
    row.appendChild(inp);
    win.body.appendChild(out);
    win.body.appendChild(row);
    const stu = Store.getStudent() || {};
    const hist = [];
    let hi = -1;
    const write = t => { out.textContent += t + '\n'; out.scrollTop = out.scrollHeight; };
    write('NOI Linux 2.0 (CSP-S 模拟环境)  — 输入 help 查看可用命令');
    const files = () => enabledProblems().map(p => p.id + '.zip').concat(['IDE', '考试须知.txt']);
    const CMDS = {
      help(){ write('可用命令: ls  cat <文件>  whoami  date  uname  echo <文本>  clear  exit'); },
      ls(){ write(files().join('  ')); },
      whoami(){ write(stu.id ? stu.id + ' (' + stu.name + ')' : 'student'); },
      date(){ write(new Date().toString()); },
      uname(){ write('NOI Linux 2.0 x86_64 (模拟)'); },
      echo(a){ write(a.join(' ')); },
      clear(){ out.textContent = ''; },
      exit(){ closeWin(win); },
      cat(a){
        const f = (a[0] || '').toLowerCase();
        const p = enabledProblems().find(x => f === x.id + '.zip');
        if (p) write('(压缩包) ' + p.id + '.zip — 请双击桌面图标查看，内含 ' + p.id + '.pdf 题面');
        else if (f === '考试须知.txt') openNotice();
        else write('cat: ' + (a[0] || '') + ': 没有那个文件或目录');
      },
    };
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter'){
        const line = inp.value.trim();
        inp.value = '';
        write('student@noi:~$ ' + line);
        if (!line) return;
        hist.push(line); hi = hist.length;
        const [cmd, ...args] = line.split(/\s+/);
        const fn = CMDS[cmd.toLowerCase()];
        if (fn) fn(args);
        else write(cmd + ': 未找到命令');
      } else if (e.key === 'ArrowUp'){
        if (hi > 0){ hi--; inp.value = hist[hi] || ''; }
        e.preventDefault();
      } else if (e.key === 'ArrowDown'){
        if (hi < hist.length){ hi++; inp.value = hist[hi] || ''; }
        e.preventDefault();
      }
    });
    win.body.addEventListener('mousedown', e => { if (!e.target.closest('input')) inp.focus(); });
    setTimeout(() => inp.focus(), 50);
  }

  /* --- 考试须知 --- */
  function openNotice(){
    const s = Store.getSettings();
    const st = Store.getState();
    const problems = enabledProblems();
    let info = '考试名称：' + s.examName + '\n考试时长：' + s.durationMin + ' 分钟\n\n';
    if (st.startedAt) info += '开考时间：' + fmtTime(st.startedAt) + '\n剩余时间：' + fmtClock(remainingSec()) + '\n\n';
    info += '本题卷共 ' + problems.length + ' 题：\n' + problems.map((p, i) => '  ' + String(i + 1).padStart(2) + '. ' + p.id + '  ' + p.title).join('\n') +
      '\n\n每题桌面上的 <题名>.zip 内含题面 PDF 与样例数据。\n在 IDE 中作答，代码会自动保存；交卷前请确认各题代码已保存。\n\n—— 考试须知 ——\n' + (s.notice || '');
    const win = createWindow({ title: '考试须知.txt — 记事本', ico: '📄', w: 640, h: 480 });
    const pre = el('div', 'txt-view');
    pre.textContent = info;
    win.body.appendChild(pre);
  }

  /* --- 提交试卷 --- */
  function openSubmit(){
    const win = createWindow({ id: 'submit', title: '提交试卷', ico: '📤', w: 660, h: 480 });
    const pane = el('div', 'submit-pane');
    const problems = enabledProblems();
    const codes = Store.getCodes();
    const tbl = el('table', 'submit-table');
    tbl.innerHTML = '<thead><tr><th>题目</th><th>状态</th><th>代码大小</th></tr></thead>';
    const tb = el('tbody');
    problems.forEach(p => {
      const code = codes[p.id] || '';
      const tr = el('tr');
      tr.innerHTML = '<td><b>' + esc(p.id) + '</b> ' + esc(p.title) + '</td>' +
        '<td class="' + (code ? 'tag-ok' : 'tag-no') + '">' + (code ? '✓ 已保存' : '✗ 未作答') + '</td>' +
        '<td>' + (code ? fmtSize(code.length) : '—') + '</td>';
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    pane.appendChild(el('h4', '', '确认作答情况'));
    pane.appendChild(tbl);
    pane.appendChild(el('div', 'submit-warn',
      '交卷后将锁定考试环境，不能再作答。未保存的代码不会提交。请先在 IDE 中检查各题代码是否完整。'));
    const btn = el('button', 'btn btn-primary', '确认交卷');
    btn.onclick = () => {
      if (!confirm('确认交卷？交卷后无法继续作答。')) return;
      doSubmit('学生主动交卷');
      closeWin(win);
    };
    pane.appendChild(btn);
    win.body.appendChild(pane);
  }

  /* ================= 计时 / 交卷 ================= */
  function remainingSec(){
    const st = Store.getState();
    if (st.status !== 'running' || !st.startedAt) return null;
    const dur = (Store.getSettings().durationMin || 230) * 60;
    return Math.max(0, dur - (Date.now() - st.startedAt) / 1000);
  }
  function tick(){
    if (!app.classList.contains('hidden') && !submitted){
      // 管理员可能提前结束考试
      const st = Store.getState();
      if (st.status === 'ended'){ doSubmit('考试结束（管理员结束）'); return; }
      const left = remainingSec();
      const remainEl = $('#sRemain');
      if (left == null){ remainEl.textContent = '--:--:--'; return; }
      remainEl.textContent = '剩余 ' + fmtClock(left);
      remainEl.classList.toggle('warn', left <= 600 && left > 300);
      remainEl.classList.toggle('crit', left <= 300);
      if (left <= 0){ doSubmit('考试时间结束，自动交卷'); return; }
    }
    const d = new Date();
    $('#sClock').textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function doSubmit(reason){
    if (submitted) return;
    submitted = true;
    if (timerHandle){ clearInterval(timerHandle); timerHandle = null; }
    window.removeEventListener('beforeunload', guardUnload);
    const problems = enabledProblems();
    const codes = Store.getCodes();
    const stu = Store.getStudent() || {};
    const list = [];
    problems.forEach(p => {
      const code = codes[p.id] || '';
      if (!code) return;
      list.push({ time: Date.now(), name: stu.name || '', sid: stu.id || '', problemId: p.id, code });
    });
    if (list.length) Store.addSubmissions(list);
    Store.saveState(Object.assign(Store.getState(), { status: 'ended', endedAt: Date.now() }));
    Store.saveStudentState({ submitted: true, submittedAt: Date.now(), reason });
    (async () => {
      let saved = 0;
      for (const s of list){
        try{ if (await Store.fs.saveSubmission(stu.name, s.problemId, s.code)) saved++; }catch(e){}
      }
      showEnded('交卷成功',
        '提交了 ' + list.length + ' 道题的源代码' + (Store.fs.granted ? '，并已写入考试文件夹（' + saved + ' 个文件）' : '。') +
        '\n原因：' + reason, list);
    })();
    closeAllWins();
  }
  function showEnded(title, text, list){
    app.classList.remove('hidden');
    $('#sWaitOverlay').classList.add('hidden');
    $('#sEndOverlay').classList.remove('hidden');
    $('#endTitle').textContent = title;
    $('#endText').textContent = text;
    const rc = $('#endReceipt');
    if (list && list.length){
      rc.classList.remove('hidden');
      rc.innerHTML = '<b>提交回执</b><br>' + list.map(s =>
        '✓ ' + esc(s.problemId) + '.cpp　' + fmtSize(s.code.length)).join('<br>');
    } else rc.classList.add('hidden');
  }
  window.addEventListener('beforeunload', () => {
    if (!app.classList.contains('hidden') && !submitted){ /* guardUnload 已挂 */ }
  });

  return { show };
})();

/* ================= 入口 ================= */
$('#btnEnterAdmin').onclick = () => Admin.show();
$('#btnEnterStudent').onclick = () => Student.show();
