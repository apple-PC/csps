/* 学生端：登录 → NOI Linux 仿真桌面 → 作答 → 交卷 */
'use strict';

/* ══════════════════════════════════════════════════════════════
   编译器桥：借用 ide.html 的 VM 做「真编译、真运行」
   —— 无论 IDE 窗口是否打开，都能在终端里 g++ / ./a.out
   ══════════════════════════════════════════════════════════════ */
const Compiler = (() => {
  let frame = null, ready = false, seq = 0;
  const waiting = new Map();

  function ensure(){
    if (!frame){
      frame = document.createElement('iframe');
      frame.className = 'ide-offscreen';
      frame.title = 'offline-compiler';
      frame.src = 'ide.html';
      document.body.appendChild(frame);
    }
    return new Promise(resolve => {
      const t0 = Date.now();
      (function poll(){
        if (ready) return resolve(true);
        if (Date.now() - t0 > 9000) return resolve(false);
        setTimeout(poll, 60);
      })();
    });
  }

  async function ask(op, payload, timeout){
    const ok = await ensure();
    if (!ok || !ready) throw new Error('编译器未就绪（ide.html 加载失败）');
    const id = 'r' + (++seq);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiting.delete(id);
        reject(new Error('运行超时'));
      }, timeout || 20000);
      waiting.set(id, { resolve, reject, timer });
      try { frame.contentWindow.postMessage(Object.assign({ type: 'ide:req', id, op }, payload), '*'); }
      catch (e){ clearTimeout(timer); waiting.delete(id); reject(e); }
    });
  }

  window.addEventListener('message', ev => {
    const d = ev.data;
    if (!d) return;
    if (d.type === 'ide:ready'){ ready = true; return; }
    if (d.type !== 'ide:res') return;
    const w = waiting.get(d.id);
    if (!w) return;
    waiting.delete(d.id);
    clearTimeout(w.timer);
    if (d.ok) w.resolve(d.data);
    else w.reject(Object.assign(new Error(d.error || '编译错误'), { phase: d.phase }));
  });

  return { ask, ensure };
})();

const Student = (() => {
  const appEl = () => $('#studentApp');
  let submitted = false;
  let timerHandle = null;
  let ideWin = null;
  let termSeq = 0;
  let stackLimit = 8192;       // KB，ulimit -s

  const createWindow = o => Desktop.createWindow(o);
  const closeWin = r => Desktop.closeWin(r);
  const closeAllWins = () => Desktop.closeAllWins();

  /* ================= 登录 ================= */
  async function show(){
    $('#startScreen').classList.add('hidden');
    $('#studentLogin').classList.remove('hidden');
    const hasLocal = localStorage.getItem(Store.K.settings) && localStorage.getItem(Store.K.problems);
    if (!hasLocal) { try { await Store.initRemote(); } catch (e) {} }
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
      show();
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
    appEl().classList.add('hidden');
    $('#sEndOverlay').classList.add('hidden');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    showStartAgain();
  };
  function showStartAgain(){
    $('#startScreen').classList.remove('hidden');
    if (timerHandle){ clearInterval(timerHandle); timerHandle = null; }
  }

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
      const read = async path => (await (await h.getFileHandle(path)).getFile()).text();
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
  async function enterDesktop(){
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
        } else { showWaiting(startTs); return; }
      } else { showWaiting(null); return; }
    }
    try { await loadHiddenTests(); } catch (e) {}
    showLoading('正在初始化考试桌面…', { percent: 100, detail: '启动 GNOME Flashback · 挂载考试目录' });
    await nextFrame();
    hideLoading();
    bootDesktop();
  }

  const TESTS_FILE = 'problem-tests.js';
  const TESTS_SIZE_HINT = 860 * 1024;
  let _testsMerged = false;

  function fmtKB(n){ return Math.round(n / 1024); }

  function fetchWithProgress(url, onProgress){
    return fetch(url, { cache: 'default' }).then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const total = Math.max(Number(res.headers.get('content-length') || 0) || 0, TESTS_SIZE_HINT);
      if (!res.body || typeof res.body.getReader !== 'function') return res.text();
      const reader = res.body.getReader();
      const chunks = [];
      let got = 0;
      onProgress(got, total);
      return (function pump(){
        return reader.read().then(r => {
          if (r.done){
            onProgress(got, total);
            const buf = new Uint8Array(got);
            let off = 0;
            for (let i = 0; i < chunks.length; i++){ buf.set(chunks[i], off); off += chunks[i].length; }
            return new TextDecoder('utf-8').decode(buf);
          }
          chunks.push(r.value);
          got += r.value.length;
          onProgress(got, total);
          return pump();
        });
      })();
    });
  }
  function execScript(code){
    const sc = document.createElement('script');
    sc.textContent = code;
    document.head.appendChild(sc);
  }
  function loadByScriptTag(){
    return new Promise(resolve => {
      showLoading('正在加载评测数据…', { indeterminate: true, detail: '正在加载：' + TESTS_FILE + '（浏览器未提供进度）' });
      const sc = document.createElement('script');
      sc.src = TESTS_FILE;
      sc.onload = () => resolve();
      sc.onerror = () => resolve();
      document.head.appendChild(sc);
    });
  }
  async function loadHiddenTests(){
    if (_testsMerged || window.BUILTIN_HIDDEN_TESTS){ mergeHidden(); return; }
    showLoading('正在连接评测数据…', { percent: 2, detail: '准备下载：' + TESTS_FILE });
    await nextFrame();
    let code = null;
    try{
      code = await fetchWithProgress(TESTS_FILE, (got, total) => {
        const pct = Math.min(79, 4 + Math.floor(got / total * 76));
        showLoading('正在下载评测数据…', { percent: pct, detail: '正在下载：' + TESTS_FILE + ' · 已接收 ' + fmtKB(got) + ' KB' });
      });
    }catch(e){
      await loadByScriptTag();
      mergeHidden();
      return;
    }
    showLoading('正在解析测试点…', { percent: 86, detail: '解析：' + TESTS_FILE + ' · ' + fmtKB(code.length) + ' KB 源码' });
    await nextFrame();
    try { execScript(code); }
    catch (e) { await loadByScriptTag(); }
    showLoading('正在合并到题库…', { percent: 96, detail: '合并测试点数据 → 内置题库' });
    await nextFrame();
    mergeHidden();
    showLoading('评测数据就绪', { percent: 99, detail: '共 ' + countHidden() + ' 个隐藏测试点' });
    await nextFrame();
  }
  function countHidden(){
    const H = window.BUILTIN_HIDDEN_TESTS || {};
    let n = 0;
    for (const k in H) n += H[k].length;
    return n;
  }
  function mergeHidden(){
    if (!window.BUILTIN_HIDDEN_TESTS || _testsMerged) return;
    for (const p of window.BUILTIN_PROBLEMS){
      const hid = window.BUILTIN_HIDDEN_TESTS[p.id];
      if (hid && hid.length){
        const sampleN = p.tests.filter(t => t.sample).length;
        if (p.tests.length === sampleN) p.tests = p.tests.concat(hid);
      }
    }
    _testsMerged = true;
  }
  function showWaiting(startTs){
    appEl().classList.remove('hidden');
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
    appEl().classList.remove('hidden');
    $('#studentLogin').classList.add('hidden');
    $('#sWaitOverlay').classList.add('hidden');
    const s = Store.getSettings();
    $('#sExamTag').textContent = s.examName || 'NOI Linux 2.0';
    $('#sExamTag').title = 'NOI Linux 2.0 · ' + (s.examName || 'CSP-S 模拟考');

    const sid = mountFs();
    Desktop.mount();
    registerApps();
    buildDesktopIcons(sid);
    renderWatermark();
    bindHotkeys();

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

  function bindHotkeys(){
    if (bindHotkeys.done) return;
    bindHotkeys.done = true;
    document.addEventListener('keydown', e => {
      if (!appEl() || appEl().classList.contains('hidden')) return;
      if (e.ctrlKey && e.altKey && (e.key === 't' || e.key === 'T')){
        e.preventDefault();
        openTerminal();
      } else if (e.ctrlKey && (e.key === 'd' || e.key === 'D')){
        e.preventDefault();
        Desktop.showDesktop();
      } else if (e.key === 'Escape'){
        Desktop.closePop();
      }
    });
  }

  /* ================= 虚拟文件系统 ================= */
  function enabledProblems(){
    return Store.resolveProblems(Store.getProblems() || []).filter(p => p.enabled);
  }
  function noticeText(){
    const s = Store.getSettings();
    const st = Store.getState();
    const problems = enabledProblems();
    const stu = Store.getStudent() || {};
    let info = '考试名称：' + s.examName + '\n考试时长：' + s.durationMin + ' 分钟\n';
    if (stu.name) info += '考生：' + stu.name + '（' + stu.id + '）\n';
    if (st.startedAt) info += '开考时间：' + fmtTime(st.startedAt) + '\n剩余时间：' + fmtClock(remainingSec() || 0) + '\n';
    info += '\n本题卷共 ' + problems.length + ' 题：\n' +
      problems.map((p, i) => '  ' + String(i + 1).padStart(2) + '. ' + p.id + '  ' + p.title).join('\n') +
      '\n\n每题桌面上的 <题名>.zip 内含题面与样例数据。\n' +
      '源程序请保存在 ~/Desktop/' + (stu.id || 'answers') + '/<题名>/<题名>.cpp。\n' +
      '在 Code::Blocks 中作答，代码会自动保存；交卷前请确认各题代码已保存。\n\n—— 考试须知 ——\n' + (s.notice || '');
    return info;
  }
  function mountFs(){
    const stu = Store.getStudent() || {};
    const sid = stu.id || 'answers';
    const fs = Desktop.fs;
    fs.reset();
    fs.mkdirp('~/Desktop/' + sid);
    enabledProblems().forEach(p => {
      const dir = '~/Desktop/' + sid + '/' + p.id;
      fs.mkdirp(dir);
      fs.write(dir + '/' + p.id + '.cpp', Store.getCode(p.id) || '');
      const samples = p.tests.filter(t => t.sample);
      samples.forEach((t, i) => {
        fs.write(dir + '/' + p.id + (i + 1) + '.in', t.input);
        fs.write(dir + '/' + p.id + (i + 1) + '.ans', t.expected);
      });
      fs.write('~/Desktop/' + p.id + '.zip', '（压缩包）' + p.id + '.pdf 题面 + ' + samples.length + ' 组样例数据');
    });
    fs.write('~/Desktop/考试须知.txt', noticeText());
    fs.cwd = fs.abs('~/Desktop/' + sid);
    fs.onWrite = (abs, content) => {
      const m = abs.match(/\/([^/]+)\/(?:[^/]+\/)?\1\.cpp$/);
      if (m) Store.saveCode(m[1], content);
    };
    window.__stu = stu;
    window.__probs = enabledProblems();
    return sid;
  }
  /* 从路径推断题目 id：~/Desktop/<sid>/<pid>/<file> */
  function pidFromPath(abs){
    const seg = String(abs).split('/').filter(Boolean);
    const i = seg.lastIndexOf('Desktop');
    if (i >= 0 && seg[i + 2]) return seg[i + 2];
    return null;
  }

  /* ================= 桌面图标 ================= */
  function buildDesktopIcons(sid){
    const list = [];
    enabledProblems().forEach(p => {
      list.push({
        kind: 'zip', label: p.id + '.zip', key: 'zip:' + p.id, tip: p.title + '（题面与样例）',
        onOpen(){ openZip(p); },
        menu: () => [
          { label: '打开压缩包', ico: 'zip', run(){ openZip(p); } },
          { label: '查看题面', ico: 'text', run(){ openStatement(p); } },
          { label: '打开所在目录', ico: 'folder', run(){ openFiles('~/Desktop/' + sid + '/' + p.id); } },
        ],
      });
    });
    list.push({
      kind: 'folder', label: sid, key: 'home', tip: '~/Desktop/' + sid,
      onOpen(){ openFiles('~/Desktop/' + sid); },
      menu: () => [
        { label: '打开', ico: 'folder', run(){ openFiles('~/Desktop/' + sid); } },
        { label: '在此打开终端', ico: 'term', run(){ openTerminal('~/Desktop/' + sid); } },
      ],
    });
    list.push({
      kind: 'text', label: '考试须知.txt', key: 'notice',
      onOpen: openNotice,
      menu: () => [{ label: '打开', ico: 'text', run(){ openNotice(); } }],
    });
    list.push({
      kind: 'code', label: 'Code::Blocks', key: 'cb', tip: 'C/C++ 集成开发环境',
      onOpen(){ openIDE('Code::Blocks'); },
      menu: () => [{ label: '启动', ico: 'code', run(){ openIDE('Code::Blocks'); } }],
    });
    list.push({
      kind: 'judge', label: 'Arbiter_local', key: 'arb', tip: '本地评测系统',
      onOpen: openArbiter,
      menu: () => [{ label: '启动', ico: 'judge', run(){ openArbiter(); } }],
    });
    list.push({
      kind: 'term', label: '终端', key: 'term', tip: 'Ctrl+Alt+T',
      onOpen(){ openTerminal(); },
      menu: () => [{ label: '新建终端', ico: 'term', run(){ openTerminal(); } }],
    });
    list.push({
      kind: 'submit', label: '提交试卷', key: 'submit',
      onOpen: openSubmit,
      menu: () => [{ label: '打开提交窗口', ico: 'submit', run(){ openSubmit(); } }],
    });
    Desktop.renderIcons(list);
  }

  function registerApps(){
    Desktop.registerApps([
      { id: 'cb', group: '编程', label: 'Code::Blocks', ico: 'code', desc: 'C/C++ IDE', run(){ openIDE('Code::Blocks'); } },
      { id: 'geany', group: '编程', label: 'Geany', ico: 'code', desc: '轻量 IDE', run(){ openIDE('Geany'); } },
      { id: 'vscode', group: '编程', label: 'VS Code', ico: 'code', desc: '未安装 C++ 扩展', run(){ openVSCode(); } },
      { id: 'gedit', group: '编程', label: 'Gedit', ico: 'text', desc: '文本编辑器', run(){ openIDE('Gedit'); } },
      { id: 'vim', group: '编程', label: 'Vim', ico: 'term', desc: '命令模式编辑器', run(){ openTuiEditor('vim'); } },
      { id: 'nano', group: '编程', label: 'nano', ico: 'term', desc: '简单文本编辑器', run(){ openTuiEditor('nano'); } },
      { id: 'emacs', group: '编程', label: 'Emacs', ico: 'term', desc: '可扩展编辑器', run(){ openTuiEditor('emacs'); } },
      { id: 'gdb', group: '编程', label: 'GDB', ico: 'dbg', desc: 'GNU 调试器 9.1', run(){ openGDB(); } },
      { id: 'ddd', group: '编程', label: 'DDD', ico: 'dbg', desc: 'GDB 图形前端', run(){ openGDB('ddd'); } },
      { id: 'arbiter', group: '编程', label: 'Arbiter_local', ico: 'judge', desc: '本地评测系统', run(){ openArbiter(); } },
      { id: 'lazarus', group: '编程', label: 'Lazarus', ico: 'app', desc: 'Pascal IDE', disabled: '本模拟环境未安装 Free Pascal 编译器（正式 NOI Linux 2.0 提供 FPC 3.0.4）', run(){} },
      { id: 'firefox', group: '互联网', label: 'Firefox', ico: 'browse', desc: '考场断网', run(){ openFirefox(); } },
      { id: 'term', group: '系统工具', label: '终端', ico: 'term', desc: 'Ctrl+Alt+T', run(){ openTerminal(); } },
      { id: 'files', group: '系统工具', label: '文件管理器', ico: 'folder', desc: '浏览考试目录', run(){ openFiles(); } },
      { id: 'sysinfo', group: '系统工具', label: '系统信息', ico: 'settings', desc: '环境与考试状态', run(){ openSysInfo(); } },
    ]);
  }

  window.__app = function (id){
    if (id === 'submit') return openSubmit();
    if (id === 'sysinfo') return openSysInfo();
    return Desktop.launch(id);
  };

  function renderWatermark(){
    const s = Store.getSettings();
    const stu = Store.getStudent() || {};
    const wm = $('#sWatermark');
    if (!wm) return;
    if (!s.watermark){ wm.classList.add('hidden'); return; }
    wm.classList.remove('hidden');
    const text = (stu.id || '') + ' ' + (stu.name || '');
    let out = '';
    for (let r = 0; r < 12; r++){
      let line = '';
      for (let c = 0; c < 6; c++) line += text + '　　　';
      out += line + '\n';
    }
    wm.textContent = out;
  }

  /* ================= 题目压缩包 ================= */
  function openZip(p){
    const win = createWindow({ id: 'zip:' + p.id, title: p.id + '.zip — 压缩包查看器', ico: 'zip', w: 640, h: 440 });
    const list = el('div', 'zip-list');
    const stmtRow = el('div', 'zip-row', Desktop.ico('text') + '<span class="zname">' + esc(p.id) + '.pdf</span><span class="zmeta">题面</span>');
    stmtRow.ondblclick = () => openStatement(p);
    stmtRow.onclick = () => { [...list.children].forEach(c => c.style.background = ''); stmtRow.style.background = '#dbe7f7'; };
    list.appendChild(stmtRow);

    const samples = p.tests.map((t, i) => ({ t, i })).filter(x => x.t.sample);
    const dirRow = el('div', 'zip-row', Desktop.ico('folder') + '<span class="zname zdir">' + esc(p.id) + '/</span><span class="zmeta">' + samples.length + ' 组样例数据</span>');
    list.appendChild(dirRow);
    samples.forEach(({ t, i }) => {
      [['.in', t.input, '输入'], ['.out', t.expected, '输出']].forEach(([ext, content, kind]) => {
        const r = el('div', 'zip-row', Desktop.ico('text') + '<span class="zname">' + esc(p.id) + (i + 1) + ext + '</span><span class="zmeta">样例' + (i + 1) + ' ' + kind + '</span>');
        r.style.paddingLeft = '34px';
        r.ondblclick = () => openText(p.id + (i + 1) + ext, content);
        list.appendChild(r);
      });
    });
    win.body.appendChild(list);
  }
  function openText(name, content){
    const win = createWindow({ title: name, ico: 'text', w: 580, h: 400 });
    const pre = el('div', 'txt-view');
    pre.textContent = content;
    win.body.appendChild(pre);
  }
  function openStatement(p){
    const win = createWindow({ id: 'stmt:' + p.id, title: p.id + '.pdf — PDF 阅读器', ico: 'text', w: 920, h: 660 });
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

  /* ================= IDE ================= */
  function openIDE(name){
    const problems = enabledProblems();
    if (!problems.length){ toast('管理员未启用任何题目', 'err'); return; }
    const label = name || 'Code::Blocks';
    const win = createWindow({ id: 'ide', title: label + ' — NOI Linux', ico: 'code', w: 1080, h: 700, onClose(){ ideWin = null; } });
    if (win._built) return win;
    win._built = true;

    const bar = el('div', 'ide-bar');
    bar.innerHTML = '<span>当前题目</span>';
    const sel = el('select');
    problems.forEach(p => {
      const o = el('option', '', esc(p.id) + ' — ' + esc(p.title));
      o.value = p.id;
      sel.appendChild(o);
    });
    const dot = el('span', 'save-dot', '');
    const pathHint = el('span', 'ide-path');
    bar.appendChild(sel);
    bar.appendChild(dot);
    bar.appendChild(pathHint);
    win.body.appendChild(bar);
    const frame = el('iframe', 'ide-frame');
    frame.src = 'ide.html';
    win.body.appendChild(frame);

    ideWin = { win, frame, problemId: sel.value, ready: false };
    const s = Store.getSettings();

    function loadCurrent(){
      const p = problems.find(x => x.id === ideWin.problemId);
      if (!p) return;
      const stu = Store.getStudent() || {};
      const code = Store.getCode(p.id);
      postIDE({ type: 'ide:setCode', code });
      postIDE({
        type: 'ide:setJudge',
        cases: (p.tests || []).map(t => ({ input: t.input, expected: t.expected })),
        tl: p.tl || 1000,
      });
      dot.textContent = '已载入 ' + p.id + '.cpp';
      pathHint.textContent = '~/Desktop/' + (stu.id || 'answers') + '/' + p.id + '/' + p.id + '.cpp' +
        (code ? ' · ' + fmtSize(code.length) : ' · 新文件');
    }
    sel.onchange = () => {
      postIDE({ type: 'ide:getCode' });
      setTimeout(() => { ideWin.problemId = sel.value; loadCurrent(); }, 60);
    };
    ideWin.loadCurrent = loadCurrent;
    loadCurrent();

    frame.addEventListener('load', () => {
      postIDE({ type: 'ide:config', showJudge: s.allowJudge !== false, allowCopy: s.allowCopy !== false });
      setTimeout(() => { ideWin.ready = true; loadCurrent(); }, 400);
    });
    setTimeout(() => { if (ideWin && !ideWin.ready){ ideWin.ready = true; loadCurrent(); } }, 1600);
    return win;
  }
  function postIDE(msg){
    try{ if (ideWin) ideWin.frame.contentWindow.postMessage(msg, '*'); }catch(e){}
  }
  window.addEventListener('message', ev => {
    const d = ev.data;
    if (!d || d.type !== 'ide:code') return;
    if (!ideWin) return;
    const pid = ideWin.problemId;
    if (!pid) return;
    Store.saveCode(pid, d.code);
    const stu = Store.getStudent() || {};
    const node = Desktop.fs.nodes.get('~/Desktop/' + (stu.id || 'answers') + '/' + pid + '/' + pid + '.cpp');
    if (node && node.content !== d.code) node.content = d.code;
    const dot = ideWin.win.body.querySelector('.save-dot');
    if (dot) dot.textContent = pid + '.cpp 已自动保存 · ' + fmtSize(d.code.length);
  });

  function openVSCode(){
    openIDE('VS Code');
    setTimeout(() => toast('VS Code 未安装 C++ 扩展，考场断网也无法安装——仅可编辑，不能编译运行', 'err'), 260);
  }

  /* ================= 终端 ================= */
  function openTerminal(startPath){
    const fs = Desktop.fs;
    const win = createWindow({ id: 'term', title: '终端', ico: 'term', w: 790, h: 510 });
    if (win._built){
      if (startPath){ fs.cwd = fs.abs(startPath); win.termSync(); }
      Desktop.focusWin(win);
      return win;
    }
    win._built = true;
    termSeq++;

    const out = el('div', 'term');
    const row = el('div', 'term-input-row');
    const promptEl = el('span', 'prompt', '');
    const inp = el('input');
    inp.autocomplete = 'off'; inp.spellcheck = false;
    row.appendChild(promptEl); row.appendChild(inp);
    win.body.appendChild(out);
    win.body.appendChild(row);

    const hist = [];
    let hi = -1;

    function w(text, cls){
      const line = document.createElement('div');
      line.className = 't-line' + (cls ? ' t-' + cls : '');
      line.textContent = text == null ? '' : String(text);
      out.appendChild(line);
      out.scrollTop = out.scrollHeight;
    }
    function sync(){
      promptEl.textContent = 'student@noi:' + fs.pretty(fs.cwd) + '$ ';
      const t = 'student@noi: ' + fs.pretty(fs.cwd);
      win.title = t;
      const tt = win.head.querySelector('.win-title');
      if (tt) tt.textContent = t;
      const tb = win.taskBtn && win.taskBtn.querySelector('span');
      if (tb) tb.textContent = t;
    }
    win.termSync = sync;

    w('NOI Linux 2.0 (GNU/Linux 5.4.0-42-generic x86_64)', 'dim');
    w('已挂载考试目录 ~/Desktop/' + ((Store.getStudent() || {}).id || 'answers') + '/', 'dim');
    w('输入 help 查看可用命令；编译：g++ -o game game.cpp -std=c++14 -O2 -Wall', 'dim');
    w('');
    sync();

    /* ---- 命令实现 ---- */
    function absOf(p){ return fs.abs(p); }
    function cmdHelp(){
      w('可用命令：');
      w('  ls [-l] [目录]      列出文件                 cd <目录>        切换目录');
      w('  pwd                 显示当前路径             cat <文件>       查看文件');
      w('  mkdir <目录>        新建目录                 touch <文件>     新建空文件');
      w('  cp <源> <目标>      复制                     mv <源> <目标>   移动/改名');
      w('  rm [-r] <文件>      删除                     diff [-b] a b    比较两个文件');
      w('  g++ -o <输出> <源>  编译（-std=c++14 -O2 -Wall -g）');
      w('  ./<程序>            运行已编译的程序，支持 < 输入重定向、> 输出重定向');
      w('  ulimit -s <KB>      设置栈空间上限           tree             树状列出目录');
      w('  arbiter             启动 Arbiter_local 评测  edit <文件>      用 IDE 打开');
      w('  whoami date uname clear echo exit', 'dim');
    }
    function cmdLs(args){
      const flags = args.filter(a => a.startsWith('-'));
      const rest = args.filter(a => !a.startsWith('-'));
      const target = rest[0] || '.';
      const list = fs.list(target);
      if (!list) return w("ls: 无法访问 '" + target + "': No such file or directory", 'err');
      if (!list.length) return;
      if (flags.includes('-l')){
        list.forEach(n => {
          const size = n.type === 'dir' ? 4096 : (n.content || '').length;
          const t = new Date(n.mtime || Date.now());
          const date = (t.getMonth() + 1) + '月 ' + t.getDate() + ' ' + pad2(t.getHours()) + ':' + pad2(t.getMinutes());
          w((n.type === 'dir' ? 'drwxr-xr-x' : '-rw-r--r--') + ' 1 student student ' +
            String(size).padStart(7) + ' ' + date + '  ' + n.name + (n.type === 'dir' ? '/' : ''));
        });
      } else {
        w(list.map(n => n.name + (n.type === 'dir' ? '/' : '')).join('   '));
      }
    }
    function cmdCd(args){
      const t = args[0] || '~';
      const a = absOf(t);
      if (!fs.isDir(a)) return w("cd: " + t + ": No such file or directory", 'err');
      fs.cwd = a;
      sync();
    }
    function cmdCat(args){
      if (!args[0]) return w('cat: 缺少操作数', 'err');
      try{
        const a = absOf(args[0]);
        const node = fs.nodes.get(a);
        if (node && node.type === 'file' && a.endsWith('.zip')){
          return w('(压缩包) ' + args[0] + ' — 请双击桌面图标或用文件管理器查看', 'dim');
        }
        const txt = fs.read(args[0]);
        txt.split('\n').forEach(l => w(l));
      }catch(e){ w('cat: ' + args[0] + ': ' + e.message, 'err'); }
    }
    function cmdMkdir(args){
      if (!args[0]) return w('mkdir: 缺少操作数', 'err');
      try{ fs.mkdir(args[0]); }catch(e){ w('mkdir: ' + e.message, 'err'); }
    }
    function cmdTouch(args){
      if (!args[0]) return w('touch: 缺少操作数', 'err');
      try{ if (!fs.exists(args[0])) fs.write(args[0], ''); }catch(e){ w('touch: ' + e.message, 'err'); }
    }
    function cmdRm(args){
      const rest = args.filter(a => !a.startsWith('-'));
      if (!rest[0]) return w('rm: 缺少操作数', 'err');
      try{
        if (!fs.rm(rest[0])) w('rm: 无法删除 ' + rest[0] + ': No such file or directory', 'err');
      }catch(e){ w('rm: ' + e.message, 'err'); }
    }
    function cmdCp(args){
      if (args.length < 2) return w('cp: 缺少操作数', 'err');
      try{ fs.write(args[1], fs.read(args[0])); }catch(e){ w('cp: ' + e.message, 'err'); }
    }
    function cmdMv(args){
      if (args.length < 2) return w('mv: 缺少操作数', 'err');
      try{
        const c = fs.read(args[0]);
        fs.write(args[1], c);
        fs.rm(args[0]);
      }catch(e){ w('mv: ' + e.message, 'err'); }
    }
    function cmdDiff(args){
      const ignoreWs = args.some(a => a === '-b' || a === '-w');
      const files = args.filter(a => !a.startsWith('-'));
      if (files.length < 2) return w('diff: 缺少操作数', 'err');
      let a, b;
      try{ a = fs.read(files[0]); b = fs.read(files[1]); }
      catch(e){ return w('diff: ' + e.message, 'err'); }
      const norm = s => s.replace(/\r\n/g, '\n').replace(/\s+$/, '');
      const prep = s => (ignoreWs ? s.split('\n').map(x => x.trim().replace(/\s+/g, ' ')) : norm(s).split('\n'));
      const la = prep(a), lb = prep(b);
      let shown = 0, total = 0;
      const n = Math.max(la.length, lb.length);
      for (let i = 0; i < n; i++){
        const x = la[i] == null ? '' : la[i];
        const y = lb[i] == null ? '' : lb[i];
        if (x === y) continue;
        total++;
        if (shown < 8){
          w((i + 1) + 'c' + (i + 1));
          w('< ' + x);
          w('---');
          w('> ' + y);
          shown++;
        }
      }
      if (!total) return;                       // 与真实 diff 一致：无差异时静默
      if (total > shown) w('（共 ' + total + ' 处差异，仅显示前 ' + shown + ' 处）', 'dim');
    }
    function cmdUlimit(args){
      if (args[0] === '-s' && args[1] != null){
        const v = parseInt(args[1], 10);
        if (!isFinite(v)) return w('ulimit: 参数无效', 'err');
        stackLimit = v;
        w('栈空间上限已设为 ' + v + ' KB（约 ' + (v / 1024).toFixed(0) + ' MB）');
      } else if (args[0] === '-s'){
        w(String(stackLimit));
      } else {
        w('stack size (kbytes) ' + stackLimit);
      }
    }
    function cmdTree(args){
      const root = args[0] || '.';
      const base = absOf(root);
      if (!fs.isDir(base)) return w('tree: ' + root + ': Not a directory', 'err');
      w(fs.pretty(base));
      let dirs = 0, files = 0;
      (function walk(p, prefix){
        const list = fs.list(p) || [];
        list.forEach((n, i) => {
          const last = i === list.length - 1;
          w(prefix + (last ? '└── ' : '├── ') + n.name + (n.type === 'dir' ? '/' : ''));
          if (n.type === 'dir'){ dirs++; walk(n.path, prefix + (last ? '    ' : '│   ')); }
          else files++;
        });
      })(base, '');
      w('');
      w(dirs + ' directories, ' + files + ' files', 'dim');
    }
    async function cmdGpp(args){
      let outName = 'a.out', src = null;
      for (let i = 0; i < args.length; i++){
        const a = args[i];
        if (a === '-o'){ outName = args[++i] || 'a.out'; }
        else if (!a.startsWith('-')) src = a;
      }
      if (!src) return w('g++: fatal error: no input files', 'err');
      const absSrc = absOf(src);
      const node = fs.nodes.get(absSrc);
      if (!node || node.type !== 'file'){
        return w('g++: error: ' + src + ': No such file or directory', 'err');
      }
      const pid = pidFromPath(absSrc);
      if (!pid){ return w('g++: error: ' + src + ': 无法识别的源文件（应在题目目录下编译）', 'err'); }
      const code = Store.getCode(pid) || '';
      if (!code.trim()) return w('g++: error: ' + src + ': 源文件为空', 'err');
      w('g++ ' + args.join(' ') + ' …', 'dim');
      try{
        const r = await Compiler.ask('compile', { code }, 15000);
        const absOut = absOf(outName);
        fs.nodes.set(absOut, { type: 'file', content: '', mtime: Date.now(), exec: true, pid });
        w('编译完成（' + (r.mode === 'VM' ? 'VM-32' : '解释器兜底') + '）→ ./' + outName.replace(/^\.\//, ''), 'dim');
      }catch(e){
        w(src + ':1:1: error: ' + (e.message || '编译错误'), 'err');
        w('编译失败。', 'err');
      }
    }
    async function runExec(token, stdinText, stdoutFile){
      const name = token.replace(/^\.\//, '');
      const abs = absOf(name);
      const node = fs.nodes.get(abs);
      if (!node){
        return w('bash: ' + token + ': No such file or directory', 'err');
      }
      if (!node.exec || !node.pid){
        return w('bash: ' + token + ': 权限不够（请先编译）', 'err');
      }
      const code = Store.getCode(node.pid) || '';
      if (!code.trim()) return w(token + ': 程序为空', 'err');
      let r;
      try{
        r = await Compiler.ask('run', { code, input: stdinText || '', tl: 2000 }, 25000);
      }catch(e){
        return w(token + ': ' + (e.message || '运行失败'), 'err');
      }
      const text = r.stdout == null ? '' : String(r.stdout);
      if (stdoutFile){
        fs.write(stdoutFile, text.endsWith('\n') ? text : text + '\n');
        return;
      }
      if (text) text.replace(/\n$/, '').split('\n').forEach(l => w(l));
      if (r.verdict === 'TLE') w('（运行超时：' + Math.round(r.ms) + ' ms）', 'err');
      else if (r.verdict === 'RE') w('Runtime error: ' + (r.err || '非法内存访问'), 'err');
    }

    async function exec(raw){
      const line = raw.trim();
      if (!line) return;
      w('student@noi:' + fs.pretty(fs.cwd) + '$ ' + raw, 'cmd');
      const tokens = line.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
      let stdinFile = null, stdoutFile = null;
      const args = [];
      for (let i = 0; i < tokens.length; i++){
        if (tokens[i] === '<') stdinFile = tokens[++i];
        else if (tokens[i] === '>') stdoutFile = tokens[++i];
        else args.push(tokens[i].replace(/^["']|["']$/g, ''));
      }
      if (!args.length) return;
      const cmd = args[0];
      const rest = args.slice(1);

      if (cmd.startsWith('./')) return runExec(cmd, stdinFile ? safeRead(stdinFile) : '', stdoutFile);

      switch (cmd){
        case 'help': case 'man': return cmdHelp();
        case 'pwd': return w(fs.cwd.replace(Desktop.HOME, '~'));
        case 'cd': return cmdCd(rest);
        case 'ls': case 'll': return cmdLs(cmd === 'll' ? ['-l'].concat(rest) : rest);
        case 'cat': return cmdCat(rest);
        case 'mkdir': return cmdMkdir(rest);
        case 'touch': return cmdTouch(rest);
        case 'rm': return cmdRm(rest);
        case 'cp': return cmdCp(rest);
        case 'mv': return cmdMv(rest);
        case 'diff': return cmdDiff(rest);
        case 'tree': case 'find': return cmdTree(rest);
        case 'ulimit': return cmdUlimit(rest);
        case 'g++': case 'gcc': return cmdGpp(rest);
        case 'echo': {
          const t = rest.join(' ');
          if (stdoutFile){ fs.write(stdoutFile, t + '\n'); return; }
          return w(t);
        }
        case 'clear': out.innerHTML = ''; return;
        case 'exit': case 'logout': return closeWin(win);
        case 'whoami': {
          const stu = Store.getStudent() || {};
          return w(stu.id ? stu.id + ' (' + stu.name + ')' : 'student');
        }
        case 'date': return w(new Date().toString());
        case 'uname': return w(rest.includes('-a')
          ? 'Linux noi 5.4.0-42-generic #46-Ubuntu SMP x86_64 GNU/Linux'
          : 'Linux');
        case 'arbiter': return openArbiter();
        case 'edit': case 'code': {
          const f = rest[0];
          if (f){
            const abs = absOf(f);
            const pid = pidFromPath(abs);
            if (pid && ideWin){ ideWin.problemId = pid; if (ideWin.loadCurrent) ideWin.loadCurrent(); }
          }
          return openIDE('Code::Blocks');
        }
        case 'sudo': return w('student 不在 sudoers 文件中。此事将被报告。', 'err');
        case 'vim': case 'vi': return openTuiEditor('vim');
        case 'nano': return openTuiEditor('nano');
        case 'gdb': return openGDB();
        case 'apt': case 'apt-get':
          return w('E: 无法定位软件包 —— 考场为离线环境，无法安装软件。', 'err');
        default:
          return w(cmd + ': 未找到命令', 'err');
      }
    }
    function safeRead(p){
      try{ return fs.read(p); }catch(e){ w('bash: ' + p + ': No such file or directory', 'err'); return ''; }
    }

    let busy = false;
    inp.addEventListener('keydown', async e => {
      if (e.key === 'Enter'){
        if (busy) return;
        const line = inp.value;
        inp.value = '';
        if (!line.trim()) { w('student@noi:' + fs.pretty(fs.cwd) + '$ ', 'cmd'); return; }
        hist.push(line); hi = hist.length;
        busy = true;
        try { await exec(line); }
        catch (err){ w(String(err && err.message || err), 'err'); }
        busy = false;
        sync();
      } else if (e.key === 'ArrowUp'){
        if (hi > 0){ hi--; inp.value = hist[hi] || ''; }
        e.preventDefault();
      } else if (e.key === 'ArrowDown'){
        if (hi < hist.length){ hi++; inp.value = hist[hi] || ''; }
        e.preventDefault();
      } else if (e.key === 'l' && e.ctrlKey){
        out.innerHTML = ''; e.preventDefault();
      }
    });
    win.body.addEventListener('mousedown', e => { if (!e.target.closest('input')) inp.focus(); });
    setTimeout(() => inp.focus(), 60);
    return win;
  }

  /* ================= 终端式编辑器（vim / nano / emacs） ================= */
  function openTuiEditor(kind){
    const problems = enabledProblems();
    if (!problems.length){ toast('没有可用题目', 'err'); return; }
    const stu = Store.getStudent() || {};
    let pid = (ideWin && ideWin.problemId) || problems[0].id;
    const path = '~/Desktop/' + (stu.id || 'answers') + '/' + pid + '/' + pid + '.cpp';
    const win = createWindow({ id: 'tui:' + kind, title: kind.toUpperCase() + ' — ' + pid + '.cpp', ico: 'term', w: 820, h: 560 });
    if (win._built) return win;
    win._built = true;

    const head = el('div', 'tui-head', '<span class="tui-file">' + esc(path) + '</span><span class="tui-mode" id="tuiMode">插入</span>');
    const ta = el('textarea', 'tui-area');
    ta.spellcheck = false;
    ta.value = Store.getCode(pid) || '';
    const bar = el('div', 'tui-bar');
    const cmdRow = el('div', 'tui-cmd hidden');
    const cmdIn = el('input');
    cmdIn.autocomplete = 'off';
    cmdRow.appendChild(cmdIn);
    win.body.appendChild(head);
    win.body.appendChild(ta);
    win.body.appendChild(bar);
    win.body.appendChild(cmdRow);

    let mode = 'insert';
    function paint(){
      const modeEl = head.querySelector('.tui-mode');
      if (kind === 'vim'){
        modeEl.textContent = mode === 'insert' ? '-- 插入 --' : '-- 普通 --';
        bar.textContent = mode === 'insert' ? 'Esc 进入普通模式 · :w 保存 · :q 退出 · :wq 保存退出'
          : '按 i 回到插入模式 · 输入 : 执行命令';
      } else if (kind === 'nano'){
        modeEl.textContent = 'nano';
        bar.textContent = '^O 写入文件    ^X 退出    ^K 剪切行    ^C 取消';
      } else {
        modeEl.textContent = 'Emacs';
        bar.textContent = 'C-x C-s 保存    C-x C-c 退出    （本模拟器仅实现这两组快捷键）';
      }
    }
    function save(){
      const code = ta.value;
      Store.saveCode(pid, code);
      try{ Desktop.fs.write(path, code); }catch(e){}
      toast(pid + '.cpp 已写入 ' + path, 'ok');
    }
    function quit(){ closeWin(win); }

    if (kind === 'vim'){
      ta.addEventListener('keydown', e => {
        if (mode === 'insert' && e.key === 'Escape'){
          mode = 'normal';
          ta.blur();
          paint();
          e.preventDefault();
        }
      });
      win.body.addEventListener('keydown', e => {
        if (mode !== 'normal') return;
        if (e.key === 'i' || e.key === 'a' || e.key === 'o'){
          mode = 'insert'; ta.focus(); paint(); e.preventDefault();
        } else if (e.key === ':'){
          cmdRow.classList.remove('hidden');
          cmdIn.value = ':';
          cmdIn.focus();
          e.preventDefault();
        } else if (e.key === 'Escape'){
          mode = 'insert'; ta.focus(); paint();
        }
      });
      cmdIn.addEventListener('keydown', e => {
        if (e.key === 'Escape'){ cmdRow.classList.add('hidden'); mode = 'normal'; paint(); e.preventDefault(); return; }
        if (e.key !== 'Enter') return;
        const c = cmdIn.value.replace(/^:/, '').trim();
        cmdRow.classList.add('hidden');
        mode = 'normal';
        paint();
        if (c === 'w') save();
        else if (c === 'q' || c === 'q!') quit();
        else if (c === 'wq' || c === 'x'){ save(); quit(); }
        else if (/^\d+$/.test(c)) { /* 行号跳转：不做 */ }
        else if (c) toast('E492: 不是编辑器的命令: ' + c, 'err');
      });
    } else if (kind === 'nano'){
      ta.addEventListener('keydown', e => {
        if (e.ctrlKey && (e.key === 'o' || e.key === 'O')){ e.preventDefault(); save(); }
        else if (e.ctrlKey && (e.key === 'x' || e.key === 'X')){ e.preventDefault(); quit(); }
      });
    } else {
      let cx = false;
      ta.addEventListener('keydown', e => {
        if (e.ctrlKey && (e.key === 'x' || e.key === 'X')){ cx = true; setTimeout(() => { cx = false; }, 1200); e.preventDefault(); return; }
        if (cx && e.ctrlKey && (e.key === 's' || e.key === 'S')){ cx = false; e.preventDefault(); save(); return; }
        if (cx && e.ctrlKey && (e.key === 'c' || e.key === 'C')){ cx = false; e.preventDefault(); quit(); }
      });
    }
    paint();
    setTimeout(() => ta.focus(), 80);
    return win;
  }

  /* ================= GDB 调试器 ================= */
  function openGDB(variant){
    const problems = enabledProblems();
    const win = createWindow({ id: 'gdb', title: (variant === 'ddd' ? 'DDD — ' : '') + 'GDB 9.1', ico: 'dbg', w: 780, h: 500 });
    if (win._built) return win;
    win._built = true;
    let pid = (ideWin && ideWin.problemId) || (problems[0] && problems[0].id) || '';
    const breaks = [];
    const out = el('div', 'term');
    const row = el('div', 'term-input-row');
    const prompt = el('span', 'prompt', '(gdb) ');
    const inp = el('input');
    inp.autocomplete = 'off';
    row.appendChild(prompt); row.appendChild(inp);
    win.body.appendChild(out);
    win.body.appendChild(row);

    const w = (t, cls) => {
      const l = document.createElement('div');
      l.className = 't-line' + (cls ? ' t-' + cls : '');
      l.textContent = t;
      out.appendChild(l);
      out.scrollTop = out.scrollHeight;
    };
    w('GNU gdb (Ubuntu 9.1-0ubuntu1) 9.1', 'dim');
    w('本环境为竞赛模拟环境：断点与列表基于当前源文件，run 会真实执行程序。', 'dim');
    w('输入 help 查看命令。', 'dim');
    w('');

    async function exec(line){
      const [cmd, ...rest] = line.split(/\s+/);
      const code = Store.getCode(pid) || '';
      const lines = code.split('\n');
      switch (cmd){
        case 'help':
          w('list 显示源码 · break N 设断点 · info break 查看断点 · run 运行 ·');
          w('next 单步 · continue 继续 · bt 调用栈 · print <表达式> · quit 退出');
          break;
        case 'file':
          if (rest[0]){ pid = rest[0].replace(/\.cpp$/, '').split('/').pop(); w('Reading symbols from ' + rest[0] + '...done.'); }
          else w('No executable file specified.');
          break;
        case 'list': case 'l': {
          if (!code.trim()) return w('当前题目还没有代码。');
          const from = Math.max(0, (parseInt(rest[0], 10) || 1) - 1);
          lines.slice(from, from + 12).forEach((l, i) => w(String(from + i + 1).padStart(4) + '\t' + l));
          break;
        }
        case 'break': case 'b': {
          const n = parseInt(rest[0], 10);
          if (!isFinite(n)) return w('Breakpoint 命令需要行号，例如 break 12', 'err');
          breaks.push(n);
          w('Breakpoint ' + breaks.length + ' at 0x4005' + (20 + breaks.length) + ': file ' + pid + '.cpp, line ' + n + '.');
          break;
        }
        case 'info': {
          if (rest[0] === 'break' || rest[0] === 'b'){
            if (!breaks.length) return w('No breakpoints or watchpoints.');
            breaks.forEach((n, i) => w('Num     Type           Disp Enb Address            What'));
            breaks.forEach((n, i) => w(String(i + 1).padStart(2) + '      breakpoint     keep y   0x00000000004005' + (20 + i) + ' in main() at ' + pid + '.cpp:' + n));
          } else w('Undefined info command: "' + (rest[0] || '') + '".');
          break;
        }
        case 'run': case 'r': {
          if (!code.trim()) return w('No executable file specified.', 'err');
          w('Starting program: ' + pid);
          try{
            const p = problems.find(x => x.id === pid) || problems[0];
            const sample = p && p.tests.find(t => t.sample);
            const r = await Compiler.ask('run', { code, input: sample ? sample.input : '', tl: 2000 }, 25000);
            if (r.stdout) String(r.stdout).replace(/\n$/, '').split('\n').forEach(l => w(l));
            if (r.verdict === 'TLE') w('[运行超时]', 'err');
            else w('[Inferior 1 (process ' + (4200 + breaks.length) + ') exited normally]', 'dim');
          }catch(e){ w('[Inferior 1 exited with code 1] ' + (e.message || ''), 'err'); }
          break;
        }
        case 'continue': case 'c':
          w('Continuing.');
          w('[Inferior 1 (process 4201) exited normally]', 'dim');
          break;
        case 'next': case 'n':
          w('Single stepping until exit from function main,');
          w('which has no line number information.');
          break;
        case 'bt': case 'backtrace':
          w('#0  main () at ' + pid + '.cpp:' + (breaks[0] || 1));
          w('(当前为模拟会话，无更深调用栈)', 'dim');
          break;
        case 'print': case 'p':
          w('$1 = <无法求值：模拟环境不维护运行时变量>', 'err');
          break;
        case 'quit': case 'q':
          closeWin(win);
          break;
        default:
          w('Undefined command: "' + (cmd || '') + '".  Try "help".', 'err');
      }
    }
    inp.addEventListener('keydown', async e => {
      if (e.key !== 'Enter') return;
      const line = inp.value.trim();
      inp.value = '';
      w('(gdb) ' + line);
      if (line) await exec(line);
    });
    win.body.addEventListener('mousedown', e => { if (!e.target.closest('input')) inp.focus(); });
    setTimeout(() => inp.focus(), 60);
    return win;
  }

  /* ================= Arbiter_local 本地评测 ================= */
  function openArbiter(){
    const problems = enabledProblems();
    if (!problems.length){ toast('没有可用题目', 'err'); return; }
    const win = createWindow({ id: 'arbiter', title: 'Arbiter_local — 本地评测', ico: 'judge', w: 1000, h: 650 });
    if (win._built) return win;
    win._built = true;

    let cur = (ideWin && ideWin.problemId) || problems[0].id;
    let cases = [];
    let results = [];

    const wrap = el('div', 'arb-wrap');
    const side = el('div', 'arb-side');
    const main = el('div', 'arb-main');
    wrap.appendChild(side); wrap.appendChild(main);
    win.body.appendChild(wrap);

    const head = el('div', 'arb-head');
    const title = el('div', 'arb-title', '');
    const sub = el('div', 'arb-sub', '');
    head.appendChild(title); head.appendChild(sub);
    main.appendChild(head);

    const info = el('div', 'arb-info');
    main.appendChild(info);

    const tbl = el('table', 'arb-table');
    const tblWrap = el('div', 'arb-tblwrap');
    tblWrap.appendChild(tbl);
    main.appendChild(tblWrap);

    const foot = el('div', 'arb-foot');
    const btnRun = el('button', 'btn btn-primary', '▶ 运行评测');
    const btnStop = el('button', 'btn', '停止');
    btnStop.disabled = true;
    const scoreEl = el('span', 'arb-score', '');
    foot.appendChild(btnRun); foot.appendChild(btnStop); foot.appendChild(scoreEl);
    main.appendChild(foot);

    function renderSide(){
      side.innerHTML = '';
      const h = el('div', 'arb-sh', '试题');
      side.appendChild(h);
      problems.forEach(p => {
        const code = Store.getCode(p.id) || '';
        const it = el('button', 'arb-item' + (p.id === cur ? ' active' : ''));
        it.innerHTML = '<b>' + esc(p.id) + '</b><span>' + esc(p.title) + '</span>' +
          '<i class="' + (code ? 'arb-ok' : 'arb-no') + '">' + (code ? '已编写' : '未编写') + '</i>';
        it.onclick = () => { cur = p.id; results = []; render(); };
        side.appendChild(it);
      });
      const tip = el('div', 'arb-tip',
        'Arbiter_local 是 NOI 官方提供的单机评测工具。这里用同一套测试点评测你的代码，' +
        '提前知道能拿多少分。');
      side.appendChild(tip);
    }

    function render(){
      const p = problems.find(x => x.id === cur);
      title.textContent = p.id + ' — ' + p.title;
      const stu = Store.getStudent() || {};
      const src = '~/Desktop/' + (stu.id || 'answers') + '/' + p.id + '/' + p.id + '.cpp';
      sub.textContent = '源文件：' + src;
      info.innerHTML = '<span>时间限制：' + (p.tl || 1000) + ' ms</span>' +
        '<span>测试点：' + (p.tests || []).length + ' 个（含 ' + (p.tests || []).filter(t => t.sample).length + ' 个样例）</span>' +
        '<span>编译器：g++ 9.3.0（VM 目标）</span>';
      cases = (p.tests || []).map((t, i) => ({ input: t.input, expected: t.expected, sample: !!t.sample, idx: i }));
      tbl.innerHTML = '<thead><tr><th>#</th><th>类型</th><th>结果</th><th>耗时</th><th>说明</th></tr></thead>';
      const tb = el('tbody');
      cases.forEach((c, i) => {
        const r = results[i];
        const tr = el('tr');
        const vd = r ? r.verdict : '—';
        tr.innerHTML = '<td>' + (i + 1) + '</td>' +
          '<td>' + (c.sample ? '样例' : '测试点') + '</td>' +
          '<td class="arb-v arb-v-' + (r ? vd : 'none') + '">' + vd + '</td>' +
          '<td>' + (r ? Math.round(r.ms) + ' ms' : '—') + '</td>' +
          '<td class="arb-note">' + (r && r.verdict !== 'AC'
            ? (vd === 'WA' ? '输出与答案不一致' : vd === 'TLE' ? '超出时间限制' : vd === 'RE' ? esc(r.err || '运行时错误') : '')
            : '') + '</td>';
        tb.appendChild(tr);
      });
      tbl.appendChild(tb);
      if (results.length === cases.length && cases.length){
        const ac = results.filter(r => r.verdict === 'AC').length;
        const score = Math.round(ac / cases.length * 100);
        scoreEl.textContent = '得分 ' + score + ' / 100　通过 ' + ac + ' / ' + cases.length;
        scoreEl.className = 'arb-score' + (score === 100 ? ' full' : score > 0 ? ' part' : ' zero');
      } else scoreEl.textContent = '';
      renderSide();
    }

    let running = false;
    btnRun.onclick = async () => {
      if (running) return;
      const p = problems.find(x => x.id === cur);
      const code = Store.getCode(cur) || '';
      if (!code.trim()){ toast('这道题还没有代码，请先在 Code::Blocks 中编写', 'err'); return; }
      running = true;
      btnRun.disabled = true; btnStop.disabled = false;
      results = [];
      scoreEl.textContent = '正在评测…';
      scoreEl.className = 'arb-score';
      try{
        const r = await Compiler.ask('judge', {
          code,
          cases: (p.tests || []).map(t => ({ input: t.input, expected: t.expected })),
          tl: p.tl || 1000,
        }, 180000);
        results = r.cases || [];
      }catch(e){
        toast('评测失败：' + (e.message || e), 'err');
        results = [];
      }
      running = false;
      btnRun.disabled = false; btnStop.disabled = true;
      render();
    };
    btnStop.onclick = () => { /* 单进程评测，停止即关闭窗口 */ closeWin(win); };

    render();
    return win;
  }

  /* ================= 文件管理器 ================= */
  function openFiles(path){
    const fs = Desktop.fs;
    const win = createWindow({ id: 'files', title: '文件管理器', ico: 'folder', w: 860, h: 560 });
    if (win._built){
      if (path) win.fmanGo(path);
      Desktop.focusWin(win);
      return win;
    }
    win._built = true;
    let cur = path ? fs.abs(path) : fs.cwd;

    const bar = el('div', 'fman-bar');
    const btnBack = el('button', 'fman-btn', '←');
    const btnUp = el('button', 'fman-btn', '↑');
    const btnHome = el('button', 'fman-btn', '⌂');
    const crumb = el('div', 'fman-crumb');
    bar.appendChild(btnBack); bar.appendChild(btnUp); bar.appendChild(btnHome); bar.appendChild(crumb);
    const list = el('div', 'fman-list');
    const status = el('div', 'fman-status');
    win.body.appendChild(bar);
    win.body.appendChild(list);
    win.body.appendChild(status);

    const hist = [];
    function go(p){
      const a = fs.abs(p);
      if (!fs.isDir(a)) { toast('目录不存在：' + p, 'err'); return; }
      if (cur !== a) hist.push(cur);
      cur = a;
      render();
    }
    win.fmanGo = go;

    function render(){
      // 面包屑
      const rel = fs.pretty(cur);
      const segs = rel.split('/');
      crumb.innerHTML = '';
      let acc = cur.startsWith(Desktop.HOME) ? '~' : '';
      segs.forEach((s, i) => {
        if (i > 0 || rel !== '~'){
          const b = el('button', 'crumb-seg', esc(s === '' ? '/' : s));
          const target = i === 0 && s === '~' ? Desktop.HOME : cur.split('/').slice(0, cur.split('/').length - (segs.length - 1 - i)).join('/');
          b.onclick = () => go(target || Desktop.HOME);
          crumb.appendChild(b);
          if (i < segs.length - 1) crumb.appendChild(el('span', 'crumb-sep', '/'));
        }
      });
      const items = fs.list(cur) || [];
      list.innerHTML = '';
      if (!items.length){
        list.innerHTML = '<div class="fman-empty">此文件夹为空</div>';
      }
      items.forEach(n => {
        const row = el('div', 'fman-row');
        const kind = n.type === 'dir' ? 'folder' : /\.cpp$/.test(n.name) ? 'code' : /\.zip$/.test(n.name) ? 'zip' : 'text';
        row.innerHTML = Desktop.ico(kind) +
          '<span class="fman-name">' + esc(n.name) + '</span>' +
          '<span class="fman-size">' + (n.type === 'dir' ? '—' : fmtSize((n.content || '').length)) + '</span>' +
          '<span class="fman-type">' + (n.type === 'dir' ? '文件夹' : /\.cpp$/.test(n.name) ? 'C++ 源文件' : /\.zip$/.test(n.name) ? '压缩包' : '文本') + '</span>';
        row.ondblclick = () => {
          if (n.type === 'dir') return go(n.path);
          if (/\.cpp$/.test(n.name)){
            const pid = pidFromPath(n.path);
            if (pid && ideWin){ ideWin.problemId = pid; if (ideWin.loadCurrent) ideWin.loadCurrent(); }
            return openIDE('Code::Blocks');
          }
          openText(n.name, n.content || '');
        };
        list.appendChild(row);
      });
      status.textContent = items.length + ' 个项目　·　' + fs.pretty(cur);
      const tt = win.head.querySelector('.win-title');
      if (tt) tt.textContent = '文件管理器 — ' + fs.pretty(cur);
    }
    btnBack.onclick = () => { const p = hist.pop(); if (p) { cur = p; render(); } };
    btnUp.onclick = () => { const p = cur.slice(0, cur.lastIndexOf('/')) || '/'; if (fs.isDir(p)) go(p); };
    btnHome.onclick = () => go('~/Desktop');
    render();
    return win;
  }

  /* ================= Firefox（离线） ================= */
  function openFirefox(){
    const win = createWindow({ id: 'firefox', title: 'Firefox — 离线', ico: 'browse', w: 900, h: 620 });
    if (win._built) return win;
    win._built = true;
    const bar = el('div', 'ff-bar');
    const inp = el('input');
    inp.value = 'about:blank';
    inp.readOnly = true;
    const go = el('button', 'btn btn-sm', '前往');
    bar.appendChild(inp); bar.appendChild(go);
    const page = el('div', 'ff-page');
    win.body.appendChild(bar);
    win.body.appendChild(page);

    function showLocal(which){
      if (which === 'notice'){
        page.innerHTML = '<div class="ff-doc"><h1>考试须知</h1><pre>' + esc(noticeText()) + '</pre></div>';
        inp.value = 'file:///home/student/Desktop/考试须知.txt';
        return;
      }
      page.innerHTML =
        '<div class="ff-off">' +
        '<div class="ff-off-ico">' + Desktop.ICONS.browse + '</div>' +
        '<h1>无法连接到服务器</h1>' +
        '<p>考场为离线环境，Firefox 无法访问互联网。</p>' +
        '<p class="dim">可以查看本机的离线文档：</p>' +
        '<div class="ff-links">' +
        '<button data-k="notice">考试须知.txt</button>' +
        enabledProblems().map(p => '<button data-k="' + esc(p.id) + '">' + esc(p.id) + '.pdf 题面</button>').join('') +
        '</div></div>';
      page.querySelectorAll('.ff-links button').forEach(b => {
        b.onclick = () => {
          const k = b.dataset.k;
          if (k === 'notice') return showLocal('notice');
          const p = enabledProblems().find(x => x.id === k);
          if (p) openStatement(p);
        };
      });
      inp.value = 'http://www.example.com/';
    }
    go.onclick = () => toast('考场断网，无法访问外网', 'err');
    showLocal();
    return win;
  }

  /* ================= 系统信息 ================= */
  function openSysInfo(){
    const win = createWindow({ id: 'sysinfo', title: '系统信息', ico: 'settings', w: 620, h: 480 });
    if (win._built) return win;
    win._built = true;
    const s = Store.getSettings();
    const stu = Store.getStudent() || {};
    const st = Store.getState();
    const rows = [
      ['发行版', 'NOI Linux 2.0（基于 Ubuntu 20.04.1）'],
      ['架构 / 内核', 'x86_64 / Linux 5.4.0-42-generic'],
      ['桌面环境', 'GNOME Flashback（经典面板）'],
      ['编译器', 'GCC / G++ 9.3.0（-std=c++14）'],
      ['调试器', 'GDB 9.1 / DDD'],
      ['评测工具', 'Arbiter_local'],
      ['内存', '4.0 GiB'],
      ['网络', '有线连接 · 无互联网访问'],
      ['—', ''],
      ['考生', (stu.name || '—') + '　' + (stu.id || '')],
      ['考试名称', s.examName || '—'],
      ['考试状态', { notstarted: '未开始', running: '进行中', ended: '已结束' }[st.status] || '—'],
      ['剩余时间', remainingSec() == null ? '—' : fmtClock(remainingSec())],
      ['已启用题目', enabledProblems().length + ' 题'],
    ];
    const tbl = el('table', 'sysinfo-table');
    rows.forEach(([k, v]) => {
      if (k === '—'){ tbl.appendChild(el('tr', 'sysinfo-sep', '<td colspan="2"></td>')); return; }
      const tr = el('tr');
      tr.innerHTML = '<th>' + esc(k) + '</th><td>' + esc(v) + '</td>';
      tbl.appendChild(tr);
    });
    win.body.appendChild(tbl);
    return win;
  }

  /* ================= 考试须知 ================= */
  function openNotice(){
    const win = createWindow({ id: 'notice', title: '考试须知.txt — 文本编辑器', ico: 'text', w: 680, h: 520 });
    if (win._built){
      const pre = win.body.querySelector('.txt-view');
      if (pre) pre.textContent = noticeText();
      return win;
    }
    win._built = true;
    const pre = el('div', 'txt-view');
    pre.textContent = noticeText();
    win.body.appendChild(pre);
    return win;
  }

  /* ================= 提交试卷 ================= */
  function openSubmit(){
    const win = createWindow({ id: 'submit', title: '提交试卷', ico: 'submit', w: 700, h: 520 });
    if (win._built){
      win.body.innerHTML = '';
    }
    win._built = true;
    const pane = el('div', 'submit-pane');
    const problems = enabledProblems();
    const codes = Store.getCodes();
    const stu = Store.getStudent() || {};
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
    pane.appendChild(el('div', 'submit-path', '提交位置：~/Desktop/' + (stu.id || 'answers') + '/&lt;题名&gt;/&lt;题名&gt;.cpp'));
    pane.appendChild(tbl);
    pane.appendChild(el('div', 'submit-warn',
      '交卷后将锁定考试环境，不能再作答。未保存的代码不会提交。请先在 Code::Blocks 中检查各题代码是否完整。'));
    const btn = el('button', 'btn btn-primary', '确认交卷');
    btn.onclick = () => {
      if (!confirm('确认交卷？交卷后无法继续作答。')) return;
      doSubmit('学生主动交卷');
      closeWin(win);
    };
    pane.appendChild(btn);
    win.body.appendChild(pane);
    return win;
  }

  /* ================= 计时 / 交卷 ================= */
  function remainingSec(){
    const st = Store.getState();
    if (st.status !== 'running' || !st.startedAt) return null;
    const dur = (Store.getSettings().durationMin || 230) * 60;
    return Math.max(0, dur - (Date.now() - st.startedAt) / 1000);
  }
  function tick(){
    const root = $('#studentApp');
    if (!root || root.classList.contains('hidden') || submitted) {
      const c = $('#sClock');
      if (c){ const d = new Date(); c.textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
      return;
    }
    const st = Store.getState();
    if (st.status === 'ended'){ doSubmit('考试结束（管理员结束）'); return; }
    const left = remainingSec();
    const remainEl = $('#sRemain');
    if (left == null){
      if (remainEl) remainEl.textContent = '--:--:--';
    } else {
      if (remainEl){
        remainEl.textContent = '剩余 ' + fmtClock(left);
        remainEl.classList.toggle('warn', left <= 600 && left > 300);
        remainEl.classList.toggle('crit', left <= 300);
      }
      if (left <= 0){ doSubmit('考试时间结束，自动交卷'); return; }
    }
    const d = new Date();
    const clk = $('#sClock');
    if (clk) clk.textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
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
    appEl().classList.remove('hidden');
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

  return { show };
})();

/* ================= 入口 ================= */
$('#btnEnterAdmin').onclick = () => Admin.show();
$('#btnEnterStudent').onclick = () => Student.show();
