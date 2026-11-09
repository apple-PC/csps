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

  /* ================= 登录（账户由 GDM 提供） ================= */
  let account = null;                       // 当前系统账户 { id, role, group }

  async function loginAs(acc){
    /* 换账户 = 新会话：上一个账户残留的窗口一个都不留 */
    closeAllWins();
    account = acc || { id: 'csp-s2026', role: 'student', group: 's' };
    Store.saveStudent({ account: account.id, name: account.id, id: account.id });

    const hasLocal = localStorage.getItem(Store.K.settings) && localStorage.getItem(Store.K.problems);
    if (!hasLocal){ try { await Store.initRemote(); } catch (e) {} }

    /* 拿不到外部考试数据也不能卡在登录：用内置题库落一份默认配置 */
    if (!localStorage.getItem(Store.K.settings)) Store.saveSettings(Store.getSettings());
    if (!localStorage.getItem(Store.K.problems) && window.BUILTIN_PROBLEMS){
      Store.saveProblems(window.BUILTIN_PROBLEMS.map(p => ({
        id: p.id, title: p.title, source: 'builtin', tl: p.tl, enabled: true, builtin: true,
      })));
    }
    tryFullscreen();
    await enterDesktop();
  }

  function tryFullscreen(){
    const elx = document.documentElement;
    if (elx.requestFullscreen) elx.requestFullscreen().catch(() => {});
  }

  function isAdmin(){ return !!account && account.role === 'admin'; }

  /* 注销：回 GDM 登录界面。交卷后同样走这里，随时可以重新登录继续作答 */
  function logout(){
    closeAllWins();
    if (timerHandle){ clearInterval(timerHandle); timerHandle = null; }
    appEl().classList.add('hidden');
    $('#sEndOverlay').classList.add('hidden');
    $('#sWaitOverlay').classList.add('hidden');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    submitted = false;
    if (window.Greeter) Greeter.lock();
  }
  window.__logout = logout;

  $('#btnEndBack').onclick = logout;

  /* ================= 进入桌面 ================= */
  async function enterDesktop(){
    const st = Store.getState();
    const s = Store.getSettings();
    /* 正式考试的机器不限时：机器一直可用，交过卷也能重新登录继续。
       唯一会挡人的是管理员设的「定时开考」还没到点。 */
    if (s.startMode === 'scheduled' && s.scheduledAt && st.status !== 'running'){
      const startTs = new Date(s.scheduledAt).getTime();
      if (Date.now() < startTs){ showWaiting(startTs); return; }
    }
    if (st.status !== 'running'){
      Store.saveState({ status: 'running', startedAt: st.startedAt || Date.now() });
    }
    try { await loadHiddenTests(); } catch (e) {}
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
      if (window.BootScreen) BootScreen.text('正在加载评测数据…');
      const sc = document.createElement('script');
      sc.src = TESTS_FILE;
      sc.onload = () => resolve();
      sc.onerror = () => resolve();
      document.head.appendChild(sc);
    });
  }
  /* 加载进度统一显示在 Plymouth 开机画面上（logo + 五点下方的小字），
     登录进桌面之后不再有任何加载遮罩 */
  function plyProgress(text){
    if (window.BootScreen) BootScreen.text(text);
  }
  async function loadHiddenTests(){
    if (_testsMerged || window.BUILTIN_HIDDEN_TESTS){ mergeHidden(); return; }
    plyProgress('准备下载：' + TESTS_FILE);
    await nextFrame();
    let code = null;
    try{
      code = await fetchWithProgress(TESTS_FILE, (got, total) => {
        const pct = Math.min(99, Math.floor(got / total * 100));
        plyProgress('正在下载评测数据　' + fmtKB(got) + ' KB / ' + fmtKB(total) + ' KB　' + pct + '%');
      });
    }catch(e){
      await loadByScriptTag();
      mergeHidden();
      return;
    }
    plyProgress('正在解析测试点…');
    await nextFrame();
    try { execScript(code); }
    catch (e) { await loadByScriptTag(); }
    plyProgress('正在合并到题库…');
    await nextFrame();
    mergeHidden();
    plyProgress('评测数据就绪 · 共 ' + countHidden() + ' 个测试点');
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
  /* 页面一打开就开始取评测数据（Plymouth 开机画面上同步显示进度）。
     开机画面会等这个闸门就绪才淡出 —— 于是 GDM 一登录就能直接进桌面，
     登录之后不再出现任何加载遮罩。 */
  window.__BOOT_GATE = loadHiddenTests().catch(() => {});
  function showWaiting(startTs){
    appEl().classList.remove('hidden');
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
    /* 不再读 studentState.submitted：那会把考生永久锁在「已交卷」页面上 */
    submitted = false;
    appEl().classList.remove('hidden');
    $('#sWaitOverlay').classList.add('hidden');

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
    let info = '考试名称：' + s.examName + '\n';
    if (stu.account) info += '系统账户：' + stu.account + '\n';
    if (st.startedAt) info += '开考时间：' + fmtTime(st.startedAt) + '\n';
    info += '\n本题卷共 ' + problems.length + ' 题：\n' +
      problems.map((p, i) => '  ' + String(i + 1).padStart(2) + '. ' + p.id + '  ' + p.title).join('\n') +
      '\n\n' + (s.desktopIcons === 'exam'
        ? '每题桌面上的 <题名>.zip 内含题面与样例数据。'
        : '题面与样例数据在本目录下各题的 <题名>.zip 内。') +
      '\n源程序请保存在 ~/Desktop/teacher/<题名>/<题名>.cpp。\n' +
      '在 Code::Blocks 中作答，代码会自动保存；交卷前请确认各题代码已保存。\n\n—— 考试须知 ——\n' + (s.notice || '');
    return info;
  }
  function mountFs(){
    /* 官方 NOI Linux 2.0 的桌面目录就是 teacher（演示机原始状态），
       考生文件放里面，桌面上只有这一个文件夹加回收站 */
    const sid = 'teacher';
    const fs = Desktop.fs;
    const home = '~/Desktop/' + sid;
    fs.reset();
    fs.mkdirp(home);
    /* 真机流程：刚进桌面时 teacher 里只有一份考试须知 —— 试题压缩包必须
       考生自己登录回收系统「试题下载」拿到（见答题页 data-dl 的下载逻辑），
       再用归档管理器解压出 <题名>.cpp / 样例 / 题面。 */
    fs.write(home + '/考试须知.txt', noticeText());
    fs.mkdirp('~/.local/share/Trash/files');
    fs.cwd = fs.abs(home);
    fs.onWrite = (abs, content) => {
      const m = abs.match(/\/([^/]+)\/(?:[^/]+\/)?\1\.cpp$/);
      if (m) Store.saveCode(m[1], content);
    };
    window.__stu = Object.assign({}, Store.getStudent() || {}, { role: account ? account.role : 'student' });
    window.__probs = enabledProblems();
    return sid;
  }
  /* 试题压缩包落在哪：默认模式进 teacher 目录，exam 模式平铺到桌面 */
  function zipPath(pid){
    return (Store.getSettings().desktopIcons === 'exam' ? '~/Desktop/' : '~/Desktop/teacher/') + pid + '.zip';
  }
  /* 题目是否已经「下载 + 解压」过（teacher 下有 <pid>/<pid>.cpp） */
  function problemExtracted(pid){
    const fs = Desktop.fs;
    return fs.exists('~/Desktop/teacher/' + pid + '/' + pid + '.cpp');
  }
  /* 真正解压：zip 里有的东西一样不少地落到 teacher/<pid>/ 下。
     之前写过的代码不能被空模板冲掉，所以 .cpp 优先取已保存的内容。 */
  function extractProblem(p){
    const fs = Desktop.fs;
    const dir = '~/Desktop/teacher/' + p.id;
    fs.mkdirp(dir);
    fs.write(dir + '/' + p.id + '.cpp', Store.getCode(p.id) || '');
    const samples = (p.tests || []).filter(t => t.sample);
    samples.forEach((t, i) => {
      fs.write(dir + '/' + p.id + (i + 1) + '.in', t.input);
      fs.write(dir + '/' + p.id + (i + 1) + '.ans', t.expected);
    });
    fs.write(dir + '/' + p.id + '.pdf', statementText(p));
    return dir;
  }
  function statementText(p){
    const st = p.statement;
    if (!st) return '';
    if (st.type === 'text') return st.data || '';
    if (st.type === 'html') return String(st.data || '').replace(/<[^>]+>/g, '');
    return '（PDF 题面）';
  }
  /* 从路径推断题目 id：~/Desktop/<sid>/<pid>/<file> */
  function pidFromPath(abs){
    const seg = String(abs).split('/').filter(Boolean);
    const i = seg.lastIndexOf('Desktop');
    if (i >= 0 && seg[i + 2]) return seg[i + 2];
    return null;
  }

  /* ================= 桌面图标 ================= */
  /* 官方 NOI Linux 2.0 的桌面非常干净：演示机上是 teacher 文件夹 + 回收站两个图标，
   * 应用入口全在左侧 Dock 和「显示应用程序」网格里。这里默认照做。
   * 若管理员把 desktopIcons 设成 exam，则把每题压缩包与常用启动器平铺到桌面。 */
  function buildDesktopIcons(sid){
    const list = [];
    const flat = Store.getSettings().desktopIcons === 'exam';
    if (flat){
      enabledProblems().forEach(p => {
        /* 压缩包要真的下载过才出现在桌面上（回收系统下载后 buildDesktopIcons 会重跑） */
        if (!Desktop.fs.exists(zipPath(p.id))) return;
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
    } else {
      list.push({
        kind: 'folder', label: sid, key: 'home', tip: '~/Desktop/' + sid,
        onOpen(){ openFiles('~/Desktop/' + sid); },
        menu: () => [
          { label: '打开', ico: 'folder', run(){ openFiles('~/Desktop/' + sid); } },
          { label: '在此打开终端', ico: 'term', run(){ openTerminal('~/Desktop/' + sid); } },
          { label: '属性', ico: 'text', run(){ toast('~/Desktop/' + sid + '　' + enabledProblems().length + ' 个题目目录'); } },
        ],
      });
      list.push({
        kind: 'trash', label: '回收站', key: 'trash', tip: '~/.local/share/Trash',
        onOpen(){ openTrash(); },
        menu: () => [
          { label: '打开', ico: 'trash', run(){ openTrash(); } },
          { label: '清空回收站', ico: 'trash', dim: true, run(){ toast('回收站已经是空的'); } },
        ],
      });
    }
    // 「提交试卷」不属于桌面：它挂在顶栏系统菜单与应用网格里（见 registerApps / mount）
    Desktop.renderIcons(list);
  }
  function openTrash(){
    openFiles('~/.local/share/Trash/files');
  }

  /* 应用清单严格对齐官方 NOI Linux 2.0 的「显示应用程序」网格
   * —— 以操作演示视频里的实际网格为准（比 ISO 的 manifest 更准，
   *    因为 manifest 里有包装了但没生成菜单项的情况）。
   * 网格按名称排序后为：文件 / 系统监视器 / 语言支持 / 终端 / 字符 / 字体 /
   *   Arbiter_local / Byobu Terminal / Code::Blocks IDE / Data Display Debugger /
   *   Emacs (GUI) / Emacs (Terminal) / Firefox 网络浏览器 / Geany /
   *   Joe's Own Editor ×4 / Kazam / LibreOffice Calc·Draw·Impress·Writer。
   * 注意：NOI Linux 2.0 里没有 VS Code（2021 年才发布），网格里也不该出现。 */
  function registerApps(){
    const apps = [
      { id: 'files',    label: '文件',        ico: 'folder',  group: '系统工具', desc: 'Nautilus 3.36', pin: true, run(){ openFiles(); } },
      { id: 'monitor',  label: '系统监视器',  ico: 'monitor', group: '系统工具', desc: '资源占用', run(){ openSysInfo(); } },
      { id: 'lang',     label: '语言支持',    ico: 'lang',    group: '系统工具', desc: '中文（简体）', run(){ openLangSupport(); } },
      { id: 'term',     label: '终端',        ico: 'term',    group: '系统工具', desc: 'GNOME Terminal 3.36', run(){ openTerminal(); } },
      { id: 'calculator', label: '计算器',    ico: 'calculator', group: '系统工具', desc: 'GNOME 计算器 3.36', run(){ openCalculator(); } },
      { id: 'gedit',    label: '文本编辑器',  ico: 'gedit',   group: '系统工具', desc: 'gedit 3.36', run(){ openTextEditor(); } },
      { id: 'archive',  label: '归档管理器',  ico: 'archive', group: '系统工具', desc: 'file-roller 3.36', run(){ openArchive(); } },
      { id: 'evince',   label: '文档查看器',  ico: 'evince',  group: '系统工具', desc: 'Evince 3.36', run(){ openDocumentViewer(); } },
      { id: 'gucharmap',label: '字符',        ico: 'char',    group: '系统工具', desc: '字符映射表', run(){ openCharmap(); } },
      { id: 'fonts',    label: '字体',        ico: 'fontv',   group: '系统工具', desc: '字体查看器', run(){ openFontViewer(); } },

      { id: 'arbiter',  label: 'Arbiter_local', ico: 'judge', group: '编程', desc: '本地评测系统', run(){ openArbiter(); } },
      { id: 'byobu',    label: 'Byobu Terminal', ico: 'termpanel', group: '编程', desc: '终端复用器', run(){ openTerminal(); } },
      { id: 'cb',       label: 'Code::Blocks IDE', ico: 'cb', group: '编程', desc: 'C/C++ IDE 20.03', run(){ openIDE('Code::Blocks'); } },
      { id: 'ddd',      label: 'Data Display Debugger', ico: 'ddd', group: '编程', desc: 'GDB 图形前端 3.3.12', run(){ openGDB('ddd'); } },
      { id: 'emacs',    label: 'Emacs (GUI)', ico: 'emacs',  group: '编程', desc: '编辑器 26.3', run(){ openTuiEditor('emacs'); } },
      { id: 'emacst',   label: 'Emacs (Terminal)', ico: 'emacs', group: '编程', desc: '编辑器 26.3', run(){ openTuiEditor('emacs'); } },
      { id: 'geany',    label: 'Geany',       ico: 'geany',  group: '编程', desc: '轻量 IDE 1.36', run(){ openIDE('Geany'); } },
      /* —— 下面这几个也在真机网格里（ISO 的 /usr/share/applications 原文） —— */
      { id: 'vscode',   label: 'Visual Studio Code', ico: 'vscode', group: '编程', desc: '代码编辑器 1.44', run(){ openCodeEditor('vscode'); } },
      { id: 'sublime',  label: 'Sublime Text', ico: 'sublime', group: '编程', desc: '代码编辑器 3.2', run(){ openCodeEditor('sublime'); } },
      { id: 'vim',      label: 'Vim', ico: 'vim', group: '编程', desc: 'vi 改进版 8.1', run(){ openTuiEditor('vim'); } },
      { id: 'mc',       label: 'Midnight Commander', ico: 'mc', group: '编程', desc: '双栏文件管理器 4.8', run(){ openTuiEditor('mc'); } },
      /* 四个 joe 变体的名字与图标照 /usr/share/applications 原文：
         Name 分别是 Joe's Own Editor / - EMACS Emulation / - NANO/PICO Emulation /
         - WordStar Emulation，Icon 全都是 accessories-text-editor（不是 joe.xpm） */
      { id: 'joe',      label: "Joe's Own Editor", ico: 'texteditor', group: '编程', desc: 'joe', run(){ openTuiEditor('joe'); } },
      { id: 'jmacs',    label: "Joe's Own Editor - EMACS Emulation", ico: 'texteditor', group: '编程', desc: 'jmacs', run(){ openTuiEditor('joe'); } },
      { id: 'jpico',    label: "Joe's Own Editor - NANO/PICO Emulation", ico: 'texteditor', group: '编程', desc: 'jpico', run(){ openTuiEditor('joe'); } },
      { id: 'jstar',    label: "Joe's Own Editor - WordStar Emulation", ico: 'texteditor', group: '编程', desc: 'jstar', run(){ openTuiEditor('joe'); } },

      { id: 'firefox',  label: 'Firefox 网络浏览器', ico: 'firefox', group: '互联网', desc: '79.0（考场内网）', pin: true, run(){ openFirefox(); } },

      { id: 'kazam',    label: 'Kazam', ico: 'kazam', group: '影音', desc: '屏幕录制 1.4.5', run(){ openKazam(); } },
      { id: 'low',      label: 'LibreOffice Calc',    ico: 'calc',    group: '办公', desc: '电子表格 6.4.4', run(){ openLibreOffice('Calc'); } },
      { id: 'lodraw',   label: 'LibreOffice Draw',    ico: 'lodraw',  group: '办公', desc: '绘图 6.4.4',    run(){ openLibreOffice('Draw'); } },
      { id: 'loimpress',label: 'LibreOffice Impress', ico: 'loimpress', group: '办公', desc: '演示文稿 6.4.4', run(){ openLibreOffice('Impress'); } },
      { id: 'lowriter', label: 'LibreOffice Writer',  ico: 'lowriter', group: '办公', desc: '文字处理 6.4.4', run(){ openLibreOffice('Writer'); } },

      /* Ubuntu 20.04 自带的「软件」；打开即要求管理员认证，考场里装不了东西 */
      { id: 'software', label: '软件', ico: 'software', group: '系统工具', desc: 'Ubuntu 软件中心（需管理员）', run(){ openSoftwareCenter(); } },
    ];

    /* 考试相关入口不进应用网格（真机网格里没有它们），统一放在顶栏系统菜单；
       管理员账户额外多一个「考试管理」 */
    if (isAdmin()){
      apps.push({ id: 'admin-center', label: '考试管理', ico: 'settings', group: '系统工具', desc: '考试设置 · 题库 · 控制', run(){ Admin.show(); } });
    }

    Desktop.registerApps(apps);
  }

  window.__app = function (id){
    if (id === 'recovery') return openRecoverySystem();
    if (id === 'submit' || id === 'finish') return openSubmit();
    if (id === 'notice') return openNotice();
    if (id === 'sysinfo') return openSysInfo();
    if (id === 'network') return openNetworkSettings();
    if (id === 'software') return openSoftwareCenter();
    if (id === 'settings') return openSettings();
    if (id === 'admin'){ Admin.show(); return; }
    return Desktop.launch(id);
  };
  window.__powerOff = function(){ if (window.Greeter) Greeter.powerOff(); };

  function renderWatermark(){
    const s = Store.getSettings();
    const stu = Store.getStudent() || {};
    const wm = $('#sWatermark');
    if (!wm) return;
    if (!s.watermark){ wm.classList.add('hidden'); return; }
    wm.classList.remove('hidden');
    const text = (stu.account || '') + ' ' + (stu.name || '');
    let out = '';
    for (let r = 0; r < 12; r++){
      let line = '';
      for (let c = 0; c < 6; c++) line += text + '　　　';
      out += line + '\n';
    }
    wm.textContent = out;
  }

  /* ================= 归档管理器（file-roller 3.36） ================= */
  /* 真机双击 .zip 就是这个窗口：headerbar 左边「打开」、中间压缩包名、右边主菜单，
     内容是按 名称/大小/类型/修改时间 四列的列表（不是图标视图）。 */
  function openZip(p){
    const problems = enabledProblems();
    p = p || problems[0];
    if (!p){ toast('没有可用题目', 'err'); return; }
    const win = createWindow({
      id: 'zip:' + p.id, title: p.id + '.zip', ico: 'archive', w: 820, h: 540, headBar: true,
    });
    if (win._built){ Desktop.focusWin(win); return win; }
    win._built = true;

    const bExtract = el('button', 'ar-btn', '解压缩');
    const ttl = el('div', 'ar-title', esc(p.id) + '.zip');
    const bMenu = el('button', 'nu-tb', NU_MENU); bMenu.title = '主菜单';
    win.headApp.appendChild(bExtract);
    win.headApp.appendChild(ttl);
    win.headApp.appendChild(bMenu);

    const list = el('div', 'ar-list');
    list.innerHTML =
      '<div class="ar-head">' +
      '<span class="ar-c-name">名称</span><span class="ar-c-size">大小</span>' +
      '<span class="ar-c-type">类型</span><span class="ar-c-time">修改时间</span></div>';

    const samples = p.tests.map((t, i) => ({ t, i })).filter(x => x.t.sample);
    const now = new Date();
    const stamp = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate()) +
      ' ' + pad2(now.getHours()) + ':' + pad2(now.getMinutes());

    function row(ico, name, size, type, dbl, indent){
      const r = el('div', 'ar-row' + (indent ? ' ar-indent' : ''));
      r.innerHTML =
        '<span class="ar-c-name">' + fsIcoHTML(ico) + '<b>' + esc(name) + '</b></span>' +
        '<span class="ar-c-size">' + esc(size) + '</span>' +
        '<span class="ar-c-type">' + esc(type) + '</span>' +
        '<span class="ar-c-time">' + stamp + '</span>';
      if (dbl) r.ondblclick = dbl;
      list.appendChild(r);
      return r;
    }
    row('pdf', p.id + '.pdf', '—', 'PDF 文档', () => openStatement(p));
    row('folder', p.id + '/', '—', '文件夹', null);
    samples.forEach(({ t, i }) => {
      [['.in', t.input, '输入数据'], ['.ans', t.expected, '答案']].forEach(([ext, content, kind]) => {
        const name = p.id + (i + 1) + ext;
        row('text', name, fmtSize(content.length), kind + '（纯文本）',
          () => openText(name, content), true);
      });
    });

    win.body.appendChild(list);
    /* 解压缩必须真的往虚拟文件系统里落文件，且前提是包已经从回收系统下载过 */
    bExtract.onclick = () => {
      if (!Desktop.fs.exists(zipPath(p.id))){
        toast('压缩包尚未下载，请先登录程序回收系统下载试题', 'err');
        return;
      }
      const dir = extractProblem(p);
      toast('已解压到 ' + Desktop.fs.pretty(dir), 'ok');
    };
    bMenu.onclick = () => toast('主菜单：提取 / 全部提取 / 重新载入');
    return win;
  }
  /* 网格里的「归档管理器」：开当前题的压缩包（没下载过就提示去下载） */
  function openArchive(){
    const p = (ideWin && enabledProblems().find(x => x.id === ideWin.problemId)) || enabledProblems()[0];
    if (p && !Desktop.fs.exists(zipPath(p.id))){
      toast('还没有试题压缩包，请先在程序回收系统「试题下载」里下载', 'err');
      return null;
    }
    return openZip(p);
  }

  function openText(name, content){
    const win = createWindow({ title: name, ico: 'text', w: 580, h: 400 });
    const pre = el('div', 'txt-view');
    pre.textContent = content;
    win.body.appendChild(pre);
  }

  /* ================= 文档查看器（Evince 3.36） ================= */
  function openStatement(p){
    p = p || enabledProblems()[0];
    if (!p){ toast('没有可用题目', 'err'); return; }
    const win = createWindow({
      id: 'stmt:' + p.id, title: p.id + '.pdf', ico: 'evince', w: 900, h: 700, headBar: true,
    });
    if (win._built){ Desktop.focusWin(win); return win; }
    win._built = true;

    /* headerbar：翻页 + 文件名（Evince 把文档名放在标题栏里） + 缩放 + 菜单 */
    const bPrev = el('button', 'nu-tb', NU_BACK); bPrev.title = '上一页'; bPrev.disabled = true;
    const bNext = el('button', 'nu-tb', NU_FWD); bNext.title = '下一页'; bNext.disabled = true;
    const name = el('div', 'pdf-name', esc(p.id) + '.pdf');
    win.headApp.appendChild(bPrev);
    win.headApp.appendChild(name);
    win.headApp.appendChild(bNext);
    const bZoomOut = el('button', 'nu-tb', '<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4.6 7h4.8M10.4 10.4L14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>');
    const bZoomIn = el('button', 'nu-tb', '<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4.6 7h4.8M7 4.6v4.8M10.4 10.4L14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>');
    const bMenu = el('button', 'nu-tb', NU_MENU);
    win.headApp.appendChild(bZoomOut); win.headApp.appendChild(bZoomIn); win.headApp.appendChild(bMenu);

    const bodyEl = el('div', 'ev-body');
    const sheet = el('div', 'ev-page');
    const st = p.statement || { type: 'text', data: '' };
    if (st.type === 'pdf'){
      const f = el('iframe');
      f.src = st.data;
      sheet.appendChild(f);
      sheet.classList.add('ev-frame');
    } else if (st.type === 'html'){
      sheet.innerHTML = '<div class="prob-doc">' + st.data + '</div>';
    } else {
      sheet.innerHTML = '<div class="prob-doc"><h2>' + esc(p.title) + '</h2>' +
        '<pre style="white-space:pre-wrap;font:13px/1.7 Consolas,monospace">' + esc(st.data) + '</pre></div>';
    }
    bodyEl.appendChild(sheet);
    win.body.appendChild(bodyEl);

    let zoom = 1;
    const applyZoom = () => { sheet.style.transform = zoom === 1 ? '' : 'scale(' + zoom + ')'; };
    /* 步进必须抹掉浮点误差，否则从 1.1 缩回来会停在 1.0000000000000002 */
    const step = (d) => { zoom = Math.round((zoom + d) * 10) / 10; zoom = Math.max(0.6, Math.min(1.6, zoom)); applyZoom(); };
    bZoomIn.onclick = () => step(0.1);
    bZoomOut.onclick = () => step(-0.1);
    bMenu.onclick = () => toast('Evince 菜单：缩放 / 双页 / 旋转 / 导出');
    return win;
  }
  function openDocumentViewer(){
    const p = (ideWin && enabledProblems().find(x => x.id === ideWin.problemId)) || enabledProblems()[0];
    return openStatement(p);
  }

  /* ================= GNOME 计算器 3.36 ================= */
  /* 基本模式键盘与原机一致：% CE C ⌫ / ¹⁄x x² √x ÷ / 7 8 9 × / 4 5 6 − / 1 2 3 + / ± 0 . = */
  const CALC_PAD = [
    ['%', 'CE', 'C', '⌫'],
    ['¹⁄x', 'x²', '√x', '÷'],
    ['7', '8', '9', '×'],
    ['4', '5', '6', '−'],
    ['1', '2', '3', '+'],
    ['±', '0', '.', '='],
  ];
  const CALC_OPS = '÷×−+';

  function calcFmt(n){
    if (typeof n === 'string') return n;
    if (!isFinite(n)) return '错误';
    if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
    return String(Number(n.toPrecision(12)));
  }

  function openCalculator(){
    const win = createWindow({ id: 'calculator', title: '计算器', ico: 'calculator', w: 376, h: 552 });
    if (win._built){ Desktop.focusWin(win); return win; }
    win._built = true;

    const box = el('div', 'calc');
    box.innerHTML =
      '<div class="calc-disp"><div class="calc-expr"></div><div class="calc-val">0</div></div>' +
      '<div class="calc-pad"></div>';
    win.body.appendChild(box);
    const exprEl = box.querySelector('.calc-expr');
    const valEl = box.querySelector('.calc-val');
    const pad = box.querySelector('.calc-pad');

    let acc = null, op = null, cur = '0', fresh = true, done = false;

    const apply = (a, b, o) =>
      o === '+' ? a + b : o === '−' ? a - b : o === '×' ? a * b : (b === 0 ? NaN : a / b);

    function paint(){
      valEl.textContent = cur === '' || cur === '-' ? '0' : cur;
      exprEl.textContent = acc == null ? '' : calcFmt(acc) + ' ' + op;
    }
    function digit(d){
      if (done || fresh){ cur = d === '.' ? '0.' : d; fresh = false; done = false; }
      else {
        if (d === '.' && cur.indexOf('.') >= 0) return;
        cur = (cur === '0' && d !== '.') ? d : cur + d;
      }
      paint();
    }
    function setOp(o){
      const v = Number(cur);
      acc = (acc != null && !fresh) ? apply(acc, v, op) : v;
      op = o; fresh = true; done = false;
      paint();
    }
    function equals(){
      if (acc == null || op == null){ done = true; return; }
      const v = Number(cur);
      const r = apply(acc, v, op);
      exprEl.textContent = calcFmt(acc) + ' ' + op + ' ' + calcFmt(v) + ' =';
      cur = calcFmt(r); acc = null; op = null; fresh = true; done = true;
      valEl.textContent = cur;
    }
    function press(k){
      if (/^[0-9.]$/.test(k)) return digit(k);
      if (k === 'C'){ acc = null; op = null; cur = '0'; fresh = true; done = false; exprEl.textContent = ''; return paint(); }
      if (k === 'CE'){ cur = '0'; fresh = true; return paint(); }
      if (k === '⌫'){
        if (fresh || done) return;
        cur = cur.slice(0, -1) || '0';
        return paint();
      }
      if (k === '±'){
        if (cur === '0') return;
        cur = cur.charAt(0) === '-' ? cur.slice(1) : '-' + cur;
        return paint();
      }
      if (CALC_OPS.indexOf(k) >= 0) return setOp(k);
      if (k === '=') return equals();
      const v = Number(cur);
      if (k === '%'){ cur = calcFmt(v / 100); fresh = true; return paint(); }
      if (k === '¹⁄x'){ cur = calcFmt(1 / v); fresh = true; return paint(); }
      if (k === 'x²'){ cur = calcFmt(v * v); fresh = true; return paint(); }
      if (k === '√x'){ cur = calcFmt(Math.sqrt(v)); fresh = true; return paint(); }
    }

    CALC_PAD.forEach(rows => rows.forEach(k => {
      const b = el('button', 'calc-key', esc(k));
      if (CALC_OPS.indexOf(k) >= 0 || k === '=' || k === '%') b.classList.add('op');
      if (k === '=') b.classList.add('eq');
      b.onclick = () => press(k);
      pad.appendChild(b);
    }));

    /* 键盘也能用（真机同样支持） */
    win.body.tabIndex = 0;
    win.el.addEventListener('keydown', e => {
      const map = { '*': '×', 'x': '×', '/': '÷', '-': '−', '+': '+', 'Enter': '=', '=': '=',
                    'Escape': 'C', 'Backspace': '⌫', '%': '%' };
      if (/^[0-9.]$/.test(e.key)){ press(e.key); e.preventDefault(); }
      else if (map[e.key]){ press(map[e.key]); e.preventDefault(); }
    });
    setTimeout(() => { try { win.body.focus(); } catch (err) {} }, 30);
    return win;
  }

  /* ================= 文本编辑器（gedit 3.36） ================= */
  const GEDIT_NEW = '<svg viewBox="0 0 16 16"><path d="M9.2 2H4.4A1.4 1.4 0 0 0 3 3.4v9.2A1.4 1.4 0 0 0 4.4 14h7.2a1.4 1.4 0 0 0 1.4-1.4V5.6z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M9.2 2v3.6H13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  const GEDIT_OPEN = '<svg viewBox="0 0 16 16"><path d="M1.8 4.2A1.2 1.2 0 0 1 3 3h3.2l1.4 1.5h5.4A1.2 1.2 0 0 1 14.2 6v6.1a1.2 1.2 0 0 1-1.2 1.2H3a1.2 1.2 0 0 1-1.2-1.2z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  const GEDIT_FIND = '<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10.4 10.4L14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

  let geditSeq = 0;
  function openTextEditor(file){
    geditSeq++;
    const name = (file && file.name) || ('未命名文档 ' + geditSeq);
    const win = createWindow({
      id: 'gedit:' + name, title: name + ' — 文本编辑器', ico: 'gedit', w: 780, h: 560, headBar: true,
    });
    if (win._built){ Desktop.focusWin(win); return win; }
    win._built = true;

    const bNew = el('button', 'nu-tb', GEDIT_NEW); bNew.title = '新建文档';
    const bOpen = el('button', 'nu-tb', GEDIT_OPEN); bOpen.title = '打开';
    const ttl = el('div', 'ged-title', esc(name));
    const bFind = el('button', 'nu-tb', GEDIT_FIND); bFind.title = '查找';
    const bMenu = el('button', 'nu-tb', NU_MENU); bMenu.title = '主菜单';
    win.headApp.appendChild(bNew);
    win.headApp.appendChild(bOpen);
    win.headApp.appendChild(ttl);
    win.headApp.appendChild(bFind);
    win.headApp.appendChild(bMenu);

    const area = el('textarea', 'ged-area');
    area.spellcheck = false;
    area.setAttribute('wrap', 'off');
    area.value = (file && file.content) || '';
    win.body.appendChild(area);

    const st = el('div', 'ged-status');
    st.innerHTML = '<span class="ged-pos">行 1，列 1</span><span class="ged-sep"></span>' +
      '<span class="ged-kind">纯文本</span><span class="ged-sep"></span>' +
      '<span>制表符宽度：8</span>';
    win.body.appendChild(st);
    const posEl = st.querySelector('.ged-pos');

    function caret(){
      const head = area.value.slice(0, area.selectionStart);
      const line = head.split('\n').length;
      return '行 ' + line + '，列 ' + (head.length - head.lastIndexOf('\n'));
    }
    function setTitle(){
      const t = win.head.querySelector('.win-title');
      if (t) t.textContent = name + ' — 文本编辑器';
      ttl.textContent = name;
    }
    function save(){
      const target = '~/Desktop/' + name + (/\.\w+$/.test(name) ? '' : '.txt');
      try {
        Desktop.fs.write(target, area.value);
        toast('已保存 ' + Desktop.fs.pretty(Desktop.fs.abs(target)), 'ok');
      } catch (e){ toast('保存失败：' + e.message, 'err'); }
    }

    area.addEventListener('keyup', () => { posEl.textContent = caret(); });
    area.addEventListener('click', () => { posEl.textContent = caret(); });
    area.addEventListener('keydown', e => {
      if (e.key === 'Tab'){
        e.preventDefault();
        area.setRangeText('        ', area.selectionStart, area.selectionEnd, 'end');
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's'){ e.preventDefault(); save(); }
    });
    bNew.onclick = () => { openTextEditor(); };
    bOpen.onclick = () => {
      const fs = Desktop.fs;
      const items = (fs.list('~/Desktop') || []).filter(n => n.type === 'file');
      if (!items.length){ toast('桌面没有可打开的文件', 'err'); return; }
      const n = items[0];
      openTextEditor({ name: n.name, content: n.content || '' });
    };
    bMenu.onclick = () => toast('gedit 菜单：保存 / 另存为 / 首选项');
    bFind.onclick = () => toast('查找：Ctrl+F');
    setTitle();
    setTimeout(() => { try { area.focus(); } catch (err) {} }, 30);
    return win;
  }

  /* ================= VS Code / Sublime Text ================= */
  /* 两家共用一个「可编辑的高亮代码区」：textarea 文字透明叠在着色好的 <pre> 上，
     滚动同步。词法器复用 joe 那个，靠 CSS 换配色（VS Code 的 #569cd6 / Sublime 的
     Monokai #66d9ef），省一套实现。 */
  function mountCodeArea(host, opts){
    opts = opts || {};
    const wrap = el('div', 'ce-code');
    wrap.innerHTML =
      '<div class="ce-gutter"><div class="ce-gut"></div></div>' +
      '<div class="ce-view"><pre class="ce-hl"></pre>' +
      '<textarea class="ce-ta" spellcheck="false" wrap="off" autocomplete="off" autocapitalize="off"></textarea></div>';
    host.appendChild(wrap);
    const gut = wrap.querySelector('.ce-gut');
    const hl = wrap.querySelector('.ce-hl');
    const ta = wrap.querySelector('.ce-ta');

    function caret(){
      const head = ta.value.slice(0, ta.selectionStart);
      return { line: head.split('\n').length, col: head.length - head.lastIndexOf('\n') };
    }
    function sync(){
      hl.style.transform = 'translate(' + (-ta.scrollLeft) + 'px,' + (-ta.scrollTop) + 'px)';
      gut.style.transform = 'translateY(' + (-ta.scrollTop) + 'px)';
    }
    function paint(){
      hl.innerHTML = joeHighlight(ta.value) + '\n';
      const n = ta.value.split('\n').length;
      let g = '';
      for (let i = 1; i <= n; i++) g += i + '\n';
      gut.textContent = g;
      sync();
      if (opts.onCaret) opts.onCaret(caret());
    }
    ta.addEventListener('input', paint);
    ta.addEventListener('scroll', sync);
    ta.addEventListener('keyup', () => { if (opts.onCaret) opts.onCaret(caret()); });
    ta.addEventListener('click', () => { if (opts.onCaret) opts.onCaret(caret()); });
    ta.addEventListener('keydown', e => {
      if (e.key === 'Tab'){
        e.preventDefault();
        ta.setRangeText('    ', ta.selectionStart, ta.selectionEnd, 'end');
        paint();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's'){
        e.preventDefault();
        if (opts.onSave) opts.onSave(ta.value);
        paint();
      }
    });
    return {
      ta, paint, caret,
      set(v){ ta.value = v; ta.selectionStart = ta.selectionEnd = 0; paint(); },
      get(){ return ta.value; },
      focus(){ try { ta.focus(); } catch (e) {} },
    };
  }

  const CE_MENUS = ['文件', '编辑', '选择', '查看', '转到', '运行', '终端', '帮助'];
  const CE_ACT = [
    { t: '资源管理器', svg: '<svg viewBox="0 0 24 24"><path d="M4 4h6l2 2h8v14H4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>' },
    { t: '搜索', svg: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M15 15l5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' },
    { t: '源代码管理', svg: '<svg viewBox="0 0 24 24"><circle cx="7" cy="6" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="7" cy="18" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="17" cy="12" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 8.4v7.2M9.4 6.6H14a3 3 0 0 1 3 3v.4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>' },
    { t: '运行和调试', svg: '<svg viewBox="0 0 24 24"><path d="M5 5l14 7-14 7z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>' },
    { t: '扩展', svg: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="13" y="4" width="7" height="7" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M16.5 13v7M13 16.5h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' },
  ];

  function openCodeEditor(kind){
    const isVsc = kind !== 'sublime';
    const label = isVsc ? 'Visual Studio Code' : 'Sublime Text';
    const problems = enabledProblems();
    if (!problems.length){ toast('没有可用题目', 'err'); return; }
    let cur = (ideWin && problems.find(p => p.id === ideWin.problemId)) ? ideWin.problemId : problems[0].id;

    const win = createWindow({
      id: 'ce:' + kind, title: cur + '.cpp - ' + label, ico: kind, w: 1080, h: 720,
    });
    if (win._built){ Desktop.focusWin(win); return win; }
    win._built = true;

    const box = el('div', 'ce ce-' + (isVsc ? 'vsc' : 'sub'));
    box.innerHTML =
      (isVsc ? '<div class="ce-menu">' + CE_MENUS.map(m => '<span class="ce-mi">' + m + '</span>').join('') + '</div>' : '') +
      '<div class="ce-body">' +
        (isVsc ? '<div class="ce-act">' + CE_ACT.map((a, i) =>
          '<button class="ce-act-b' + (i === 0 ? ' on' : '') + '" title="' + a.t + '">' + a.svg + '</button>').join('') + '</div>' : '') +
        '<div class="ce-side">' +
          '<div class="ce-side-h">' + (isVsc ? '资源管理器' : '侧栏') + '</div>' +
          '<div class="ce-tree"></div>' +
        '</div>' +
        '<div class="ce-main">' +
          '<div class="ce-tabs"></div>' +
          '<div class="ce-editor"></div>' +
        '</div>' +
      '</div>' +
      '<div class="ce-status"></div>';
    win.body.appendChild(box);

    const tree = box.querySelector('.ce-tree');
    const tabs = box.querySelector('.ce-tabs');
    const editor = box.querySelector('.ce-editor');
    const status = box.querySelector('.ce-status');

    function paintTree(){
      tree.innerHTML = '';
      const head = el('div', 'ce-node root');
      head.innerHTML = '<span class="ce-caret">▾</span><b>' + esc('teacher') + '</b>';
      tree.appendChild(head);
      problems.forEach(p => {
        const n = el('div', 'ce-node file' + (p.id === cur ? ' sel' : ''));
        n.dataset.problem = p.id;
        n.style.paddingLeft = '22px';
        n.innerHTML = '<img class="ce-fi" src="assets/icons/cpp.png" alt=""><span>' + esc(p.id) + '.cpp</span>';
        n.onclick = () => open(p.id);
        tree.appendChild(n);
      });
    }
    function paintTabs(){
      tabs.innerHTML = '<div class="ce-tab on">' + esc(cur) + '.cpp' +
        '<span class="ce-tab-x">×</span></div>';
    }
    function paintStatus(c){
      if (isVsc){
        status.innerHTML =
          '<span class="ce-st-l"><span class="ce-branch">⎇ main</span></span>' +
          '<span class="ce-st-r">' +
          '<span class="ce-st-i">Lg 12, Col 5</span>' +
          '<span class="ce-st-i">UTF-8</span><span class="ce-st-i">C++</span>' +
          '<span class="ce-st-i">空格: 4</span></span>';
      } else {
        status.innerHTML =
          '<span class="ce-st-l">' + esc(cur) + '.cpp</span>' +
          '<span class="ce-st-r"><span class="ce-st-i">Line 1, Column 1</span>' +
          '<span class="ce-st-i">UTF-8</span><span class="ce-st-i">C++</span></span>';
      }
      if (c) onCaret(c);
    }
    const caretEl = () => status.querySelector('.ce-st-r .ce-st-i');
    function onCaret(c){
      const elx = caretEl();
      if (!elx) return;
      elx.textContent = isVsc ? ('Lg ' + c.line + ', Col ' + c.col) : ('Line ' + c.line + ', Column ' + c.col);
    }

    const code = mountCodeArea(editor, {
      onCaret,
      onSave(v){ saveCode(v); },
    });

    function title(){
      const t = win.head.querySelector('.win-title');
      if (t) t.textContent = cur + '.cpp - ' + label;
    }
    function saveCode(v){
      Store.saveCode(cur, v);
      try { Desktop.fs.write('~/Desktop/teacher/' + cur + '/' + cur + '.cpp', v); } catch (e) {}
      toast('已保存 ' + cur + '.cpp', 'ok');
    }
    function open(id){
      if (id === cur) return;
      saveCode(code.get());
      cur = id;
      code.set(Store.getCode(cur) || '');
      paintTree(); paintTabs(); paintStatus(); title();
    }

    paintTree();
    paintTabs();
    paintStatus();
    code.set(Store.getCode(cur) || '');
    title();
    setTimeout(() => code.focus(), 40);
    return win;
  }

  /* ================= IDE ================= */
  /* Code::Blocks 20.03 的真实菜单栏（照官方演示视频逐字抄的），
   * 顺序：File Edit View Search Project Build Debug wxSmith Tools Tools+ Plugins DoxyBlocks Settings Valgrind Help */
  const IDE_MENU_ORDER = ['File','Edit','View','Search','Project','Build','Debug','wxSmith','Tools','Tools+','Plugins','DoxyBlocks','Settings','Valgrind','Help'];
  const IDE_MENU_ITEMS = {
    File: [
      { label: '新建文件', hint: 'Ctrl+N', run(it, ctx){ ctx.newFile(); } },
      { label: '打开…', hint: 'Ctrl+O', run(it, ctx){ ctx.openFile(); } },
      { label: '保存', hint: 'Ctrl+S', run(it, ctx){ ctx.save(); } },
      { label: '另存为…', hint: 'F12', dim: true },
      { sep: true },
      { label: '关闭窗口', hint: 'Ctrl+W', run(it, ctx){ ctx.close(); } },
    ],
    Edit: [
      { label: '撤销', hint: 'Ctrl+Z', run(it, ctx){ ctx.edit('undo'); } },
      { label: '重做', hint: 'Ctrl+Y', run(it, ctx){ ctx.edit('redo'); } },
      { sep: true },
      { label: '剪切', hint: 'Ctrl+X', run(it, ctx){ ctx.edit('cut'); } },
      { label: '复制', hint: 'Ctrl+C', run(it, ctx){ ctx.edit('copy'); } },
      { label: '粘贴', hint: 'Ctrl+V', run(it, ctx){ ctx.edit('paste'); } },
      { label: '全选', hint: 'Ctrl+A', run(it, ctx){ ctx.edit('selectAll'); } },
      { sep: true },
      { label: '查找…', hint: 'Ctrl+F', dim: true },
    ],
    View: [
      { label: '管理器面板', run(it, ctx){ ctx.mgr(); } },
      { label: '日志面板', run(it, ctx){ ctx.log(); } },
      { sep: true },
      { label: '全屏', hint: 'F11', dim: true },
    ],
    Search: [
      { label: '查找…', dim: true },
      { label: '在文件中查找…', dim: true },
    ],
    Project: [
      { label: '新建项目…', dim: true },
      { label: '构建选项…', dim: true },
    ],
    Build: [
      { label: '编译当前文件', hint: 'Ctrl+Shift+F9', run(it, ctx){ ctx.judge(); } },
      { label: '运行', hint: 'F9', run(it, ctx){ ctx.judge(); } },
      { label: '编译并运行', hint: 'F9', run(it, ctx){ ctx.judge(); } },
      { label: '全部重新编译', hint: 'Ctrl+F11', run(it, ctx){ ctx.judge(); } },
      { sep: true },
      { label: '终止', dim: true },
    ],
    Debug: [
      { label: '启动调试', hint: 'F8', run(){ openGDB(); } },
      { label: '单步进入', hint: 'Shift+F7', dim: true },
      { label: '单步跳过', hint: 'F7', dim: true },
      { sep: true },
      { label: '切换断点', hint: 'F5', dim: true },
    ],
    wxSmith: [{ label: '（未加载 wxWidgets 向导）', dim: true }],
    Tools: [
      { label: '代码补全设置…', dim: true },
      { label: '环境变量…', dim: true },
    ],
    'Tools+': [{ label: '（需先在插件管理器中启用）', dim: true }],
    Plugins: [{ label: '管理插件…', dim: true }],
    DoxyBlocks: [{ label: '生成文档', dim: true }],
    Settings: [
      { label: '编辑器…', dim: true },
      { label: '环境…', dim: true },
      { label: '编译器与调试器…', dim: true },
    ],
    Valgrind: [
      { label: '内存检查', dim: true },
      { label: '调用分析', dim: true },
    ],
    Help: [
      { label: '关于 Code::Blocks', run(){ toast('Code::Blocks 20.03（NOI Linux 2.0 预装版本）'); } },
    ],
  };

  /* 窗口标题照各编辑器真实格式：<文件名> - <程序名> */
  function ideWinTitle(app, file){
    if (app === 'Geany') return file + ' - Geany';
    if (app === 'Gedit') return file + ' - gedit';
    if (app === 'Lazarus') return file + ' - Lazarus';
    return file + ' - Code::Blocks 20.03';
  }

  /* ── Code::Blocks 20.03 ──────────────────────────────────────────────
   * 外壳（菜单栏 / 工具栏 / Management / 状态栏）在这边搭，编辑区交给
   * ide.html?ui=cbc（那边把自带工具栏、状态栏藏掉，只留编辑区 + 底部停靠面板）。
   * 菜单文字、工具栏图标都来自 ISO：/usr/share/codeblocks/images 下的真图标。 */
  function openCodeBlocks(problems){
    const sid = 'teacher';
    let cur = (ideWin && ideWin.problemId) || problems[0].id;
    const win = createWindow({
      id: 'ide', title: ideWinTitle('Code::Blocks', cur + '.cpp'),
      ico: 'cb', w: 1180, h: 760, onClose(){ ideWin = null; },
    });
    if (win._built) return win;
    win._built = true;

    const shell = el('div', 'cbc-shell');
    win.body.appendChild(shell);

    /* ── 菜单栏 ── */
    const mb = el('div', 's-menubar');
    const menuCtx = {
      save(){ postIDE({ type: 'ide:getCode' }); setTimeout(() => toast('已保存', 'ok'), 120); },
      judge(){ postIDE({ type: 'ide:runJudge' }); },
      close(){ Desktop.closeWin(win); },
      newFile(){ ideNewFile(); },
      openFile(){ ideOpenChooser(); },
      mgr(){ toggleSide(); },
      log(){ postIDE({ type: 'ide:toggleLog' }); },
      edit(op){ postIDE({ type: 'ide:edit', op }); },
    };
    IDE_MENU_ORDER.forEach(name => {
      const b = el('div', 'mb-item', name);
      b.addEventListener('mousedown', e => {
        e.preventDefault(); e.stopPropagation();
        const items = (IDE_MENU_ITEMS[name] || []).map(it => it.dim || it.sep
          ? it
          : Object.assign({}, it, { run(){ it.run(it, menuCtx); } }));
        Desktop.openMenuAt(b, '', items);
      });
      mb.appendChild(b);
    });
    shell.appendChild(mb);

    /* ── 工具栏 ── */
    const tb = el('div', 'cbc-toolbar');
    function tbBtn(img, title, fn, dim){
      const b = el('button', 'cbc-tb' + (dim ? ' off' : ''));
      b.title = title;
      b.innerHTML = '<img src="assets/cb/' + img + '" alt="">';
      if (fn && !dim) b.onclick = fn;
      tb.appendChild(b);
      return b;
    }
    function tbSep(){ tb.appendChild(el('div', 'cbc-tb-sep')); }
    tbBtn('folder_new.png', '新建空白文件 (Ctrl+Shift+N)', () => menuCtx.newFile());
    tbBtn('folder.png',     '打开已有文件 (Ctrl+O)', () => menuCtx.openFile());
    const tbSave = tbBtn('source.png', '保存当前文件 (Ctrl+S)', () => menuCtx.save());
    tbSep();
    tbBtn('rebuild.png',    '全部重新编译 (Ctrl+F11)', () => postIDE({ type: 'ide:build' }));
    tbBtn('compile.png',    '编译当前文件 (Ctrl+F9)',  () => postIDE({ type: 'ide:build' }));
    tbBtn('compilerun.png', '编译并运行 (F9)',         () => postIDE({ type: 'ide:runJudge' }));
    tbBtn('stop.png',       '终止当前构建 (Ctrl+C)', null, true);
    tbSep();
    tb.appendChild(el('span', 'cbc-tb-lbl', 'Target:'));
    const tgt = el('select');
    ['Debug', 'Release'].forEach(v => { const o = el('option', '', v); o.value = v; tgt.appendChild(o); });
    tb.appendChild(tgt);
    tb.appendChild(el('span', 'cbc-tb-lbl', '标准:'));
    const stdSel = el('select');
    [['c++11', 'C++11'], ['c++14', 'C++14'], ['c++17', 'C++17']].forEach(([v, t]) => {
      const o = el('option', '', t); o.value = v; stdSel.appendChild(o);
    });
    stdSel.value = 'c++17';
    tb.appendChild(stdSel);
    shell.appendChild(tb);

    /* ── 中部：Management + 编辑区 ── */
    const mid = el('div', 'cbc-body');
    const side = el('div', 'cbc-side');
    const sideHead = el('div', 'cbc-side-head');
    sideHead.innerHTML = '<img class="cbc-ico" src="assets/cb/source.png" alt="">' +
      '<span>Management</span><span class="cbc-x" title="关闭面板">✕</span>';
    const tree = el('div', 'cbc-tree');
    const symBox = el('div', 'cbc-syms');
    const resBox = el('div', 'cbc-res', '<div class="cbc-res-empty">本项目没有资源文件</div>');
    const sideTabs = el('div', 'cbc-side-tabs');
    sideTabs.innerHTML = '<button class="on">Projects</button><button>Symbols</button><button>Resources</button>';
    side.appendChild(sideHead); side.appendChild(tree);
    side.appendChild(symBox); side.appendChild(resBox);
    side.appendChild(sideTabs);
    symBox.style.display = 'none'; resBox.style.display = 'none';
    /* 三个页签真切换：Projects 是项目树，Symbols 是当前源码里的函数，Resources 恒为空 */
    const tabPanes = [tree, symBox, resBox];
    [...sideTabs.children].forEach((b, i) => {
      b.onclick = () => {
        [...sideTabs.children].forEach((x, j) => x.classList.toggle('on', j === i));
        tabPanes.forEach((p, j) => { p.style.display = j === i ? '' : 'none'; });
        if (i === 1) paintSymbols();
      };
    });
    sideHead.querySelector('.cbc-x').onclick = () => toggleSide(false);

    const frame = el('iframe', 'cbc-frame');
    frame.src = 'ide.html?ui=cbc';
    mid.appendChild(side); mid.appendChild(frame);
    shell.appendChild(mid);

    /* ── 状态栏 ── */
    const sb = el('div', 'cbc-statusbar');
    sb.innerHTML =
      '<span class="cbc-sb" data-cbc="file">—</span>' +
      '<span class="cbc-sb" data-cbc="caret">行 1, 列 1</span>' +
      '<span class="cbc-sb" data-cbc="mode">INS</span>' +
      '<span class="cbc-sb" data-cbc="syntax">C++</span>' +
      '<span class="cbc-sb push dim" data-cbc="path">—</span>' +
      '<span class="cbc-sb dim save-dot">已保存</span>';
    shell.appendChild(sb);

    /* 启动图：真机 Code::Blocks 起来时先弹这张 splash */
    const splash = el('div', 'cbc-splash');
    splash.innerHTML = '<img src="assets/cb/splash.png" alt="Code::Blocks 20.03">';
    shell.appendChild(splash);

    const sbFile = sb.querySelector('[data-cbc="file"]');
    const sbCaret = sb.querySelector('[data-cbc="caret"]');
    const sbPath = sb.querySelector('[data-cbc="path"]');
    const treeFiles = {};

    let othersBox = null;
    let extractedSig = '';
    const treeSig = () => problems.map(p => problemExtracted(p.id) ? 1 : 0).join('');
    /* 分支折叠状态：Workspace / 项目 / Sources / Others（默认全开） */
    const openSet = new Set(['ws', 'proj', 'src', 'oth']);
    function buildTree(){
      extractedSig = treeSig();
      tree.innerHTML = '';
      for (const k in treeFiles) delete treeFiles[k];
      const op = k => openSet.has(k);
      const tg = k => { if (openSet.has(k)) openSet.delete(k); else openSet.add(k); buildTree(); };
      const add = (depth, caret, ico, label, cls, onClick, parent) => {
        const n = el('div', 'cbc-node' + (cls ? ' ' + cls : ''));
        n.style.paddingLeft = (4 + depth * 12) + 'px';
        n.innerHTML =
          '<span class="cbc-caret">' + (caret || '') + '</span>' +
          (ico ? '<img class="cbc-ico" src="assets/cb/' + ico + '" alt="">' : '<span class="cbc-ico"></span>') +
          '<span>' + esc(label) + '</span>';
        if (onClick) n.onclick = onClick;
        (parent || tree).appendChild(n);
        return n;
      };
      add(0, op('ws') ? '▾' : '▸', null, 'Workspace', '', () => tg('ws'));
      if (op('ws')){
        add(1, op('proj') ? '▾' : '▸', 'folder.png', sid, '', () => tg('proj'));
        if (op('proj')){
          add(2, op('src') ? '▾' : '▸', 'folder.png', 'Sources', '', () => tg('src'));
          if (op('src')){
            problems.forEach(p => {
              /* 没解压的题在树里是灰的：真机上 Code::Blocks 里也不会凭空出现没下载的源文件 */
              const got = problemExtracted(p.id);
              const n = add(3, '', 'source.png',
                p.id + '.cpp' + (got ? '' : '　（未解压）'),
                'file' + (got ? '' : ' dim'),
                got ? () => switchTo(p.id)
                    : () => toast('请先在程序回收系统下载 ' + p.id + '.zip，再用归档管理器解压', 'err'));
              n.dataset.problem = p.id;
              treeFiles[p.id] = n;
            });
          }
          add(2, op('oth') ? '▾' : '▸', 'folder.png', 'Others', '', () => tg('oth'));
          othersBox = el('div', 'cbc-others');
          othersBox.style.display = op('oth') ? '' : 'none';
          tree.appendChild(othersBox);
          if (op('oth')) paintOthers();
        }
      }
      paintTree();
    }
    /* Others 下挂的是「当前题」的样例文件，切题时必须跟着换 */
    function paintOthers(){
      if (!othersBox) return;
      othersBox.innerHTML = '';
      const p = problems.find(x => x.id === cur) || problems[0];
      if (!p) return;
      const tests = p.tests || [];
      const others = [p.id + '1.in', p.id + '1.ans']
        .concat(tests.length > 1 ? [p.id + '2.in', p.id + '2.ans'] : []);
      others.forEach(f => {
        const n = el('div', 'cbc-node');
        n.style.paddingLeft = '40px';
        n.innerHTML = '<span class="cbc-caret"></span>' +
          '<img class="cbc-ico" src="assets/cb/source.png" alt="">' +
          '<span>' + esc(f) + '</span>';
        othersBox.appendChild(n);
      });
    }
    function paintTree(){
      Object.keys(treeFiles).forEach(id => {
        treeFiles[id].classList.toggle('sel', id === cur);
      });
    }

    /* Management 面板开关：✕ 关掉，View → 管理器面板 再打开（真机同款行为） */
    function toggleSide(force){
      const show = force == null ? side.style.display === 'none' : !!force;
      side.style.display = show ? '' : 'none';
    }
    /* Symbols 页签：从当前源码抠函数签名（真机是 CppParser，这里做个够用的正则版） */
    function paintSymbols(){
      const src = ideWin.problemId ? (Store.getCode(ideWin.problemId) || '') : '';
      const syms = [];
      const re = /(?:^|\n)[ \t]*(?:static[ \t]+)?(?:int|void|bool|double|float|char|long[ \t]+long|unsigned[ \t]+\w+|string|auto)[ \t]+(\w+)[ \t]*\(([^;{)]*)\)[ \t]*\{/g;
      let m;
      while ((m = re.exec(src)) && syms.length < 60){
        syms.push({ name: m[1], params: m[2].replace(/\s+/g, ' ').trim() });
      }
      symBox.innerHTML =
        '<div class="cbc-node"><span class="cbc-caret">▾</span>' +
          '<img class="cbc-ico" src="assets/cb/folder.png" alt=""><span>Symbols</span></div>' +
        '<div class="cbc-node" style="padding-left:16px"><span class="cbc-caret">▾</span>' +
          '<img class="cbc-ico" src="assets/cb/folder.png" alt=""><span>全局函数</span></div>' +
        (syms.length
          ? syms.map(s => '<div class="cbc-node" style="padding-left:28px">' +
              '<span class="cbc-caret"></span><span class="cbc-ico"></span>' +
              '<span>' + esc(s.name + '(' + s.params + ')') + '</span></div>').join('')
          : '<div class="cbc-node dim" style="padding-left:28px"><span class="cbc-caret"></span>' +
            '<span class="cbc-ico"></span><span>（当前源码没有函数）</span></div>');
    }
    /* 新建空白文件：编辑区切到 untitled 缓冲，保存时落到 ~/Desktop/teacher/ */
    function ideNewFile(){
      let name = 'untitled.cpp';
      for (let i = 2; Desktop.fs.exists('~/Desktop/teacher/' + name); i++) name = 'untitled' + i + '.cpp';
      postIDE({ type: 'ide:getCode' });                    // 先把旧文件存掉
      setTimeout(() => {
        ideWin.problemId = null;
        ideWin.file = name;
        ideWin.savePath = '~/Desktop/teacher/' + name;
        Desktop.fs.write(ideWin.savePath, '');             // 磁盘上先有这个文件，保存才有落点
        postIDE({ type: 'ide:file', name });
        postIDE({ type: 'ide:setCode', code: '' });
        sbFile.textContent = name;
        sbPath.textContent = '~/Desktop/teacher/' + name;
        const tt = win.head.querySelector('.win-title');
        if (tt) tt.textContent = ideWinTitle('Code::Blocks', name);
        paintTree();
      }, 60);
    }
    /* 打开文件：真机弹 GTK 文件选择器，这里用同风格弹出菜单列出 teacher 下的 .cpp */
    function ideOpenChooser(){
      const fs = Desktop.fs;
      const items = [];
      const scan = (base, depth) => {
        (fs.list(base) || []).forEach(n => {
          if (n.type === 'file' && /\.cpp$/.test(n.name)){
            items.push({ label: fs.pretty(n.path), ico: 'code', run(){ ideOpenPath(n.path); } });
          } else if (n.type === 'dir' && depth < 1){
            scan(n.path, depth + 1);
          }
        });
      };
      scan('~/Desktop/teacher', 0);
      if (!items.length){ toast('~/Desktop/teacher 下还没有任何 .cpp 文件', 'err'); return; }
      Desktop.openMenuAt(sb.querySelector('[data-cbc="file"]') || win.head, '', items);
    }
    function ideOpenPath(p){
      const m = p.match(/\/(\w+)\/\1\.cpp$/);
      if (m && treeFiles[m[1]]){ switchTo(m[1]); return; }
      const name = p.split('/').pop();
      postIDE({ type: 'ide:getCode' });
      setTimeout(() => {
        ideWin.problemId = null;
        ideWin.file = name;
        ideWin.savePath = p;
        postIDE({ type: 'ide:file', name });
        postIDE({ type: 'ide:setCode', code: Desktop.fs.read(p) || '' });
        sbFile.textContent = name;
        sbPath.textContent = p;
        const tt = win.head.querySelector('.win-title');
        if (tt) tt.textContent = ideWinTitle('Code::Blocks', name);
        paintTree();
      }, 60);
    }

    ideWin = { win, frame, problemId: cur, ready: false, cbc: true };
    const s = Store.getSettings();

    function loadCurrent(){
      const p = problems.find(x => x.id === ideWin.problemId);
      if (!p) return;
      const code = Store.getCode(p.id);
      ideWin.file = p.id + '.cpp';
      postIDE({ type: 'ide:file', name: p.id + '.cpp' });
      postIDE({ type: 'ide:setCode', code });
      postIDE({
        type: 'ide:setJudge',
        cases: (p.tests || []).map(t => ({ input: t.input, expected: t.expected })),
        tl: p.tl || 1000,
      });
      cur = p.id;
      if (sbFile) sbFile.textContent = p.id + '.cpp';
      if (sbPath) sbPath.textContent = '~/Desktop/' + sid + '/' + p.id + '/' + p.id + '.cpp';
      const tt = win.head.querySelector('.win-title');
      if (tt) tt.textContent = ideWinTitle('Code::Blocks', p.id + '.cpp');
      /* 解压发生在 CBC 开着的时候（归档管理器解压完回来），树要跟着从灰变亮 */
      if (treeSig() !== extractedSig) buildTree();
      else { paintOthers(); paintTree(); }
      if (sbCaret) sbCaret.textContent = '行 1, 列 1';
    }
    function switchTo(id){
      if (!id || id === ideWin.problemId) return;
      postIDE({ type: 'ide:getCode' });
      setTimeout(() => { ideWin.problemId = id; loadCurrent(); }, 60);
    }

    buildTree();
    loadCurrent();

    /* 启动图在编辑区就绪后淡出（真机 splash 也是在主窗口映射后消失） */
    let splashOff = false;
    function dropSplash(){
      if (splashOff) return;
      splashOff = true;
      splash.classList.add('out');
      setTimeout(() => splash.remove(), 260);
    }
    frame.addEventListener('load', () => {
      postIDE({ type: 'ide:config', showJudge: s.allowJudge !== false, allowCopy: s.allowCopy !== false });
      setTimeout(() => { ideWin.ready = true; loadCurrent(); }, 400);
      setTimeout(dropSplash, 900);
    });
    setTimeout(() => { if (ideWin && !ideWin.ready){ ideWin.ready = true; loadCurrent(); } }, 1800);
    setTimeout(dropSplash, 2600);

    return win;
  }

  function openIDE(name){
    const problems = enabledProblems();
    if (!problems.length){ toast('管理员未启用任何题目', 'err'); return; }
    const label = name || 'Code::Blocks';
    if (label === 'Code::Blocks') return openCodeBlocks(problems);

    const icoName = label === 'Geany' ? 'geany' : label === 'Lazarus' ? 'lazarus' : 'gedit';
    const win = createWindow({ id: 'ide', title: label + ' 20.03', ico: icoName, w: 1080, h: 700, onClose(){ ideWin = null; } });
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

    /* GTK 菜单栏：视觉与 Code::Blocks 一致，能真跑的命令接上，其余置灰 */
    const mb = el('div', 's-menubar');
    const menuCtx = {
      save(){ postIDE({ type: 'ide:getCode' }); setTimeout(() => toast('已保存', 'ok'), 120); },
      judge(){ postIDE({ type: 'ide:runJudge' }); },
      close(){ Desktop.closeWin(win); },
      newFile(){ postIDE({ type: 'ide:getCode' }); setTimeout(() => {
        postIDE({ type: 'ide:file', name: 'untitled.cpp' });
        postIDE({ type: 'ide:setCode', code: '' });
      }, 60); },
      openFile(){ toast('打开文件请使用 Code::Blocks', 'err'); },
      mgr(){ toast('该编辑器没有管理器面板'); },
      log(){ postIDE({ type: 'ide:toggleLog' }); },
      edit(op){ postIDE({ type: 'ide:edit', op }); },
    };
    IDE_MENU_ORDER.forEach(name => {
      const b = el('div', 'mb-item', name);
      b.addEventListener('mousedown', e => {
        e.preventDefault(); e.stopPropagation();
        const items = (IDE_MENU_ITEMS[name] || []).map(it => it.dim || it.sep
          ? it
          : Object.assign({}, it, { run(){ it.run(it, menuCtx); } }));
        Desktop.openMenuAt(b, '', items);
      });
      mb.appendChild(b);
    });

    win.body.appendChild(mb);
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
      postIDE({ type: 'ide:file', name: p.id + '.cpp' });
      postIDE({ type: 'ide:setCode', code });
      postIDE({
        type: 'ide:setJudge',
        cases: (p.tests || []).map(t => ({ input: t.input, expected: t.expected })),
        tl: p.tl || 1000,
      });
      dot.textContent = '已载入 ' + p.id + '.cpp';
      pathHint.textContent = '~/Desktop/teacher/' + p.id + '/' + p.id + '.cpp' +
        (code ? ' · ' + fmtSize(code.length) : ' · 新文件');
      const tt = win.head.querySelector('.win-title');
      if (tt) tt.textContent = ideWinTitle(label, p.id + '.cpp');
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
    if (!d) return;
    /* Code::Blocks 外壳的状态栏：光标位置由编辑区那边报上来 */
    if (d.type === 'ide:caret'){
      if (!ideWin || !ideWin.cbc) return;
      const c = ideWin.win.body.querySelector('[data-cbc="caret"]');
      if (c) c.textContent = '行 ' + d.line + ', 列 ' + d.col;
      return;
    }
    /* Code::Blocks「编译并运行」：真机是弹 xterm 窗口跑程序，不塞进 IDE 面板 */
    if (d.type === 'ide:run'){
      if (!ideWin || !ideWin.cbc) return;
      openRunConsole({
        key: (ideWin.problemId || 'untitled'),
        title: d.title || '运行',
        output: d.output || '',
        error: d.error || '',
        verdict: d.verdict || 'OK',
        limitMs: d.limitMs,
        ms: d.ms,
      });
      return;
    }
    if (d.type !== 'ide:code') return;
    if (!ideWin) return;
    /* 非题目的文件缓冲（新建的 untitled / 打开的其他 .cpp）：写回它自己的路径，
       别误存进当前题的 Store 槽位 */
    if (ideWin.file && !ideWin.problemId){
      const path = ideWin.savePath || ('~/Desktop/teacher/' + ideWin.file);
      const node = Desktop.fs.nodes.get(Desktop.fs.abs(path));
      if (node && node.content !== d.code) node.content = d.code;
      const dot2 = ideWin.win.body.querySelector('.save-dot');
      if (dot2) dot2.textContent = ideWin.file + ' 已保存 · ' + fmtSize(d.code.length);
      return;
    }
    const pid = ideWin.problemId;
    if (!pid) return;
    Store.saveCode(pid, d.code);
    const stu = Store.getStudent() || {};
    const node = Desktop.fs.nodes.get('~/Desktop/teacher/' + pid + '/' + pid + '.cpp');
    if (node && node.content !== d.code) node.content = d.code;
    const dot = ideWin.win.body.querySelector('.save-dot');
    if (dot) dot.textContent = pid + '.cpp 已自动保存 · ' + fmtSize(d.code.length);
  });

  /* ============ Code::Blocks 的「运行」控制台（xterm） ============ */
  /* 真机 F9 不会把 stdout 塞进 IDE 下方的小面板：Code::Blocks 20.03 在设置里
     把 console 程序交给 `xterm -T $TITLE -e` 启动（Ubuntu 默认值），所以按 F9
     会弹一个黑字白底的 xterm 窗口跑程序，跑完停在「Press ENTER to continue.」
     等回车，回车即关窗。这里照此实现，不用 GNOME Terminal 的外观。 */
  let lastRunWin = null;
  function openRunConsole(o){
    o = o || {};
    /* 真机每次 F9 都新开一个 xterm；这里关掉上一个，免得窗口越堆越多 */
    if (lastRunWin){ try{ Desktop.closeWin(lastRunWin, true); }catch(e){} lastRunWin = null; }
    const win = createWindow({
      title: o.title || 'run',
      ico: 'term', w: 720, h: 430,
    });
    lastRunWin = win;
    win._built = true;

    const con = el('div', 'run-console');
    win.body.appendChild(con);
    const out = el('div', 'run-out');
    const tail = el('div', 'run-tail');
    con.appendChild(out);
    con.appendChild(tail);

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      if (lastRunWin === win) lastRunWin = null;
      Desktop.closeWin(win);
    };
    function onKey(e){
      if (e.key === 'Enter' || e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); close(); }
    }

    function put(text, cls){
      String(text == null ? '' : text).split('\n').forEach(line => {
        const d = el('div', 'run-line' + (cls ? ' ' + cls : ''));
        d.textContent = line;
        out.appendChild(d);
      });
      con.scrollTop = con.scrollHeight;
    }

    if (o.lines && o.lines.length){
      o.lines.forEach(l => put(l.text, l.cls));
    } else if (o.output){
      put(o.output);
    }
    if (o.error) put(o.error, 'err');
    if (o.verdict === 'TLE') put('（超过 ' + (o.limitMs || 1000) + ' ms 未结束，已被终止）', 'err');

    /* 收尾：真机 Code::Blocks 给的控制台脚本固定打印这一行 */
    const hold = el('div', 'run-hold');
    hold.innerHTML = '<span>Press ENTER to continue.</span><i class="run-cursor"></i>';
    tail.appendChild(hold);

    setTimeout(() => document.addEventListener('keydown', onKey, true), 80);
    Desktop.focusWin(win);
    return win;
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
      // Ubuntu 默认 PS1：user@host 绿色加粗，路径蓝色，$ 白色
      promptEl.innerHTML = '';
      const u = document.createElement('span'); u.textContent = (account ? account.id : 'student') + '@noi';
      const c1 = document.createTextNode(':');
      const pth = document.createElement('span'); pth.className = 'p-path'; pth.textContent = fs.pretty(fs.cwd);
      const sym = document.createElement('span'); sym.className = 'p-sym'; sym.textContent = '$ ';
      promptEl.appendChild(u); promptEl.appendChild(c1); promptEl.appendChild(pth); promptEl.appendChild(sym);
      const t = (account ? account.id : 'student') + '@noi: ' + fs.pretty(fs.cwd);
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
      w((account ? account.id : 'student') + '@noi:' + fs.pretty(fs.cwd) + '$ ' + raw, 'cmd');
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
          return w(account ? account.id : 'student');
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
        if (!line.trim()) { w((account ? account.id : 'student') + '@noi:' + fs.pretty(fs.cwd) + '$ ', 'cmd'); return; }
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
  /* ================= joe（Joe's Own Editor）=================
   * 界面全部照 ISO 的真配置还原：
   *   /etc/joe/joerc                      -lmsg \i%k%T%W%I%X %n %m%y%R %M %x
   *                                       -rmsg  %S Row %4r Col %3c
   *                                       默认开 -status（顶部反显状态行）、-keepup
   *   /usr/share/joe/colors/default.jcf   .colors 16 → Comment 绿 / Keyword 粗体 /
   *                                       Preproc 蓝 / Constant 青 / Brace 品红
   *   /etc/joe/joerc 的 {Basic} 段       就是 ^KH 弹出的那张键位表，这里原样搬过来
   */
  const JOE_BASIC = [
    ' \\|\u0001REGION\u0001        \\|\u0001GO TO\u0001           \\|\u0001GO TO\u0001           \\|\u0001DELETE\u0001    \\|\u0001EXIT\u0001       \\|\u0001SEARCH\u0001    \\|',
    ' \\|\u0002^Arrow\u0002 Select \\|\u0002^Z\u0002 Prev. word   \\|\u0002^U/^V\u0002 PgUp/PgDn \\|\u0002^D\u0002 Char.  \\|\u0002^KX\u0002 Save   \\|\u0002^KF\u0002 Find  \\|',
    ' \\|\u0002^KB\u0002 Begin     \\|\u0002^X\u0002 Next word    \\|\u0001MISC\u0001            \\|\u0002^Y\u0002 Line   \\|\u0002^C\u0002  Abort  \\|\u0002^L\u0002  Next  \\|',
    ' \\|\u0002^KK\u0002 End       \\|\u0002^KU\u0002 Top of file \\|\u0002^KJ\u0002 Paragraph   \\|\u0002^W\u0002 >Word  \\|\u0002^KQ\u0002 All    \\|\u0001HELP\u0001      \\|',
    ' \\|\u0002^KC\u0002 Copy      \\|\u0002^KV\u0002 End of file \\|\u0002^KA\u0002 Center line \\|\u0002^O\u0002 Word<  \\|\u0001FILE\u0001       \\|\u0002Esc .\u0002 Next\\|',
    ' \\|\u0002^KM\u0002 Move      \\|\u0002^A\u0002 Beg. of line \\|\u0002^K Space\u0002 Status \\|\u0002^J\u0002 >Line  \\|\u0002^KE\u0002 Edit   \\|\u0002Esc ,\u0002 Prev\\|',
    ' \\|\u0002^KW\u0002 File      \\|\u0002^E\u0002 End of line  \\|\u0001SPELL\u0001           \\|\u0002^[O\u0002 Line< \\|\u0002^KR\u0002 Insert \\|\u0002^KH\u0002 Off   \\|',
    ' \\|\u0002^KY\u0002 Delete    \\|\u0002^KL\u0002 To line no. \\|\u0002Esc N\u0002 Word      \\|\u0002^_\u0002 Undo   \\|\u0002^KD\u0002 Save   \\|\u0002^T\u0002  Menu  \\|',
    ' \\|\u0002^K/\u0002 Filter    \\|\u0002^G\u0002  Matching (  \\|\u0002Esc L\u0002 File      \\|\u0002^^\u0002 Redo   \\|\u0002^K`\u0002 Revert \\|            \\|',
  ];
  const JOE_KW = new Set(('int char bool double float void long short unsigned signed const ' +
    'static struct class template typename using namespace return if else for while do switch ' +
    'case break continue new delete public private protected virtual inline typedef sizeof enum ' +
    'union constexpr nullptr true false auto operator friend explicit mutable this throw try ' +
    'catch volatile register extern goto default').split(' '));

  function joeEsc(s){
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* 一个够用的 C++ 词法器：只认 default.jcf 里定义的那几类颜色 */
  function joeHighlight(src){
    let out = '', i = 0;
    const n = src.length;
    const wrap = (cls, text) => '<span class="joe-' + cls + '">' + joeEsc(text) + '</span>';
    while (i < n){
      const c = src[i];
      if (c === '/' && src[i + 1] === '/'){
        let j = src.indexOf('\n', i); if (j < 0) j = n;
        out += wrap('com', src.slice(i, j)); i = j; continue;
      }
      if (c === '/' && src[i + 1] === '*'){
        let j = src.indexOf('*/', i + 2); j = j < 0 ? n : j + 2;
        out += wrap('com', src.slice(i, j)); i = j; continue;
      }
      if (c === '#'){
        const ls = src.lastIndexOf('\n', i - 1) + 1;
        if (!src.slice(ls, i).trim()){
          let j = src.indexOf('\n', i); if (j < 0) j = n;
          const line = src.slice(i, j);
          const m = /^(#[ \t]*[A-Za-z]+)[ \t]*(.*)$/.exec(line);
          if (!m){ out += wrap('pre', line); }
          else {
            out += wrap('pre', m[1]) + ' ';
            const rest = m[2];
            const q = /^([<"])([^>"\n]*)([>"])/.exec(rest);
            if (/#[ \t]*include$/.test(m[1]) && q){
              out += wrap('inc', q[0]) + joeEsc(rest.slice(q[0].length));
            } else out += joeEsc(rest);
          }
          i = j; continue;
        }
      }
      if (c === '"' || c === "'"){
        let j = i + 1;
        while (j < n && src[j] !== c && src[j] !== '\n'){ if (src[j] === '\\') j++; j++; }
        j = Math.min(j + 1, n);
        out += wrap('const', src.slice(i, j)); i = j; continue;
      }
      if (c === '{' || c === '}'){ out += wrap('brace', c); i++; continue; }
      if (c >= '0' && c <= '9'){
        let j = i;
        while (j < n && /[0-9a-fA-FxX.]/.test(src[j])) j++;
        out += wrap('num', src.slice(i, j)); i = j; continue;
      }
      if (/[A-Za-z_]/.test(c)){
        let j = i;
        while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
        const w = src.slice(i, j);
        out += JOE_KW.has(w) ? wrap('kw', w) : joeEsc(w);
        i = j; continue;
      }
      out += joeEsc(c); i++;
    }
    return out;
  }

  function openJoe(){
    const problems = enabledProblems();
    if (!problems.length){ toast('没有可用题目', 'err'); return; }
    const pid = (ideWin && ideWin.problemId) || problems[0].id;
    const path = '~/Desktop/teacher/' + pid + '/' + pid + '.cpp';
    const win = createWindow({
      id: 'tui:joe', title: 'joe  ' + pid + '.cpp', ico: 'joe', w: 880, h: 580,
    });
    if (win._built) return win;
    win._built = true;

    const box = el('div', 'joe');
    box.innerHTML =
      '<div class="joe-status"><span class="joe-st-l"></span><span class="joe-st-r"></span></div>' +
      '<div class="joe-view"><pre class="joe-hl"></pre>' +
      '<textarea class="joe-ta" spellcheck="false" wrap="off" autocomplete="off"></textarea></div>' +
      '<div class="joe-msg"></div>';
    win.body.appendChild(box);

    const stL = box.querySelector('.joe-st-l');
    const stR = box.querySelector('.joe-st-r');
    const hlEl = box.querySelector('.joe-hl');
    const ta = box.querySelector('.joe-ta');
    const msgEl = box.querySelector('.joe-msg');

    ta.value = Store.getCode(pid) || '';
    if (!ta.value){
      ta.value = '#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n';
    }

    let pending = '';        // %k：已按下的前缀键（^K）
    let modified = false;
    let saved = ta.value;
    let helpEl = null;

    function context(){
      /* %x：从光标往上找第一条顶格的行 */
      const v = ta.value.slice(0, ta.selectionStart);
      const lines = v.split('\n');
      for (let i = lines.length - 2; i >= 0; i--){
        const s = lines[i];
        if (s && !/^[ \t]/.test(s)) return s.trim();
      }
      return '';
    }
    function paintStatus(){
      const v = ta.value;
      const p = ta.selectionStart;
      const head = v.slice(0, p);
      const row = head.split('\n').length;
      const col = p - head.lastIndexOf('\n');
      /* -lmsg \i%k%T%W%I%X %n %m%y%R %M %x
         %T=I（插入） %W= 空（未开 wordwrap） %I= 空（未开 autoindent）
         %y=C（c.jsf） %R= 空（非只读） %M= 空（未录宏） */
      stL.textContent = pending + 'I' + ' ' + pid + '.cpp ' +
        (modified ? '(Modified)' : '') + 'C' + ' ' + ' ' + context();
      /* -rmsg  %S Row %4r Col %3c */
      stR.textContent = ' Row ' + String(row).padStart(4) + ' Col ' + String(col).padStart(3);
    }
    function render(){
      hlEl.innerHTML = joeHighlight(ta.value) + '\n';
      modified = ta.value !== saved;
      paintStatus();
    }
    function say(text, dim){
      msgEl.textContent = text || '';
      msgEl.classList.toggle('dim', !!dim);
    }
    function save(quiet){
      const code = ta.value;
      Store.saveCode(pid, code);
      try { Desktop.fs.write(path, code); } catch (e){}
      saved = code; modified = false;
      render();
      say('File ' + path + ' saved', false);
      if (!quiet) toast(pid + '.cpp 已写入 ' + path, 'ok');
    }
    function quit(){ closeWin(win); }

    function toggleHelp(){
      if (helpEl){ helpEl.remove(); helpEl = null; return; }
      helpEl = el('div', 'joe-help');
      helpEl.innerHTML = JOE_BASIC.map(row => {
        let s = joeEsc(row);
        s = s.replace(/\u0001([^\u0001]*)\u0001/g, '<u>$1</u>');
        s = s.replace(/\u0002([^\u0002]*)\u0002/g, '<b>$1</b>');
        s = s.replace(/\\\|/g, '<span class="sep">|</span>');
        return s;
      }).join('\n');
      box.querySelector('.joe-view').appendChild(helpEl);
    }

    ta.addEventListener('input', render);
    ['keyup', 'click', 'mouseup', 'select', 'focus'].forEach(ev => {
      ta.addEventListener(ev, () => setTimeout(paintStatus, 0));
    });
    ta.addEventListener('scroll', () => {
      hlEl.scrollTop = ta.scrollTop;
      hlEl.scrollLeft = ta.scrollLeft;
    });

    /* joe 的 WordStar 键序：^K 是前缀键，状态行会先显示 ^K */
    ta.addEventListener('keydown', e => {
      if (e.ctrlKey && !e.altKey && (e.key === 'k' || e.key === 'K')){
        e.preventDefault();
        pending = '^K ';
        paintStatus();
        say('', true);
        return;
      }
      if (pending){
        if (e.key === 'Escape'){ e.preventDefault(); pending = ''; say(''); paintStatus(); return; }
        if (!e.ctrlKey){ pending = ''; paintStatus(); return; }
        const k = e.key.toLowerCase();
        const had = pending;
        pending = '';
        if (k === 'x'){ e.preventDefault(); save(); quit(); return; }
        if (k === 'f' || k === 'd'){ e.preventDefault(); save(); return; }
        if (k === 'q'){ e.preventDefault(); say('Aborting...'); setTimeout(quit, 60); return; }
        if (k === 'h' || k === 't'){ e.preventDefault(); toggleHelp(); say('', true); paintStatus(); return; }
        if (e.key === ' '){
          e.preventDefault();
          const v = ta.value, p = ta.selectionStart, head = v.slice(0, p);
          const row = head.split('\n').length, col = p - head.lastIndexOf('\n') + 1;
          say('** Line ' + row + ' Col ' + col + ' Offset ' + p + '(0x' + p.toString(16) + ') ' +
              'UTF-8 0(0x0) Width 1 **', false);
          paintStatus();
          return;
        }
        pending = had; paintStatus();
        say('No such command', false);
        return;
      }
      if (e.ctrlKey && !e.altKey){
        const k = e.key.toLowerCase();
        if (k === 'c'){ e.preventDefault(); say('Aborting...'); setTimeout(quit, 60); }
        else if (k === 'h'){ e.preventDefault(); toggleHelp(); }
      }
    });

    render();
    say('', true);
    setTimeout(() => ta.focus(), 80);
    return win;
  }

  /* ================= Vim 8.1（终端里跑） ================= */
  /* 真机在中文 locale 下 vim 的提示是中文的：`-- 插入 --`、`E37: 已修改但未保存`。
     窗口标题也照 vim 自己的规矩：`queue.cpp (~/Desktop/teacher/queue) - VIM1`。 */
  function vimEsc(s){
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function openVim(){
    const problems = enabledProblems();
    if (!problems.length){ toast('没有可用题目', 'err'); return; }
    const pid = (ideWin && ideWin.problemId) || problems[0].id;
    const win = createWindow({
      id: 'tui:vim',
      title: pid + '.cpp (~/Desktop/teacher/' + pid + ') - VIM1',
      ico: 'vim', w: 900, h: 600,
    });
    if (win._built){ Desktop.focusWin(win); return win; }
    win._built = true;

    const box = el('div', 'vim');
    box.tabIndex = 0;
    box.innerHTML =
      '<pre class="vim-screen"></pre>' +
      '<div class="vim-status"><span class="vim-l"></span><span class="vim-r"></span></div>' +
      '<div class="vim-cmd"></div>';
    win.body.appendChild(box);
    const screenEl = box.querySelector('.vim-screen');
    const stL = box.querySelector('.vim-l');
    const stR = box.querySelector('.vim-r');
    const cmdEl = box.querySelector('.vim-cmd');

    const init = Store.getCode(pid) ||
      '#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n';
    let lines = init.replace(/\n$/, '').split('\n');
    let cy = 0, cx = 0, mode = 'normal', cmd = '', msg = '', dirty = false, dPending = false;

    function paintStatus(){
      const chars = lines.reduce((a, l) => a + l.length + 1, 0);
      stL.textContent = '"' + pid + '.cpp"' + (dirty ? ' [已修改]' : '') +
        ' ' + lines.length + 'L, ' + chars + 'C';
      const pct = lines.length > 1 ? Math.round((cy + 1) / lines.length * 100) : 100;
      stR.textContent = (cy + 1) + ',' + (cx + 1) + '          ' +
        (pct >= 100 ? '全部' : pct + '%');
    }
    function render(){
      const lh = 19;
      const rows = Math.max(6, Math.floor(screenEl.clientHeight / lh) - 1);
      let out = '';
      for (let i = 0; i < rows; i++){
        if (i >= lines.length){
          out += '<span class="vim-tilde">~</span>\n';
          continue;
        }
        const L = lines[i];
        if (i === cy && mode !== 'cmd'){
          const pos = Math.min(cx, L.length);
          const before = vimEsc(L.slice(0, pos));
          const ch = L[pos];
          const after = vimEsc(L.slice(pos + (mode === 'insert' ? 0 : 1)));
          out += before + '<span class="vim-cur">' +
            (mode === 'insert' ? '\u00a0' : vimEsc(ch || '\u00a0')) + '</span>' + after + '\n';
        } else {
          out += (vimEsc(L) || '\u00a0') + '\n';
        }
      }
      screenEl.innerHTML = out;
      paintStatus();
      cmdEl.innerHTML = mode === 'cmd'
        ? ':' + vimEsc(cmd)
        : (msg ? vimEsc(msg) : '');
      cmdEl.className = 'vim-cmd' + (mode === 'cmd' ? ' typing' : '');
    }
    function clamp(){
      cy = Math.max(0, Math.min(lines.length - 1, cy));
      const max = Math.max(0, lines[cy].length - (mode === 'insert' ? 0 : 1));
      cx = Math.max(0, Math.min(max, cx));
    }
    function save(){
      const v = lines.join('\n') + '\n';
      Store.saveCode(pid, v);
      try { Desktop.fs.write('~/Desktop/teacher/' + pid + '/' + pid + '.cpp', v); } catch (e) {}
      dirty = false;
      msg = '"' + pid + '.cpp" ' + lines.length + 'L, ' + lines.reduce((a, l) => a + l.length + 1, 0) + 'C 已写入';
    }
    function quit(){
      if (dirty){ msg = 'E37: 已修改但未保存（加 ! 强制退出）'; render(); return; }
      Desktop.closeWin(win);
    }

    box.addEventListener('keydown', e => {
      const k = e.key;
      if (mode === 'cmd'){
        if (k === 'Enter'){
          const c = cmd.trim();
          mode = 'normal'; cmd = ''; msg = '';
          if (c === 'w' || c === 'wq' || c === 'x'){ save(); if (c !== 'w') { render(); setTimeout(quit, 80); return; } }
          else if (c === 'q'){ quit(); return; }
          else if (c === 'q!'){ dirty = false; Desktop.closeWin(win); return; }
          else if (c) msg = 'E492: 不是编辑器的命令: ' + c;
          render(); return;
        }
        if (k === 'Escape'){ mode = 'normal'; cmd = ''; render(); return; }
        if (k === 'Backspace'){ cmd = cmd.slice(0, -1); if (!cmd) mode = 'normal'; render(); return; }
        if (k.length === 1){ cmd += k; render(); }
        e.preventDefault();
        return;
      }

      if (mode === 'insert'){
        if (k === 'Escape'){ mode = 'normal'; if (cx > 0) cx--; render(); return; }
        if (k === 'Enter'){
          const rest = lines[cy].slice(cx);
          lines[cy] = lines[cy].slice(0, cx);
          lines.splice(cy + 1, 0, rest);
          cy++; cx = 0; dirty = true; render(); e.preventDefault(); return;
        }
        if (k === 'Backspace'){
          if (cx > 0){ lines[cy] = lines[cy].slice(0, cx - 1) + lines[cy].slice(cx); cx--; }
          else if (cy > 0){
            cx = lines[cy - 1].length;
            lines[cy - 1] += lines[cy];
            lines.splice(cy, 1); cy--;
          }
          dirty = true; render(); e.preventDefault(); return;
        }
        if (k === 'Tab'){ lines[cy] = lines[cy].slice(0, cx) + '    ' + lines[cy].slice(cx); cx += 4; dirty = true; render(); e.preventDefault(); return; }
        if (k.length === 1 && !e.ctrlKey && !e.metaKey){
          lines[cy] = lines[cy].slice(0, cx) + k + lines[cy].slice(cx);
          cx++; dirty = true; render(); e.preventDefault();
        }
        return;
      }

      /* ---- 普通模式 ---- */
      if (dPending){
        dPending = false;
        if (k === 'd'){
          if (lines.length === 1) lines[0] = '';
          else lines.splice(cy, 1);
          dirty = true; clamp(); render(); e.preventDefault(); return;
        }
      }
      const arrow = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (arrow[k]){
        cx += arrow[k][0] * (mode === 'insert' ? 1 : 1);
        cy += arrow[k][1];
        clamp(); render(); e.preventDefault(); return;
      }
      switch (k){
        case 'h': cx--; break;
        case 'l': cx++; break;
        case 'j': cy++; break;
        case 'k': cy--; break;
        case '0': cx = 0; break;
        case '$': cx = Math.max(0, lines[cy].length - 1); break;
        case 'G': cy = lines.length - 1; break;
        case 'i': mode = 'insert'; msg = ''; break;
        case 'a': mode = 'insert'; cx = Math.min(lines[cy].length, cx + 1); break;
        case 'o':
          lines.splice(cy + 1, 0, '');
          cy++; cx = 0; mode = 'insert'; dirty = true;
          break;
        case 'x':
          lines[cy] = lines[cy].slice(0, cx) + lines[cy].slice(cx + 1);
          dirty = true;
          break;
        case 'd': dPending = true; msg = 'd'; break;
        case ':': mode = 'cmd'; cmd = ''; msg = ''; break;
        default: return;
      }
      if (k !== 'd') msg = '';
      clamp(); render();
      e.preventDefault();
    });

    render();
    setTimeout(() => { try { box.focus(); } catch (e) {} }, 60);
    return win;
  }

  /* ================= Midnight Commander 4.8 ================= */
  /* 经典蓝底双栏：面板靠 ─│┌┐└┘ 画，空格补位，所以字宽必须严格等宽
     （DejaVu Sans Mono）。列数按窗口实际宽度现算，跟真机 MC 一样铺满终端。
     F10 退出。 */
  const MC_FKEYS = ['1 帮助', '2 菜单', '3 查看', '4 编辑', '5 拷贝', '6 移动', '7 建目录', '8 删除', '9 下拉', '10 退出'];
  const MC_W = 44;        // 面板宽度兜底值（量不到布局时用，例如 jsdom）
  const MC_ROWS = 16;     // 面板内容行数兜底值

  function openMc(){
    const fs = Desktop.fs;
    const win = createWindow({ id: 'tui:mc', title: 'Midnight Commander', ico: 'mc', w: 940, h: 620 });
    if (win._built){ Desktop.focusWin(win); return win; }
    win._built = true;

    const box = el('div', 'mc');
    box.tabIndex = 0;
    box.innerHTML = '<div class="mc-panels"><pre class="mc-p"></pre><pre class="mc-p"></pre></div>' +
      '<div class="mc-fkeys"></div>';
    win.body.appendChild(box);
    const panels = [...box.querySelectorAll('.mc-p')];
    const fkeys = box.querySelector('.mc-fkeys');

    let W = MC_W, ROWS = MC_ROWS;       // 每次布局后重算
    /* 字宽用 offsetWidth 量（layout 尺寸，不受开窗动画 scale(.92) 影响；
       用 getBoundingClientRect 会量到缩放后的值，列数就偏大）。 */
    function layout(){
      if (!box.clientWidth || !box.clientHeight) return;   // jsdom 没有布局，走兜底值
      const p0 = panels[0];
      p0.style.width = '50ch';
      const chPx = p0.offsetWidth / 50;
      if (!(chPx > 3)){ p0.style.width = ''; return; }
      W = Math.max(20, Math.floor((box.clientWidth - 6) / (2 * chPx)));
      const lh = parseFloat(getComputedStyle(box).lineHeight) || 17;
      /* 用面板容器的高度算行数（它 overflow:hidden，高度由 flex 定，不会被内容撑开） */
      const panelH = panels[0].parentNode.offsetHeight || (box.clientHeight - fkeys.offsetHeight);
      ROWS = Math.max(6, Math.floor(panelH / lh) - 2);            // 上下边框各占一行
      panels.forEach(p => { p.style.width = W + 'ch'; });
    }
    const state = [
      { path: '~/Desktop/teacher', sel: 0, items: [] },
      { path: '~/Desktop', sel: 0, items: [] },
    ];
    let act = 0;

    function load(s){
      const abs = fs.abs(s.path);
      const list = fs.list(abs) || [];
      s.items = [{ name: '..', type: 'dir', up: true }].concat(list);
      s.sel = Math.max(0, Math.min(s.items.length - 1, s.sel));
    }
    /* 中文按两列宽算（真机 MC 用 wcwidth），否则带中文的文件名会把右边框顶出去 */
    const mcWide = ch => /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch) ? 2 : 1;
    const mcWidth = str => { let n = 0; for (const ch of String(str)) n += mcWide(ch); return n; };
    const pad = (str, n, right) => {
      str = String(str);
      if (mcWidth(str) > n){
        let out = '', acc = 0;
        for (const ch of str){
          const cw = mcWide(ch);
          if (acc + cw > n) break;
          out += ch; acc += cw;
        }
        str = out;
      }
      const fill = ' '.repeat(Math.max(0, n - mcWidth(str)));
      return right ? fill + str : str + fill;
    };
    function drawPanel(i){
      const s = state[i];
      const inner = W - 2;
      const title = fs.pretty(s.path);
      const bar = '─[' + title + ']' + '─'.repeat(Math.max(0, inner - mcWidth(title) - 3));
      /* 每一行都用块级 <div>，行与行之间不能留 '\n' —— pre 里块之间的换行会各生成一个
         空行盒子，整个面板就会被撑高一倍。 */
      let out = '<div class="mc-row">┌' + pad(bar, inner) + '┐</div>';
      for (let r = 0; r < ROWS; r++){
        const it = s.items[r];
        let text;
        if (!it) text = '';
        else if (it.up) text = '/..';
        else if (it.type === 'dir') text = '/' + it.name;
        else text = ' ' + it.name;
        const sizeCol = Math.min(8, Math.max(4, inner - 12));
        let line = pad(text, it && it.type === 'file' ? inner - sizeCol - 1 : inner);
        if (it && it.type === 'file'){
          line += pad(fmtSize((it.content || '').length).replace(' ', ''), sizeCol, true) + ' ';
        }
        const sel = r === s.sel;
        out += '<div class="mc-row' + (sel ? (i === act ? ' sel on' : ' sel') : '') +
          '" data-r="' + r + '">│' + pad(line, inner) + '│</div>';
      }
      out += '<div class="mc-row">└' + '─'.repeat(inner) + '┘</div>';
      panels[i].innerHTML = out;
    }
    function draw(){
      state.forEach((s, i) => { load(s); drawPanel(i); });
      fkeys.innerHTML = MC_FKEYS.map(f =>
        '<span class="mc-fk"><b>' + f.split(' ')[0] + '</b>' + f.split(' ').slice(1).join(' ') + '</span>').join('');
    }
    function go(i){
      const s = state[i];
      const it = s.items[s.sel];
      if (!it) return;
      if (it.up){
        const p = s.path.replace(/\/[^\/]+$/, '') || '~';
        s.path = fs.pretty(fs.abs(p)); s.sel = 0;
      } else if (it.type === 'dir'){
        s.path = s.path + '/' + it.name; s.sel = 0;
      } else {
        return openText(it.name, it.content || '');
      }
      draw();
    }

    box.addEventListener('keydown', e => {
      const s = state[act];
      switch (e.key){
        case 'Tab': act = 1 - act; break;
        case 'ArrowUp': s.sel = Math.max(0, s.sel - 1); break;
        case 'ArrowDown': s.sel = Math.min(s.items.length - 1, s.sel + 1); break;
        case 'Enter': go(act); e.preventDefault(); return;
        case 'F10': case 'Escape': Desktop.closeWin(win); return;
        default: return;
      }
      e.preventDefault();
      draw();
    });
    box.addEventListener('click', e => {
      const row = e.target.closest('.mc-row');
      if (!row || row.dataset.r == null) return;
      const i = panels.findIndex(p => p.contains(row));
      if (i < 0) return;
      act = i;
      state[i].sel = Number(row.dataset.r);
      draw();
      try { box.focus(); } catch (err) {}
    });

    /* 按实测像素重排：先算出列/行，再用真实滚动尺寸校正 ——
       多一行的空行盒子、字体回退之类的误差都能被这条回路吃掉。 */
    function fit(){
      layout();
      draw();
      const cont = panels[0].parentNode;
      for (let i = 0; i < 5 && cont.scrollWidth > cont.clientWidth && W > 20; i++){ W--; draw(); }
      for (let i = 0; i < 5 && panels[0].scrollHeight > cont.clientHeight && ROWS > 6; i++){ ROWS--; draw(); }
    }
    draw();                       // 先用兜底列数铺一屏，别让窗口空着
    /* 窗口真正拿到尺寸之后（以及用户拖边改了大小），按实测像素重算 */
    if (typeof ResizeObserver === 'function'){
      const ro = new ResizeObserver(() => fit());
      ro.observe(box);
      win.onClose = () => { try { ro.disconnect(); } catch (e) {} };
    } else {
      setTimeout(fit, 220);
    }
    setTimeout(() => { try { box.focus(); } catch (e) {} }, 60);
    return win;
  }

  function openTuiEditor(kind){
    if (kind === 'joe') return openJoe();
    if (kind === 'vim') return openVim();
    if (kind === 'mc') return openMc();
    const problems = enabledProblems();
    if (!problems.length){ toast('没有可用题目', 'err'); return; }
    const stu = Store.getStudent() || {};
    let pid = (ideWin && ideWin.problemId) || problems[0].id;
    const path = '~/Desktop/teacher/' + pid + '/' + pid + '.cpp';
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
      } else if (kind === 'joe'){
        modeEl.textContent = 'joe';
        bar.textContent = '^KX 保存并退出    ^KF 保存    ^C 中止    （Joe 的 WordStar 风格快捷键）';
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
    } else if (kind === 'joe'){
      let k = false;
      ta.addEventListener('keydown', e => {
        if (e.ctrlKey && (e.key === 'k' || e.key === 'K')){ k = true; setTimeout(() => { k = false; }, 1200); e.preventDefault(); return; }
        if (k && e.ctrlKey && (e.key === 'x' || e.key === 'X')){ k = false; e.preventDefault(); save(); quit(); return; }
        if (k && e.ctrlKey && (e.key === 'f' || e.key === 'F')){ k = false; e.preventDefault(); save(); }
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
      const src = '~/Desktop/teacher/' + p.id + '/' + p.id + '.cpp';
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

  /* ================= 文件管理器（Nautilus 3.36） ================= */
  /* 依据 ISO 里的 Nautilus 3.36：标题栏就是工具栏，左边后退/前进，中间路径栏
     （连在一起的分段按钮，Yaru 里是 #484848 底 + 1px #222 边、只在首尾切圆角），
     右边搜索与主菜单；内容区是图标视图，不是 Windows 那种「名称/大小/类型」列表。
     图标全部取自 /usr/share/icons/Yaru/256x256 的 places 与 mimetypes。 */
  const NU_BACK = '<svg viewBox="0 0 16 16"><path d="M10 3.2L4.6 8 10 12.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const NU_FWD = '<svg viewBox="0 0 16 16"><path d="M6 3.2L11.4 8 6 12.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const NU_SEARCH = '<svg viewBox="0 0 16 16"><circle cx="7.2" cy="7.2" r="4.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.6 10.6L14 14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  const NU_MENU = '<svg viewBox="0 0 16 16"><path d="M2.6 4.2h10.8M2.6 8h10.8M2.6 11.8h10.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';

  /* 图标视图按 MIME 取图，与真机 Nautilus 一致 */
  const FS_ICON = { folder: 'folder', cpp: 'cpp', text: 'textfile', zip: 'zip', pdf: 'pdf', home: 'home', desktop: 'desktop', trash: 'trash' };
  function fsKind(name, isDir){
    if (isDir) return 'folder';
    if (/\.(cpp|cc|cxx|c|h|hpp)$/i.test(name)) return 'cpp';
    if (/\.zip$/i.test(name)) return 'zip';
    if (/\.pdf$/i.test(name)) return 'pdf';
    return 'text';
  }
  function fsIcoHTML(kind){
    return '<img src="assets/icons/' + (FS_ICON[kind] || 'textfile') + '.png" alt="">';
  }

  /* 内容区骨架：窗口外壳先出现，视图位置先放灰块，几百毫秒后才填真实内容。
     真机读目录是一瞬间的事，但完全没有过渡就是「假」的来源——考场机器上
     冷启动 Nautilus、冷开 Firefox 都要等一两秒。 */
  function skelGrid(host, n){
    const box = el('div', 'skel skel-grid');
    for (let i = 0; i < n; i++){
      const c = el('div', 'skel-cell');
      c.style.animationDelay = (i % 7) * 80 + 'ms';
      c.innerHTML = '<i class="skel-ico"></i><i class="skel-line" style="width:' + (46 + (i * 17) % 38) + '%"></i>';
      box.appendChild(c);
    }
    host.appendChild(box);
    return box;
  }

  function openFiles(path){
    const fs = Desktop.fs;
    const win = createWindow({ id: 'files', title: '文件管理器', ico: 'folder', w: 900, h: 580, headBar: true });
    if (win._built){
      if (path) win.fmanGo(path);
      Desktop.focusWin(win);
      return win;
    }
    win._built = true;
    let cur = path ? fs.abs(path) : fs.cwd;
    const hist = [], fwd = [];

    /* ---- headerbar：后退 / 前进 / 路径栏 / 搜索 / 主菜单 ---- */
    const nav = el('div', 'nu-nav');
    const bBack = el('button', 'nu-tb', NU_BACK); bBack.title = '后退';
    const bFwd = el('button', 'nu-tb', NU_FWD); bFwd.title = '前进';
    nav.appendChild(bBack); nav.appendChild(bFwd);
    const pathbar = el('div', 'nu-path');
    const bSearch = el('button', 'nu-tb', NU_SEARCH); bSearch.title = '搜索';
    const bMenu = el('button', 'nu-tb', NU_MENU); bMenu.title = '主菜单';
    win.headApp.appendChild(nav);
    win.headApp.appendChild(pathbar);
    win.headApp.appendChild(bSearch);
    win.headApp.appendChild(bMenu);

    const view = el('div', 'nu-view');
    const grid = el('div', 'nu-grid');
    view.appendChild(grid);
    win.body.appendChild(view);

    let seq = 0;
    function paintCrumbs(){
      pathbar.innerHTML = '';
      const rel = fs.pretty(cur);          // ~  或  ~/Desktop/teacher  或  /tmp
      const segs = rel.split('/').filter(Boolean);
      const targets = [];
      let acc;
      if (rel.startsWith('~')){
        acc = Desktop.HOME;
        targets.push({ label: '~', path: acc });
        const rest = rel.slice(1).split('/').filter(Boolean);
        rest.forEach(s => { acc += '/' + s; targets.push({ label: s, path: acc }); });
      } else {
        acc = '';
        targets.push({ label: '/', path: '/' });
        segs.forEach(s => { acc += '/' + s; targets.push({ label: s, path: acc }); });
      }
      targets.forEach((t, i) => {
        const b = el('button', 'nu-crumb', esc(t.label));
        if (i === targets.length - 1) b.classList.add('cur');
        b.title = fs.pretty(t.path);
        b.onclick = () => go(t.path, 130);
        pathbar.appendChild(b);
      });
    }

    function paintItems(){
      grid.innerHTML = '';
      const items = fs.list(cur) || [];
      if (!items.length){
        grid.appendChild(el('div', 'nu-empty', '文件夹为空'));
        return;
      }
      items.forEach(n => {
        const kind = fsKind(n.name, n.type === 'dir');
        const it = el('div', 'nu-item');
        it.dataset.kind = kind;
        it.dataset.name = n.name;
        it.innerHTML = '<span class="nu-ico">' + fsIcoHTML(kind) + '</span>' +
          '<span class="nu-name">' + esc(n.name) + '</span>';
        it.title = n.name + (n.type === 'dir' ? '' : '\n' + fmtSize((n.content || '').length));
        it.onclick = () => {
          [...grid.querySelectorAll('.nu-item.sel')].forEach(x => x.classList.remove('sel'));
          it.classList.add('sel');
        };
        it.ondblclick = () => {
          it.classList.remove('sel');
          if (n.type === 'dir') return go(n.path, 150);
          /* .cpp → Code::Blocks（真机装了 filetype 关联，双击直接进 IDE） */
          if (/\.(cpp|cc|cxx|c|h|hpp)$/i.test(n.name)){
            const pid = pidFromPath(n.path);
            if (pid && ideWin){ ideWin.problemId = pid; if (ideWin.loadCurrent) ideWin.loadCurrent(); }
            return openIDE('Code::Blocks');
          }
          /* .zip → 归档管理器 */
          if (/\.zip$/i.test(n.name)){
            const pid = n.name.replace(/\.zip$/i, '');
            const p = enabledProblems().find(x => x.id === pid);
            if (p) return openZip(p);
          }
          /* .pdf → 文档查看器（Evince），按路径反查题目 */
          if (/\.pdf$/i.test(n.name)){
            const pid = pidFromPath(n.path);
            const p = enabledProblems().find(x => x.id === pid) ||
                      enabledProblems().find(x => x.id === (ideWin && ideWin.problemId)) ||
                      enabledProblems()[0];
            if (p) return openStatement(p);
          }
          /* 纯文本类 → gedit（真机默认关联，不是这种小预览窗） */
          if (/\.(in|ans|out|txt|log|md|cfg|conf|dat)$/i.test(n.name)){
            return openTextEditor({ name: n.name, content: n.content || '' });
          }
          openText(n.name, n.content || '');
        };
        grid.appendChild(it);
      });
    }

    function render(ms){
      const my = ++seq;
      paintCrumbs();
      bBack.disabled = !hist.length;
      bFwd.disabled = !fwd.length;
      grid.innerHTML = '';
      const old = view.querySelector('.skel');
      if (old) old.remove();
      if (!ms) { paintItems(); return; }
      skelGrid(view, 14);
      setTimeout(() => {
        if (my !== seq || !document.body.contains(view)) return;
        const s = view.querySelector('.skel');
        if (s) s.remove();
        paintItems();
      }, ms);
    }

    function go(p, ms){
      const a = fs.abs(p);
      if (!fs.isDir(a)){ toast('目录不存在：' + p, 'err'); return; }
      if (cur !== a){ hist.push(cur); fwd.length = 0; }
      cur = a;
      render(ms == null ? 130 : ms);
    }
    win.fmanGo = go;

    bBack.onclick = () => {
      const p = hist.pop();
      if (!p) return;
      fwd.push(cur); cur = p; render(120);
    };
    bFwd.onclick = () => {
      const p = fwd.pop();
      if (!p) return;
      hist.push(cur); cur = p; render(120);
    };
    bSearch.onclick = () => toast('搜索：考场机器上仅索引本机文件');
    bMenu.onclick = () => toast('主菜单：新建文件夹 / 显示隐藏文件（实训环境未启用）');

    render(360);          // 进入时先出外壳与骨架，再填内容
    return win;
  }

  /* ================= Firefox：外网不通，只有考场内网的程序回收系统 ================= */
  /* 依据官方《程序回收系统使用说明》还原整个流程：
     打开浏览器输入回收系统地址 → 准考证号+密码登录 → 阅读考试须知 →
     从「试题下载」取题 → 在本机答题 → 到「答题」页提交源代码 → 退出登录。
     注意：真实系统提交的是源代码文本，不是文件；桌面上的代码只是本机存档。 */
  const RECOVERY_URL = 'http://10.10.20.30/';   // 正式认证时由认证点现场公布
  const rcState = { logged: false, tab: 'notice', bye: false };

  const RC_NOTICE_TEXT = [
    'CSP-JS 第二轮时，各省考点必须统一使用 NOI 报名系统规定的准考证和准考证号。',
    'CSP-JS 第二轮时，认证者须同时携带个人有效身份证件、CSP 准考证入场。入座后，将个人证件及准考证放置在桌子上，供监考核查。监考需核对认证者本人、姓名、性别、学籍学校、证件号、照片等信息是否一致相符。如有不实，视为替考，CSP-JS 各省总负责人可取消认证者参加资格，且从次年算起被禁赛三年。',
    '认证者进入考场时，只许携带笔、橡皮等非电子文具入场。禁止携带任何电子产品或机器设备入场，无存储功能的手表除外；手机（关机）、U 盘或移动硬盘、键盘、鼠标、闹钟、计算器、书籍、草稿纸及背包等物品必须存放在考场外。监考人员须尽职告知提醒，并在考前进行认真详细的清理和检查。如有认证者违规带入的，一经发现，监考人员必须及时处理，并根据情节报请 CSP-JS 各省总负责人直至取消认证者参加资格。',
    '认证开始 15 分钟后，认证者不得进入考场，以缺考处理；除去洗手间外，认证者在认证期间，全程不能早退，必须在认证正式结束后，统一离场。',
    '认证者进入考场后，在认证正式开始前，禁止操作机器、使用鼠标键盘等设备。',
    '在认证过程中，考点各考场统一提供草稿纸（A4 打印纸）。草稿纸不足时，认证者可举手向监考示意并索要。',
    '认证期间，如出现系统死机、崩溃或硬件故障的情况，认证者需立即举手向监考求助。',
  ];

  const RC_TABS = [
    { id: 'notice', label: '考试须知', icon: 'i' },
    { id: 'download', label: '试题下载', icon: 'd' },
    { id: 'answer', label: '答题', icon: 'e' },
    { id: 'msg', label: '0条未读消息', icon: 'm' },
  ];
  const RC_ICONS = {
    i: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 7.2v4.2M8 4.6v1.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    d: '<svg viewBox="0 0 16 16"><path d="M8 3v6.6M5.2 7.4L8 10.2l2.8-2.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.4 12.4h9.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    e: '<svg viewBox="0 0 16 16"><rect x="2.6" y="2.6" width="10.8" height="10.8" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.4 8.2l1.8 1.9 3.4-3.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    m: '<svg viewBox="0 0 16 16"><rect x="2.2" y="4" width="11.6" height="8" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2.6 4.6L8 8.6l5.4-4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    clock: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 4.4V8l2.6 1.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    user: '<svg viewBox="0 0 16 16"><circle cx="8" cy="5.2" r="2.7" fill="currentColor"/><path d="M2.8 14c0-2.9 2.3-4.6 5.2-4.6s5.2 1.7 5.2 4.6z" fill="currentColor"/></svg>',
  };

  function rcNow(){
    const d = new Date();
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }
  function rcRemain(){
    const r = remainingSec();
    if (r == null) return '—';
    const sec = Math.floor(r);
    return Math.floor(sec / 60) + '分' + pad2(sec % 60) + '秒';
  }
  /* 题号用中文数字（真实系统显示「第一题：…」），超过十题也不能断 */
  const CN_DIGIT = '一二三四五六七八九';
  function cnNumber(n){          // 1-based
    if (n <= 0) return String(n);
    if (n <= 9) return CN_DIGIT[n - 1];
    if (n === 10) return '十';
    if (n < 20) return '十' + CN_DIGIT[n - 11];
    if (n % 10 === 0) return CN_DIGIT[Math.floor(n / 10) - 1] + '十';
    return CN_DIGIT[Math.floor(n / 10) - 1] + '十' + CN_DIGIT[(n % 10) - 1];
  }
  function rcQName(p, i){ return '第' + cnNumber(i + 1) + '题：' + p.title; }

  /* Firefox 79 Photon 的工具栏：后退/前进/刷新 + 地址栏 + 主菜单。
     连接期间地址栏左侧的身份位是转圈动画，页面左下角弹出状态面板
     「正在连接 10.10.20.30…」→「正在等待…」，连上或失败后淡出。 */
  const FF_BACK = '<svg viewBox="0 0 16 16"><path d="M10 3.2L4.6 8 10 12.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const FF_FWD = '<svg viewBox="0 0 16 16"><path d="M6 3.2L11.4 8 6 12.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const FF_RELOAD = '<svg viewBox="0 0 16 16"><path d="M13 8a5 5 0 1 1-1.6-3.7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M13.2 2.4v2.9h-2.9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const FF_MENU = '<svg viewBox="0 0 16 16"><path d="M2.6 4.2h10.8M2.6 8h10.8M2.6 11.8h10.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  const FF_SHIELD = '<svg viewBox="0 0 16 16"><path d="M8 2l4.6 1.7v4.1c0 2.7-1.9 4.9-4.6 6.2C5.3 12.7 3.4 10.5 3.4 7.8V3.7z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  const FF_DOWN = '<svg viewBox="0 0 16 16"><path d="M8 2.4v7.2M4.8 6.8L8 10l3.2-3.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.8 12.8h10.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  const FF_FILE = '<svg viewBox="0 0 16 18"><path d="M3.2 1.4h6.1L13 5.1v11.5H3.2z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9.1 1.6v3.7h3.8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';

  function openFirefox(){
    const win = createWindow({ id: 'firefox', title: 'Firefox', ico: 'firefox', w: 1010, h: 730 });
    if (win._built) return win;
    win._built = true;
    const bar = el('div', 'ff-bar');
    const bBack = el('button', 'ff-tb', FF_BACK); bBack.title = '后退';
    const bFwd = el('button', 'ff-tb', FF_FWD); bFwd.title = '前进';
    const bRel = el('button', 'ff-tb', FF_RELOAD); bRel.title = '重新载入';
    const urlbox = el('div', 'ff-url');
    const ident = el('span', 'ff-ident', FF_SHIELD);
    const inp = el('input', 'ff-input');
    inp.value = 'http://www.example.com/';
    urlbox.appendChild(ident); urlbox.appendChild(inp);
    const bMenu = el('button', 'ff-tb', FF_MENU); bMenu.title = '打开菜单';
    const bDl = el('button', 'ff-tb ff-dl', FF_DOWN); bDl.title = '下载';
    bar.appendChild(bBack); bar.appendChild(bFwd); bar.appendChild(bRel);
    bar.appendChild(urlbox); bar.appendChild(bDl); bar.appendChild(bMenu);

    const view = el('div', 'ff-view');
    const page = el('div', 'ff-page');
    const stat = el('div', 'ff-status');
    view.appendChild(page); view.appendChild(stat);
    win.body.appendChild(bar);
    win.body.appendChild(view);
    const setTitle = t => { const n = win.head.querySelector('.win-title'); if (n) n.textContent = t; };

    /* ---- 下载：真 Firefox 的体验是工具栏出现下载箭头 + 弹出下载面板，
            面板里逐项显示进度条，完成后落盘 ---- */
    const dlpanel = el('div', 'ff-dlpanel hidden');
    dlpanel.innerHTML = '<div class="ff-dl-head">下载<span>本次会话</span></div><div class="ff-dl-list"></div>';
    const dlList = dlpanel.querySelector('.ff-dl-list');
    bar.appendChild(dlpanel);
    const dlItems = [];
    let dlSeq = 0;
    function paintDl(){
      dlList.innerHTML = dlItems.map(it => {
        const pct = Math.round(it.got / it.total * 100);
        return '<div class="ff-dl-item' + (it.done ? ' ok' : '') + '">' +
          '<div class="ff-dl-ico">' + FF_FILE + '</div>' +
          '<div class="ff-dl-main">' +
            '<div class="ff-dl-name">' + esc(it.name) + '</div>' +
            '<div class="ff-dl-bar"><i style="width:' + pct + '%"></i></div>' +
            '<div class="ff-dl-meta">' + (it.done
              ? '已完成 · ' + fmtKB(it.total) + ' KB'
              : fmtKB(it.got) + ' KB / ' + fmtKB(it.total) + ' KB · ' + pct + '%') +
          '</div></div></div>';
      }).join('') || '<div class="ff-dl-empty">列表中没有下载</div>';
    }
    paintDl();
    function openDl(){ dlpanel.classList.remove('hidden'); }
    bDl.onclick = () => dlpanel.classList.toggle('hidden');
    /* 点面板/工具栏以外的地方收起（真 Firefox 行为） */
    win.body.addEventListener('mousedown', e => {
      if (dlpanel.classList.contains('hidden')) return;
      if (dlpanel.contains(e.target) || bDl.contains(e.target)) return;
      dlpanel.classList.add('hidden');
    });
    function ffDownload(pid, btn){
      const p = enabledProblems().find(x => x.id === pid);
      if (!p) return;
      if (Desktop.fs.exists(zipPath(pid))){ toast('该题压缩包已下载过', 'ok'); return; }
      if (btn){ btn.dataset.busy = '1'; btn.textContent = '下载中…'; }
      /* 假尺寸按题目的样例组数估，进度节奏随之变化 */
      const sizeKB = 110 + (p.tests || []).length * 41 + (p.title || '').length * 3;
      const item = { name: pid + '.zip', got: 0, total: Math.round(sizeKB * 1024), done: false };
      dlItems.push(item);
      bDl.classList.add('on', 'busy');
      paintDl();
      openDl();
      const dur = 1000 + sizeKB * 1.8;
      const t0 = Date.now();
      const timer = setInterval(() => {
        const k = Math.min(1, (Date.now() - t0) / dur);
        item.got = Math.floor(item.total * k);
        paintDl();
        if (k < 1) return;
        clearInterval(timer);
        item.done = true;
        item.got = item.total;
        const samples = (p.tests || []).filter(t => t.sample).length;
        Desktop.fs.write(zipPath(pid),
          '（压缩包）' + p.id + '.pdf 题面 + ' + samples + ' 组样例数据 + ' + p.id + '.cpp 模板');
        if (btn){ btn.textContent = '已下载'; btn.disabled = true; delete btn.dataset.busy; }
        /* 没有在跑的任务就停掉箭头跳动，真机也只在传输时动 */
        if (!dlItems.some(x => !x.done)) bDl.classList.remove('busy');
        toast('已下载 ' + pid + '.zip → ' + zipPath(pid), 'ok');
        buildDesktopIcons('teacher');      // exam 模式桌面平铺 zip 图标，要让新包出现
        paintDl();
      }, 90);
    }
    win.ffDownload = ffDownload;

    /* ---- 连接过程：没这段就直接刷出页面，是「假」的最直观看点 ---- */
    let loadT = null, loadSeq = 0;
    function ffLoad(url, done, ms){
      const my = ++loadSeq;
      clearTimeout(loadT);
      const host = String(url).replace(/^[a-z]+:\/\//i, '').replace(/[\/?#].*$/, '') || 'about:blank';
      page.innerHTML = '';
      stat.textContent = '正在连接 ' + host + '…';
      stat.classList.remove('out');
      ident.classList.add('busy');
      urlbox.classList.add('loading');
      bRel.disabled = true;
      const total = ms || 760;
      const t1 = Math.max(120, total * 0.42);
      loadT = setTimeout(() => {
        if (my !== loadSeq) return;
        stat.textContent = '正在等待 ' + host + '…';
        loadT = setTimeout(() => {
          if (my !== loadSeq) return;
          ident.classList.remove('busy');
          urlbox.classList.remove('loading');
          bRel.disabled = false;
          stat.classList.add('out');
          done();
        }, Math.max(140, total - t1));
      }, t1);
    }

    /* ---- 离线错误页：外网一律不通，但给出考场内网入口 ---- */
    function rcOffline(){
      rcState.bye = false;
      setTitle('无法连接到服务器 — Mozilla Firefox');
      page.innerHTML =
        '<div class="ff-off">' +
        '<div class="ff-off-ico">' + Desktop.ICONS.browse + '</div>' +
        '<h1>无法连接到服务器</h1>' +
        '<p>考场为离线环境，Firefox 无法访问互联网。</p>' +
        '<p class="dim">考场内部站点：</p>' +
        '<div class="ff-links"><button data-k="rc">程序回收系统　' + RECOVERY_URL + '</button></div>' +
        '</div>';
      page.querySelector('[data-k="rc"]').onclick = () => { inp.value = RECOVERY_URL; rcRender(); };
    }

    /* ---- 登录页 ---- */
    function rcLoginHTML(err){
      return '<div class="rc-app" style="background:#0a2a63">' +
        '<div class="rc-top"><h1>北京青少年信息学活动程序回收系统</h1></div>' +
        '<div class="rc-login">' +
        '<div class="rc-login-body"><div class="rc-form">' +
        '<table>' +
        '<tr><td class="lab">准考证号</td><td><input id="rcId" placeholder="准考证号" autocomplete="off" spellcheck="false"></td></tr>' +
        '<tr><td class="lab">密&emsp;码</td><td><input id="rcPwd" type="password" placeholder="密码" autocomplete="off"></td></tr>' +
        '</table>' +
        '<button class="rc-login-btn" id="rcLoginBtn">登录</button>' +
        '<div class="rc-login-err" id="rcErr">' + esc(err || '') + '</div>' +
        '</div></div></div></div>';
    }
    function rcBindLogin(){
      const idEl = page.querySelector('#rcId');
      const pwEl = page.querySelector('#rcPwd');
      const errEl = page.querySelector('#rcErr');
      /* 准考证号由考生自己输入（考点下发的纸质准考证），账户名不参与 */
      const saved = Store.getExamId();
      if (idEl && saved) idEl.value = saved;
      const submit = () => {
        const idv = (idEl.value || '').trim().toUpperCase();
        const pwv = (pwEl.value || '').trim();
        if (!idv || !pwv){ errEl.textContent = '请输入准考证号和密码'; return; }
        if (!/^[A-Z0-9][A-Z0-9-]{5,}$/.test(idv)){
          errEl.textContent = '准考证号格式不正确，请核对后重新输入';
          return;
        }
        Store.saveExamId(idv);
        rcState.logged = true; rcState.tab = 'notice';
        rcRender();
        toast('已登录程序回收系统', 'ok');
      };
      page.querySelector('#rcLoginBtn').onclick = submit;
      [idEl, pwEl].forEach(x => x.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); }));
    }

    /* ---- 登录后的主体 ---- */
    function rcMainHTML(){
      const problems = enabledProblems();
      const subs = Store.getRcSubmits();
      if (rcState.tab === 'notice'){
        return '<div class="rc-card"><div class="rc-card-h">考生须知</div>' +
          '<div class="rc-card-b rc-notice">' +
          RC_NOTICE_TEXT.map((t, i) => '<p>' + (i + 1) + '.' + esc(t) + '</p>').join('') +
          '</div></div>';
      }
      if (rcState.tab === 'download'){
        return '<div class="rc-card"><div class="rc-card-h">试题下载</div><div class="rc-card-b">' +
          '<p class="rc-hint">点击「下载」把试题压缩包保存到 ~/Desktop/teacher/，' +
          '再用「归档管理器」解压后作答。个别考点可能直接下发试题，请以监考老师说明为准。</p>' +
          '<table class="rc-table"><thead><tr><th class="rc-num">序号</th><th>试题名称</th><th>文件</th><th style="width:88px"></th></tr></thead><tbody>' +
          problems.map((p, i) =>
            '<tr><td class="rc-num">' + (i + 1) + '</td><td>' + esc(rcQName(p, i)) + '</td>' +
            '<td class="rc-size">' + esc(p.id) + '.zip</td>' +
            '<td><button class="rc-btn down" data-dl="' + esc(p.id) + '">下载</button></td></tr>').join('') +
          '</tbody></table></div></div>';
      }
      if (rcState.tab === 'answer'){
        return '<p class="rc-hint" style="margin:0 0 10px">考试剩余：' + esc(rcRemain()) + '</p>' +
          '<table class="rc-table"><thead><tr>' +
          '<th class="rc-num">序号</th><th>试题名称</th><th>提交时间</th><th>内容长度</th><th style="width:120px">提交</th>' +
          '</tr></thead><tbody>' +
          problems.map((p, i) => {
            const r = subs[p.id];
            return '<tr><td class="rc-num">' + (i + 1) + '</td>' +
              '<td>' + esc(rcQName(p, i)) + '</td>' +
              '<td class="rc-time">' + (r ? esc(r.time) : '—') + '</td>' +
              '<td class="rc-size">' + (r ? r.size + 'B' : '—') + '</td>' +
              '<td><div class="rc-acts">' +
              '<button class="rc-btn view" data-view="' + esc(p.id) + '">查看</button>' +
              '<button class="rc-btn submit" data-sub="' + esc(p.id) + '">' +
              (r ? '重新提交' : '提交') + '</button>' +
              '</div></td></tr>';
          }).join('') +
          '</tbody></table>';
      }
      return '<div class="rc-card"><div class="rc-card-b rc-empty">暂无未读消息</div></div>';
    }

    function rcRender(){
      if (rcState.bye){
        setTitle('程序回收系统 — Mozilla Firefox');
        page.innerHTML = '<div class="rc-app">' +
          '<div class="rc-top"><h1>北京青少年信息学活动程序回收系统</h1></div>' +
          '<div class="rc-bye"><p>考试结束，请收拾好自己的所有物品，听从监考老师指挥有序离场。</p></div></div>';
        return;
      }
      if (!rcState.logged){
        setTitle('登录 — 北京青少年信息学活动程序回收系统');
        page.innerHTML = rcLoginHTML();
        rcBindLogin();
        return;
      }
      const stu = Store.getStudent() || {};
      setTitle('程序回收系统 — Mozilla Firefox');
      page.innerHTML = '<div class="rc-app">' +
        '<div class="rc-top"><h1>北京青少年信息学活动程序回收系统</h1>' +
        '<button class="rc-logout" id="rcLogout">退出登录</button></div>' +
        '<div class="rc-body">' +
        '<aside class="rc-side">' +
        '<div class="rc-clock"><span class="rc-i" style="display:inline-block;width:13px;height:13px;vertical-align:-2px;margin-right:7px">' + RC_ICONS.clock + '</span><b id="rcClock">' + rcNow() + '</b></div>' +
        '<div class="rc-user"><span class="rc-i" style="display:inline-block;width:13px;height:13px;vertical-align:-2px;margin-right:7px">' + RC_ICONS.user + '</span>' + esc(Store.getExamId() || stu.account || '考生') + '</div>' +
        '<nav class="rc-nav">' +
        RC_TABS.map(t => '<a data-tab="' + t.id + '" class="' + (rcState.tab === t.id ? 'on' : '') + '">' +
          '<span class="rc-i">' + RC_ICONS[t.icon] + '</span>' + esc(t.label) + '</a>').join('') +
        '</nav></aside>' +
        '<main class="rc-main">' + rcMainHTML() + '</main>' +
        '</div></div>';

      // 侧栏时钟
      const clockEl = page.querySelector('#rcClock');
      const timer = setInterval(() => {
        if (!clockEl || !document.body.contains(clockEl)){ clearInterval(timer); return; }
        clockEl.textContent = rcNow();
      }, 1000);

      page.querySelector('#rcLogout').onclick = () => {
        rcState.logged = false; rcState.bye = true;
        rcRender();
      };
      page.querySelectorAll('.rc-nav a').forEach(a => {
        a.onclick = () => { rcState.tab = a.dataset.tab; rcRender(); };
      });
      page.querySelectorAll('[data-dl]').forEach(b => {
        b.onclick = () => { if (win.ffDownload) win.ffDownload(b.dataset.dl, b); };
      });
      page.querySelectorAll('[data-view]').forEach(b => {
        b.onclick = () => {
          const pid = b.dataset.view;
          if (ideWin){ ideWin.problemId = pid; const sel = ideWin.win.body.querySelector('.ide-bar select'); if (sel) sel.value = pid; if (ideWin.loadCurrent) ideWin.loadCurrent(); }
          else openIDE('Code::Blocks');
        };
      });
      page.querySelectorAll('[data-sub]').forEach(b => {
        b.onclick = () => rcSubmitDlg(b.dataset.sub);
      });
    }

    /* 提交源代码：真实回收系统不读本机磁盘，考生必须把代码粘贴进对话框。
       文本框为空时提交无效 —— 这条必须保留，否则整个作答环节就是假的。 */
    function rcSubmitDlg(pid){
      const problems = enabledProblems();
      const p = problems.find(x => x.id === pid);
      if (!p) return;
      const idx = problems.indexOf(p);
      const prev = Store.getRcSubmits()[pid];

      page.querySelectorAll('.rc-mask').forEach(n => n.remove());
      const mask = el('div', 'rc-mask');
      mask.innerHTML =
        '<div class="rc-dlg">' +
          '<div class="rc-dlg-h"><span>提交源代码</span><button class="rc-dlg-x" data-x>✕</button></div>' +
          '<div class="rc-dlg-b">' +
            '<div class="rc-dlg-row"><span class="rc-dlg-lab">试题</span>' +
              '<span>' + esc(rcQName(p, idx)) + '</span></div>' +
            '<div class="rc-dlg-row"><span class="rc-dlg-lab">文件名</span>' +
              '<span class="rc-dlg-file">' + esc(pid) + '.cpp</span></div>' +
            (prev ? '<div class="rc-dlg-row"><span class="rc-dlg-lab">上次提交</span>' +
              '<span class="rc-dlg-prev">' + esc(prev.time) + '　' + (prev.size || 0) + ' 字节' +
              '（本次提交后将覆盖）</span></div>' : '') +
            '<div class="rc-dlg-tip">请将 ' + esc(pid) + '.cpp 的<b>完整源代码粘贴</b>到下方文本框内。' +
              '本系统不会自动读取你本机上的任何文件；<b>文本框为空时提交无效</b>。</div>' +
            '<textarea class="rc-paste" spellcheck="false" wrap="off" ' +
              'placeholder="在此粘贴 ' + esc(pid) + '.cpp 的完整内容&#10;' +
              '在 Code::Blocks 里按 Ctrl+A 全选、Ctrl+C 复制，再回到这里按 Ctrl+V 粘贴"></textarea>' +
            '<div class="rc-dlg-bar">' +
              '<span class="rc-stat" data-stat>0 字符 · 0 行</span>' +
              '<span class="rc-err" data-err></span>' +
              '<span class="rc-spacer"></span>' +
              '<button class="rc-btn" data-clear>清空</button>' +
            '</div>' +
          '</div>' +
          '<div class="rc-dlg-f">' +
            '<button class="rc-btn" data-cancel>取消</button>' +
            '<button class="rc-btn submit" data-ok>确定提交</button>' +
          '</div>' +
        '</div>';
      page.appendChild(mask);

      const ta = mask.querySelector('.rc-paste');
      const stat = mask.querySelector('[data-stat]');
      const err = mask.querySelector('[data-err]');
      const count = () => {
        const v = ta.value;
        const lines = v ? v.replace(/\n$/, '').split('\n').length : 0;
        stat.textContent = v.length + ' 字符 · ' + lines + ' 行';
        if (v.trim()) err.textContent = '';
      };
      ta.addEventListener('input', count);
      const close = () => mask.remove();
      mask.querySelector('[data-x]').onclick = close;
      mask.querySelector('[data-cancel]').onclick = close;
      mask.querySelector('[data-clear]').onclick = () => { ta.value = ''; count(); ta.focus(); };
      mask.addEventListener('mousedown', e => { if (e.target === mask) close(); });
      mask.querySelector('[data-ok]').onclick = () => {
        const code = ta.value;
        if (!code.trim()){
          err.textContent = '× 请先粘贴源代码，空白提交无效';
          ta.focus();
          return;
        }
        const d = new Date();
        const time = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
          pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
        Store.saveRcSubmit(pid, { time, size: code.length, code });
        mask.remove();
        toast('已提交 ' + pid + '.cpp（' + code.length + ' 字节）', 'ok');
        rcRender();
      };
      setTimeout(() => { try{ ta.focus(); }catch(e){} }, 30);
      count();
    }

    /* 地址栏回车 = 前往；刷新按钮重载当前地址。外网一律连不上 */
    function navigate(){
      const u = String(inp.value || '').trim() || 'http://www.example.com/';
      const inner = /10\.10\.20\.30/.test(u) || /回收/.test(u);
      ffLoad(u, () => {
        if (inner) rcRender();
        else { rcOffline(); toast('考场断网，无法访问外网', 'err'); }
      }, inner ? 820 : 700);
    }
    bRel.onclick = navigate;
    bBack.onclick = () => { inp.value = 'http://www.example.com/'; navigate(); };
    bFwd.onclick = () => toast('没有可前进的页面');
    bMenu.onclick = () => toast('Firefox 菜单：考场镜像已关闭下载与扩展');
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') navigate(); });
    inp.addEventListener('focus', () => inp.select());

    /* 供「程序回收系统」应用直接打开本站（等价于考生在地址栏敲地址） */
    win.gotoRecovery = () => { inp.value = RECOVERY_URL; navigate(); };

    if (rcState.logged || rcState.bye) ffLoad(inp.value, rcRender, 700);
    else ffLoad(inp.value, rcOffline, 860);
    return win;
  }

  /* 从桌面/网格打开程序回收系统：复用同一个 Firefox 窗口 */
  function openRecoverySystem(){
    const win = openFirefox();
    Desktop.focusWin(win);
    if (win.gotoRecovery) win.gotoRecovery();
    return win;
  }

  /* ================= 语言支持 ================= */
  function openLangSupport(){
    const win = createWindow({ id: 'lang', title: '语言支持', ico: 'lang', w: 600, h: 470 });
    if (win._built) return win;
    win._built = true;

    const head = el('div', 'app-hint', '语言安装与区域格式。系统语言为「汉语（简体）」。');
    win.body.appendChild(head);
    const rows = [
      ['汉语（简体）', 'zh_CN.UTF-8', true],
      ['英语（美国）', 'en_US.UTF-8', true],
      ['汉语（繁体）', 'zh_TW.UTF-8', false],
      ['日语', 'ja_JP.UTF-8', false],
    ];
    const tbl = el('table', 'lo-table');
    tbl.innerHTML = '<thead><tr><th>语言</th><th>区域设置</th><th style="width:74px">状态</th><th style="width:110px"></th></tr></thead><tbody>' +
      rows.map(r => '<tr><td>' + esc(r[0]) + '</td><td class="mono">' + esc(r[1]) + '</td>' +
        '<td>' + (r[2] ? '已安装' : '未安装') + '</td>' +
        '<td>' + (r[2] ? '' : '<button class="btn btn-sm" data-inst="' + esc(r[1]) + '">安装</button>') + '</td></tr>').join('') +
      '</tbody>';
    win.body.appendChild(tbl);
    win.body.appendChild(el('div', 'app-foot', '安装语言包属于系统级更改，需要管理员认证。'));

    tbl.querySelectorAll('[data-inst]').forEach(b => {
      b.onclick = async () => {
        const ok = await Desktop.auth({ message: '安装语言包需要认证' });
        if (!ok) return;
        toast('模拟环境不下装语言包（' + b.dataset.inst + '）', 'ok');
      };
    });
    return win;
  }

  /* ================= 字符映射表（gucharmap） ================= */
  function openCharmap(){
    const win = createWindow({ id: 'charmap', title: '字符映射表', ico: 'char', w: 660, h: 500 });
    if (win._built) return win;
    win._built = true;

    const pick = el('div', 'charmap-pick');
    const chars = ('！＂＃＄％＆＇（）＊＋，－．／０１２３４５６７８９：；＜＝＞？＠' +
      'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ［＼］＾＿｀' +
      'ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ｛｜｝～' +
      'αβγδεζηθικλμνξοπρστυφχψω←↑→↓↔⇒⇔∑∏√∞≈≠≤≥±×÷' +
      '∈∉⊂⊃∪∩∀∃∅∠⊥∥⊙').split('');
    chars.forEach(ch => {
      const b = el('button', 'charmap-cell', esc(ch));
      b.onclick = () => {
        box.textContent = ch;
        code.textContent = 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
      };
      pick.appendChild(b);
    });
    win.body.appendChild(pick);

    const bottom = el('div', 'charmap-bar');
    const box = el('span', 'charmap-out', '—');
    const code = el('span', 'charmap-code', 'U+');
    const copy = el('button', 'btn btn-sm', '复制');
    copy.onclick = () => {
      try{ navigator.clipboard.writeText(box.textContent); toast('已复制「' + box.textContent + '」', 'ok'); }
      catch(e){ toast('当前浏览器不允许写剪贴板', 'err'); }
    };
    bottom.appendChild(el('span', 'dim', '字符：')); bottom.appendChild(box);
    bottom.appendChild(code); bottom.appendChild(copy);
    win.body.appendChild(bottom);
    return win;
  }

  /* ================= 字体查看器 ================= */
  function openFontViewer(){
    const win = createWindow({ id: 'fonts', title: '字体', ico: 'fontv', w: 660, h: 500 });
    if (win._built) return win;
    win._built = true;
    const fonts = [
      ['DejaVu Sans', 'DejaVu Sans', 15],
      ['DejaVu Sans Mono', 'DejaVu Sans Mono', 15],
      ['Noto Sans CJK SC', 'Noto Sans CJK SC', 15],
      ['Ubuntu', 'Ubuntu', 15],
      ['Ubuntu Mono', 'Ubuntu Mono', 15],
      ['Sarasa Mono SC', 'Sarasa Mono SC', 15],
    ];
    const wrap = el('div', 'fontv-list');
    fonts.forEach(([name, family, size]) => {
      const card = el('div', 'fontv-card');
      const sample = el('div', 'fontv-sample', '汉字测试 ABC abc 0123');
      sample.style.fontFamily = '"' + family + '"';
      sample.style.fontSize = size + 'px';
      card.appendChild(el('div', 'fontv-name', esc(name)));
      card.appendChild(sample);
      wrap.appendChild(card);
    });
    win.body.appendChild(wrap);
    return win;
  }

  /* ================= Kazam（屏幕录制） ================= */
  function openKazam(){
    const win = createWindow({ id: 'kazam', title: 'Kazam', ico: 'kazam', w: 560, h: 360 });
    if (win._built) return win;
    win._built = true;
    const wrap = el('div', 'kazam-wrap');
    [['屏幕录制', '录制整个屏幕'], ['窗口录制', '选择一个窗口录制'], ['区域录制', '框选屏幕区域录制']]
      .forEach(([t, d]) => {
        const b = el('button', 'kazam-btn',
          '<b>' + esc(t) + '</b><i>' + esc(d) + '</i>');
        b.onclick = () => toast('模拟环境不提供真实录屏（考场机也不允许录屏）', 'err');
        wrap.appendChild(b);
      });
    win.body.appendChild(wrap);
    win.body.appendChild(el('div', 'app-foot', '考场环境中录制屏幕属于违规行为。'));
    return win;
  }

  /* ================= LibreOffice（Calc / Draw / Impress / Writer） ================= */
  function openLibreOffice(kind){
    const icoMap = { Calc: 'calc', Draw: 'lodraw', Impress: 'loimpress', Writer: 'lowriter' };
    const win = createWindow({ id: 'lo:' + kind, title: 'LibreOffice ' + kind, ico: icoMap[kind] || 'low', w: 900, h: 620 });
    if (win._built) return win;
    win._built = true;

    const menu = el('div', 'lo-menu');
    ['文件', '编辑', '视图', '插入', '格式', '样式', '表格', '工具', '窗口', '帮助']
      .forEach(m => menu.appendChild(el('span', 'lo-menu-item', m)));
    win.body.appendChild(menu);

    const bar = el('div', 'lo-toolbar');
    for (let i = 0; i < 12; i++) bar.appendChild(el('span', 'lo-tool-sep'));
    win.body.appendChild(bar);

    const doc = el('div', 'lo-doc');
    if (kind === 'Calc'){
      const t = el('table', 'lo-sheet');
      let html = '<tbody>';
      for (let r = 0; r < 18; r++){
        html += '<tr><th>' + (r + 1) + '</th>';
        for (let c = 0; c < 8; c++) html += '<td></td>';
        html += '</tr>';
      }
      html += '</tbody>';
      t.innerHTML = html;
      doc.appendChild(t);
    } else if (kind === 'Writer'){
      doc.innerHTML = '<div class="lo-page"><p>&nbsp;</p><p>&nbsp;</p><p>&nbsp;</p></div>';
    } else if (kind === 'Impress'){
      doc.innerHTML = '<div class="lo-slides"><div class="lo-slide on"></div><div class="lo-slide"></div><div class="lo-slide"></div></div>' +
        '<div class="lo-stage"><span>单击此处添加标题</span></div>';
    } else {
      doc.innerHTML = '<div class="lo-stage"><span>绘图区域</span></div>';
    }
    win.body.appendChild(doc);
    win.body.appendChild(el('div', 'app-foot', '模拟环境仅提供界面外观，不实现 ' + kind + ' 的排版与计算功能。'));
    return win;
  }

  /* ================= 网络（改动需要管理员认证） ================= */
  async function openNetworkSettings(){
    const ok = await Desktop.auth({ message: '更改网络设置需要认证' });
    if (!ok) return;
    const win = createWindow({ id: 'netcfg', title: '网络', ico: 'net', w: 640, h: 500 });
    if (win._built){ Desktop.focusWin(win); return win; }
    win._built = true;

    const page = el('div', 'ctl-page');
    page.innerHTML =
      '<div class="ctl-h">有线</div>' +
      '<div class="ctl-row ctl-toggle"><span>有线连接 1</span>' +
      '<span class="ctl-switch on"><i></i></span></div>' +
      '<div class="ctl-card">' +
      '<div class="ctl-kv"><span>接口</span><b>eno1</b></div>' +
      '<div class="ctl-kv"><span>IPv4 地址</span><b>10.10.20.' + (60 + Math.floor(Math.random() * 60)) + '</b></div>' +
      '<div class="ctl-kv"><span>子网掩码</span><b>255.255.255.0</b></div>' +
      '<div class="ctl-kv"><span>默认网关</span><b>10.10.20.1</b></div>' +
      '<div class="ctl-kv"><span>DNS</span><b>10.10.20.1</b></div>' +
      '<div class="ctl-kv"><span>互联网访问</span><b>不可用（考场内网）</b></div>' +
      '</div>' +
      '<p class="ctl-note">考场网络由考点统一配置。程序回收系统的地址 ' + RECOVERY_URL +
      ' 属于考点内网，无需连接互联网即可访问。</p>';
    win.body.appendChild(page);
    win.body.appendChild(el('div', 'app-foot', '网络配置在考场内不允许考生自行修改。'));
    return win;
  }

  /* ================= 软件（安装应用需要管理员认证） ================= */
  async function openSoftwareCenter(){
    const ok = await Desktop.auth({ message: '安装或删除软件需要认证' });
    if (!ok) return;
    const win = createWindow({ id: 'software', title: 'Ubuntu 软件', ico: 'app', w: 860, h: 620 });
    if (win._built){ Desktop.focusWin(win); return win; }
    win._built = true;

    const head = el('div', 'sw-head');
    head.innerHTML = '<div class="sw-title">Ubuntu 软件</div>' +
      '<input class="sw-search" placeholder="搜索软件" autocomplete="off" spellcheck="false">';
    win.body.appendChild(head);

    const cats = ['已安装', '全部', '音频和视频', '开发工具', '教育', '游戏', '图形和设计', '办公'];
    const nav = el('nav', 'sw-nav');
    cats.forEach((c, i) => nav.appendChild(el('a', i === 0 ? 'on' : '', c)));
    win.body.appendChild(nav);

    const body = el('div', 'sw-body');
    const pkgs = [
      ['g++ 9.3.0', 'GNU C++ 编译器', '已安装'],
      ['codeblocks 20.03', 'C/C++ 集成开发环境', '已安装'],
      ['geany 1.36', '轻量集成开发环境', '已安装'],
      ['gdb 9.1', 'GNU 调试器', '已安装'],
      ['ddd 3.3.12', 'GDB 图形前端', '已安装'],
      ['fpc 3.0.4', 'Free Pascal 编译器', '已安装'],
      ['vim 8.1', 'Vi IMproved 文本编辑器', '已安装'],
      ['git 2.25', '版本控制系统', '未安装'],
      ['htop 2.2', '交互式进程查看器', '未安装'],
      ['cmake 3.16', '跨平台构建工具', '未安装'],
    ];
    body.innerHTML = '<table class="lo-table"><thead><tr><th>软件包</th><th>说明</th><th style="width:96px">状态</th></tr></thead><tbody>' +
      pkgs.map(pk => '<tr><td class="mono">' + esc(pk[0]) + '</td><td>' + esc(pk[1]) + '</td>' +
        '<td>' + (pk[2] === '已安装'
          ? '<span class="dim">已安装</span>'
          : '<button class="btn btn-sm" data-pkg="' + esc(pk[0]) + '">安装</button>') + '</td></tr>').join('') +
      '</tbody></table>';
    win.body.appendChild(body);
    win.body.appendChild(el('div', 'app-foot', '考场机不联网，也无法在考试期间安装新软件；此处仅展示系统软件源。'));

    body.querySelectorAll('[data-pkg]').forEach(b => {
      b.onclick = () => toast('考场环境不允许安装软件（' + b.dataset.pkg + '）', 'err');
    });
    return win;
  }

  /* ================= 设置（gnome-control-center） ================= */
  async function openSettings(){
    const ok = await Desktop.auth({ message: '打开系统设置需要认证' });
    if (!ok) return;
    const win = createWindow({ id: 'settings', title: '设置', ico: 'settings', w: 780, h: 560 });
    if (win._built){ Desktop.focusWin(win); return win; }
    win._built = true;

    const panels = ['Wi-Fi', '网络', '蓝牙', '背景', '电源', '声音', '区域与语言', '用户', '关于'];
    const wrap = el('div', 'ctl-wrap');
    const nav = el('nav', 'ctl-nav');
    const main = el('div', 'ctl-main');

    function render(name){
      nav.querySelectorAll('a').forEach(a => a.classList.toggle('on', a.textContent === name));
      if (name === '网络'){
        main.innerHTML =
          '<div class="ctl-h">网络</div>' +
          '<div class="ctl-row"><span>有线</span><b>已连接</b></div>' +
          '<div class="ctl-row"><span>Wi-Fi</span><b>不可用</b></div>' +
          '<p class="ctl-note">考场机使用有线内网，不提供无线与互联网访问。修改网络配置需要管理员认证。</p>' +
          '<button class="btn btn-sm" id="ctlNetBtn">打开网络设置…</button>';
        main.querySelector('#ctlNetBtn').onclick = () => openNetworkSettings();
        return;
      }
      if (name === '关于'){
        main.innerHTML =
          '<div class="ctl-h">关于</div>' +
          '<div class="ctl-kv"><span>设备名称</span><b>noi-linux</b></div>' +
          '<div class="ctl-kv"><span>操作系统</span><b>NOI Linux 2.0</b></div>' +
          '<div class="ctl-kv"><span>版本</span><b>Ubuntu 20.04.1 LTS（Focal Fossa）</b></div>' +
          '<div class="ctl-kv"><span>窗口系统</span><b>X11</b></div>' +
          '<div class="ctl-kv"><span>GNOME</span><b>3.36.3</b></div>' +
          '<div class="ctl-kv"><span>当前账户</span><b>' + esc(account ? account.id : '—') + '</b></div>';
        return;
      }
      if (name === '用户'){
        main.innerHTML =
          '<div class="ctl-h">用户</div>' +
          '<div class="ctl-row"><span>当前账户</span><b>' + esc(account ? account.id : '—') +
          (isAdmin() ? '（管理员）' : '（标准用户）') + '</b></div>' +
          '<p class="ctl-note">考点统一管理账户。新增用户、修改密码需要管理员认证。</p>';
        return;
      }
      main.innerHTML = '<div class="ctl-h">' + esc(name) + '</div>' +
        '<p class="ctl-note">该项在考场环境中由管理员统一配置，考生无需调整。</p>';
    }

    panels.forEach((p, i) => {
      const a = el('a', i === 0 ? 'on' : '', p);
      a.onclick = () => render(p);
      nav.appendChild(a);
    });
    render(panels[0]);
    wrap.appendChild(nav); wrap.appendChild(main);
    win.body.appendChild(wrap);
    return win;
  }

  /* ================= 系统监视器（gnome-system-monitor） ================= */
  function openSysInfo(){
    const win = createWindow({ id: 'sysinfo', title: '系统监视器', ico: 'monitor', w: 620, h: 480 });
    if (win._built) return win;
    win._built = true;
    const s = Store.getSettings();
    const stu = Store.getStudent() || {};
    const st = Store.getState();
    const rows = [
      ['发行版', 'NOI Linux 2.0（基于 Ubuntu 20.04.1）'],
      ['架构 / 内核', 'x86_64 / Linux 5.4.0-42-generic'],
      ['桌面环境', 'GNOME 3.36（ubuntu 会话 · Yaru 主题）'],
      ['编译器', 'GCC / G++ 9.3.0（-std=c++14）'],
      ['调试器', 'GDB 9.1 / DDD'],
      ['评测工具', 'Arbiter_local'],
      ['内存', '4.0 GiB'],
      ['网络', '有线连接 · 无互联网访问'],
      ['—', ''],
      ['当前账户', (account ? account.id : '—') + (isAdmin() ? '（管理员）' : '')],
      ['考试名称', s.examName || '—'],
      ['考试状态', { notstarted: '未开始', running: '进行中', ended: '已结束' }[st.status] || '—'],
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
    pane.appendChild(el('div', 'submit-path', '提交位置：~/Desktop/teacher/&lt;题名&gt;/&lt;题名&gt;.cpp'));
    pane.appendChild(tbl);
    pane.appendChild(el('div', 'submit-warn',
      '交卷会记录当前各题源代码，未保存的代码不会提交。交卷后仍可重新登录继续作答。请先在 Code::Blocks 中检查各题代码是否完整。'));
    const btn = el('button', 'btn btn-primary', '确认交卷');
    btn.onclick = () => {
      if (!confirm('确认交卷？交卷后仍可重新登录继续作答。')) return;
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
      if (c) c.textContent = gnomeClock(new Date());
      return;
    }
    const st = Store.getState();
    if (st.status === 'ended'){ doSubmit('考试结束（管理员结束）'); return; }
    /* 正式考试的机器不限时，顶栏不显示倒计时（真实 NOI Linux 顶栏只有时钟）；
       考试剩余时间由「程序回收系统」按场次计算并显示 */
    const clk = $('#sClock');
    if (clk) clk.textContent = gnomeClock(new Date());
  }
  /* GNOME 顶栏时钟：10月31日 星期六, 13:47 */
  function gnomeClock(d){
    const wd = '日一二三四五六'[d.getDay()];
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 星期' + wd +
      ', ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
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
      list.push({ time: Date.now(), name: stu.account || '', sid: Store.getExamId() || '', problemId: p.id, code });
    });
    if (list.length) Store.addSubmissions(list);
    Store.saveStudentState({ submitted: true, submittedAt: Date.now(), reason });
    (async () => {
      let saved = 0;
      for (const s of list){
        try{ if (await Store.fs.saveSubmission(stu.account || 'candidate', s.problemId, s.code)) saved++; }catch(e){}
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

  return { loginAs, logout, isAdmin, currentAccount: () => account };
})();

/* 暴露到 window：desktop.js 的 polkit 校验与测试脚本要按名访问
   （顶层 const 只进全局词法环境，不会自动挂到 window 上） */
window.Student = Student;
