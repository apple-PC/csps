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
    const s = Store.getSettings();
    /* 官方 NOI Linux 2.0 的桌面目录就是 teacher（演示机原始状态），
       考生文件放里面，桌面上只有这一个文件夹加回收站 */
    const sid = 'teacher';
    const fs = Desktop.fs;
    /* 官方 NOI Linux 2.0 的桌面上只有考生自己的目录（演示机叫 teacher），
     * 题面、样例、须知都收在这个目录里，而不是摊在桌面上。
     * 管理员把 desktopIcons 设成 exam 时，才额外把每题的压缩包平铺到桌面。 */
    const flat = s.desktopIcons === 'exam';
    const home = '~/Desktop/' + sid;
    fs.reset();
    fs.mkdirp(home);
    enabledProblems().forEach(p => {
      const dir = home + '/' + p.id;
      fs.mkdirp(dir);
      fs.write(dir + '/' + p.id + '.cpp', Store.getCode(p.id) || '');
      const samples = p.tests.filter(t => t.sample);
      samples.forEach((t, i) => {
        fs.write(dir + '/' + p.id + (i + 1) + '.in', t.input);
        fs.write(dir + '/' + p.id + (i + 1) + '.ans', t.expected);
      });
      const zipBody = '（压缩包）' + p.id + '.pdf 题面 + ' + samples.length + ' 组样例数据';
      fs.write((flat ? '~/Desktop/' : home + '/') + p.id + '.zip', zipBody);
    });
    fs.write((flat ? '~/Desktop/' : home + '/') + '考试须知.txt', noticeText());
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
      { id: 'gucharmap',label: '字符',        ico: 'char',    group: '系统工具', desc: '字符映射表', run(){ openCharmap(); } },
      { id: 'fonts',    label: '字体',        ico: 'fontv',   group: '系统工具', desc: '字体查看器', run(){ openFontViewer(); } },

      { id: 'arbiter',  label: 'Arbiter_local', ico: 'judge', group: '编程', desc: '本地评测系统', run(){ openArbiter(); } },
      { id: 'byobu',    label: 'Byobu Terminal', ico: 'termpanel', group: '编程', desc: '终端复用器', run(){ openTerminal(); } },
      { id: 'cb',       label: 'Code::Blocks IDE', ico: 'cb', group: '编程', desc: 'C/C++ IDE 20.03', run(){ openIDE('Code::Blocks'); } },
      { id: 'ddd',      label: 'Data Display Debugger', ico: 'ddd', group: '编程', desc: 'GDB 图形前端 3.3.12', run(){ openGDB('ddd'); } },
      { id: 'emacs',    label: 'Emacs (GUI)', ico: 'emacs',  group: '编程', desc: '编辑器 26.3', run(){ openTuiEditor('emacs'); } },
      { id: 'emacst',   label: 'Emacs (Terminal)', ico: 'emacs', group: '编程', desc: '编辑器 26.3', run(){ openTuiEditor('emacs'); } },
      { id: 'geany',    label: 'Geany',       ico: 'geany',  group: '编程', desc: '轻量 IDE 1.36', run(){ openIDE('Geany'); } },
      { id: 'joe',      label: "Joe's Own Editor", ico: 'joe', group: '编程', desc: 'joe', run(){ openTuiEditor('joe'); } },
      { id: 'jmacs',    label: "Joe's Own Editor", ico: 'joe', group: '编程', desc: 'jmacs', run(){ openTuiEditor('joe'); } },
      { id: 'jpico',    label: "Joe's Own Editor", ico: 'joe', group: '编程', desc: 'jpico', run(){ openTuiEditor('joe'); } },
      { id: 'jstar',    label: "Joe's Own Editor", ico: 'joe', group: '编程', desc: 'jstar', run(){ openTuiEditor('joe'); } },

      { id: 'firefox',  label: 'Firefox 网络浏览器', ico: 'firefox', group: '互联网', desc: '79.0（考场内网）', pin: true, run(){ openFirefox(); } },

      { id: 'kazam',    label: 'Kazam', ico: 'kazam', group: '影音', desc: '屏幕录制 1.4.5', run(){ openKazam(); } },
      { id: 'low',      label: 'LibreOffice Calc',    ico: 'calc',    group: '办公', desc: '电子表格 6.4.4', run(){ openLibreOffice('Calc'); } },
      { id: 'lodraw',   label: 'LibreOffice Draw',    ico: 'lodraw',  group: '办公', desc: '绘图 6.4.4',    run(){ openLibreOffice('Draw'); } },
      { id: 'loimpress',label: 'LibreOffice Impress', ico: 'loimpress', group: '办公', desc: '演示文稿 6.4.4', run(){ openLibreOffice('Impress'); } },
      { id: 'lowriter', label: 'LibreOffice Writer',  ico: 'lowriter', group: '办公', desc: '文字处理 6.4.4', run(){ openLibreOffice('Writer'); } },

      /* Ubuntu 20.04 自带的「软件」；打开即要求管理员认证，考场里装不了东西 */
      { id: 'software', label: '软件', ico: 'app', group: '系统工具', desc: 'Ubuntu 软件中心（需管理员）', run(){ openSoftwareCenter(); } },
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
  /* Code::Blocks 20.03 的真实菜单栏（照官方演示视频逐字抄的），
   * 顺序：File Edit View Search Project Build Debug wxSmith Tools Tools+ Plugins DoxyBlocks Settings Valgrind Help */
  const IDE_MENU_ORDER = ['File','Edit','View','Search','Project','Build','Debug','wxSmith','Tools','Tools+','Plugins','DoxyBlocks','Settings','Valgrind','Help'];
  const IDE_MENU_ITEMS = {
    File: [
      { label: '新建文件', hint: 'Ctrl+N', dim: true },
      { label: '打开…', hint: 'Ctrl+O', dim: true },
      { label: '保存', hint: 'Ctrl+S', run(it, ctx){ ctx.save(); } },
      { label: '另存为…', hint: 'F12', dim: true },
      { sep: true },
      { label: '关闭窗口', hint: 'Ctrl+W', run(it, ctx){ ctx.close(); } },
    ],
    Edit: [
      { label: '撤销', hint: 'Ctrl+Z', dim: true },
      { label: '重做', hint: 'Ctrl+Y', dim: true },
      { sep: true },
      { label: '剪切', hint: 'Ctrl+X', dim: true },
      { label: '复制', hint: 'Ctrl+C', dim: true },
      { label: '粘贴', hint: 'Ctrl+V', dim: true },
      { label: '全选', hint: 'Ctrl+A', dim: true },
      { sep: true },
      { label: '查找…', hint: 'Ctrl+F', dim: true },
    ],
    View: [
      { label: '管理器面板', dim: true },
      { label: '日志面板', dim: true },
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

  function openIDE(name){
    const problems = enabledProblems();
    if (!problems.length){ toast('管理员未启用任何题目', 'err'); return; }
    const label = name || 'Code::Blocks';
    const icoName = label === 'Code::Blocks' ? 'cb' : label === 'Geany' ? 'geany' : label === 'Lazarus' ? 'lazarus' : 'gedit';
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
    if (!d || d.type !== 'ide:code') return;
    if (!ideWin) return;
    const pid = ideWin.problemId;
    if (!pid) return;
    Store.saveCode(pid, d.code);
    const stu = Store.getStudent() || {};
    const node = Desktop.fs.nodes.get('~/Desktop/teacher/' + pid + '/' + pid + '.cpp');
    if (node && node.content !== d.code) node.content = d.code;
    const dot = ideWin.win.body.querySelector('.save-dot');
    if (dot) dot.textContent = pid + '.cpp 已自动保存 · ' + fmtSize(d.code.length);
  });

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
  function openTuiEditor(kind){
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
          if (/\.zip$/.test(n.name)){
            const pid = n.name.replace(/\.zip$/, '');
            const p = enabledProblems().find(x => x.id === pid);
            if (p) return openZip(p);
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

  function openFirefox(){
    const win = createWindow({ id: 'firefox', title: 'Firefox', ico: 'firefox', w: 1010, h: 730 });
    if (win._built) return win;
    win._built = true;
    const bar = el('div', 'ff-bar');
    const inp = el('input');
    inp.value = 'http://www.example.com/';
    const go = el('button', 'btn btn-sm', '前往');
    bar.appendChild(inp); bar.appendChild(go);
    const page = el('div', 'ff-page');
    page.style.position = 'relative';
    win.body.appendChild(bar);
    win.body.appendChild(page);
    const setTitle = t => { const n = win.head.querySelector('.win-title'); if (n) n.textContent = t; };

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
          '<p class="rc-hint">点击「下载」将试题文件保存到本机桌面。个别考点可能直接下发到本机，请以监考老师说明为准。</p>' +
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
            const code = Store.getCode(p.id) || '';
            return '<tr><td class="rc-num">' + (i + 1) + '</td>' +
              '<td>' + esc(rcQName(p, i)) + '</td>' +
              '<td class="rc-time">' + (r ? esc(r.time) : '—') + '</td>' +
              '<td class="rc-size">' + (r ? r.size + 'B' : (code ? '未提交' : '—')) + '</td>' +
              '<td><div class="rc-acts">' +
              '<button class="rc-btn view" data-view="' + esc(p.id) + '">查看</button>' +
              '<button class="rc-btn submit" data-sub="' + esc(p.id) + '">提交</button>' +
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
        b.onclick = () => {
          const pid = b.dataset.dl;
          const stu2 = Store.getStudent() || {};
          toast('已下载 ' + pid + '.zip 到 ~/Desktop/' + (stu2.id || 'answers') + '/', 'ok');
          b.textContent = '已下载';
          b.disabled = true;
        };
      });
      page.querySelectorAll('[data-view]').forEach(b => {
        b.onclick = () => {
          const pid = b.dataset.view;
          if (ideWin){ ideWin.problemId = pid; const sel = ideWin.win.body.querySelector('.ide-bar select'); if (sel) sel.value = pid; if (ideWin.loadCurrent) ideWin.loadCurrent(); }
          else openIDE('Code::Blocks');
        };
      });
      page.querySelectorAll('[data-sub]').forEach(b => {
        b.onclick = () => {
          const pid = b.dataset.sub;
          const code = Store.getCode(pid) || '';
          if (!code.trim()){ toast('该题代码为空，请先在 Code::Blocks 中作答并保存', 'err'); return; }
          const d = new Date();
          const time = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
            pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
          Store.saveRcSubmit(pid, { time, size: code.length });
          toast('已提交 ' + pid + '.cpp（' + code.length + ' 字节）', 'ok');
          rcRender();
        };
      });
    }

    go.onclick = () => {
      const u = String(inp.value || '').trim();
      if (/10\.10\.20\.30/.test(u) || /回收/.test(u)) rcRender();
      else { rcOffline(); toast('考场断网，无法访问外网', 'err'); }
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') go.onclick(); });

    /* 供「程序回收系统」应用直接打开本站（等价于考生在地址栏敲地址） */
    win.gotoRecovery = () => { inp.value = RECOVERY_URL; rcRender(); };

    if (rcState.logged || rcState.bye) rcRender();
    else rcOffline();
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
