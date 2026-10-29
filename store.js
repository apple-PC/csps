/* 持久层
 * - 浏览器存储（localStorage）：本机即时共享，管理员与学生端同一页面来源
 * - 文件夹镜像（File System Access API）：管理员选择「考试数据文件夹」后，
 *   所有偏好设置 / 题库 / 考试状态 实时写盘；交卷时写入学生代码
 * 文件夹结构：
 *   <考试数据文件夹>/
 *     settings.json      考试偏好
 *     problems.json      题库（含开关与测试点）
 *     state.json         考试状态
 *     submissions/       交卷代码 <时间>_<题名>.cpp
 */
'use strict';

const Store = (() => {
  const K = {
    settings: 'csp_sim:settings',
    problems: 'csp_sim:problems',
    state: 'csp_sim:state',
    student: 'csp_sim:student',
    codes: 'csp_sim:codes',        // { [problemId]: code }
    submissions: 'csp_sim:submissions',
    studentState: 'csp_sim:studentState',
    ghToken: 'csp_sim:ghtoken',       // 管理员粘贴的 GitHub token，仅存本机，绝不进代码
  };

  function lsGet(key, fallback){
    try{
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    }catch(e){ return fallback; }
  }
  function lsSet(key, val){
    try{ localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch(e){ console.warn('localStorage 写入失败', e); return false; }
  }

  /* ---------- IndexedDB（保存文件夹句柄） ---------- */
  function idb(){
    return new Promise((res, rej) => {
      const rq = indexedDB.open('csp_sim', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
  }
  async function idbSet(k, v){
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(v, k);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }
  async function idbGet(k){
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readonly');
      const rq = tx.objectStore('kv').get(k);
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
  }

  /* ---------- 文件夹镜像 ---------- */
  const fs = {
    supported: typeof window.showDirectoryPicker === 'function',
    handle: null,
    name: '',
    granted: false,

    async connect(){
      if (!this.supported) throw new Error('当前浏览器不支持文件夹访问（建议使用 Chrome / Edge）');
      const h = await window.showDirectoryPicker({ id: 'csp-exam', mode: 'readwrite' });
      this.handle = h;
      this.name = h.name;
      await idbSet('dirHandle', h);
      this.granted = true;
      await this.mirrorAll();
      return h;
    },
    /* 重开页面后恢复句柄（返回 'granted' | 'need-permission' | 'none'） */
    async restore(){
      try{
        const h = await idbGet('dirHandle');
        if (!h || !h.queryPermission) return 'none';
        this.handle = h;
        this.name = h.name;
        const perm = await h.queryPermission({ mode: 'readwrite' });
        this.granted = perm === 'granted';
        return this.granted ? 'granted' : 'need-permission';
      }catch(e){ return 'none'; }
    },
    async requestPermission(){
      if (!this.handle) return false;
      const perm = await this.handle.requestPermission({ mode: 'readwrite' });
      this.granted = perm === 'granted';
      return this.granted;
    },
    async writeFile(dirHandle, path, content){
      const parts = path.split('/');
      let dir = dirHandle;
      for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i], { create: true });
      const fh = await dir.getFileHandle(parts[parts.length - 1], { create: true });
      const w = await fh.createWritable();
      await w.write(typeof content === 'string' ? content : content);
      await w.close();
    },
    async mirrorAll(){
      if (!this.handle || !this.granted) return false;
      try{
        await this.writeFile(this.handle, 'settings.json', JSON.stringify(lsGet(K.settings), null, 2));
        await this.writeFile(this.handle, 'problems.json', JSON.stringify(lsGet(K.problems), null, 2));
        await this.writeFile(this.handle, 'state.json', JSON.stringify(lsGet(K.state), null, 2));
        return true;
      }catch(e){ console.warn('文件夹镜像失败', e); return false; }
    },
    async mirrorDebounced(){
      clearTimeout(this._t);
      this._t = setTimeout(() => this.mirrorAll(), 400);
    },
    /* 交卷：写入学生代码文件 */
    async saveSubmission(name, problemId, code){
      if (!this.handle || !this.granted) return false;
      try{
        const st = lsGet(K.student, {});
        const who = (st.id || 'student') + '_' + (st.name || '');
        await this.writeFile(this.handle, 'submissions/' + who + '_' + problemId + '.cpp', code);
        return true;
      }catch(e){ console.warn('交卷写盘失败', e); return false; }
    },
    disconnect(){ this.handle = null; this.name = ''; this.granted = false; },
    /* 读取文件夹中的考试数据（需已授权），返回 {settings, problems, state} 或 null */
    async readExamData(){
      if (!this.handle || !this.granted) return null;
      try{
        const read = async path => {
          const fh = await this.handle.getFileHandle(path);
          const file = await fh.getFile();
          return file.text();
        };
        const out = {};
        try{ out.settings = JSON.parse(await read('settings.json')); }catch(e){}
        try{ out.problems = JSON.parse(await read('problems.json')); }catch(e){}
        try{ out.state = JSON.parse(await read('state.json')); }catch(e){}
        return (out.settings || out.problems) ? out : null;
      }catch(e){ return null; }
    },
  };

  /* ---------- 业务存取 ---------- */
  const DEFAULT_SETTINGS = {
    examName: 'CSP-S 复赛模拟考试',
    durationMin: 230,             // 真实 CSP-S 复赛 3.5h + 30min
    startMode: 'auto',            // auto: 学生进入即计时 | manual: 管理员手动开始 | scheduled: 定时
    scheduledAt: '',
    allowJudge: true,             // 允许学生在 IDE 内本地评测
    allowCopy: true,              // 允许 IDE 复制粘贴
    watermark: true,
    notice: '1. 考试期间请独立完成作答。\n2. 每题源程序请保存在 IDE 中，交卷前确认已保存。\n3. 时间结束后系统将自动交卷。',
  };

  return {
    K, fs,
    /* ---------- 仓库数据源（Pages 部署下：考试数据存进仓库） ----------
     * 读：站点启动时从仓库 exam/data.json 拉取，学生端无需再连接本地文件夹。
     * 写：管理员在「发布到仓库」处粘贴自己的 token（仅存本机），PUT 进仓库。
     * 注意：token 绝不写入代码；仓库公开，数据本就公开，只有写入需要 token。 */
    REMOTE: { enabled: true, url: 'exam/data.json', repo: 'apple-PC/csps-simulator', branch: 'main', path: 'exam/data.json' },
    async fetchRemote(){
      if (!this.REMOTE.enabled) return null;
      try {
        const r = await fetch(this.REMOTE.url, { cache: 'no-store' });
        if (!r.ok) return null;
        return await r.json();
      } catch (e) { return null; }
    },
    async applyRemoteIfEmpty(data){
      if (!data || !data.settings) return false;
      const hasLocal = !!lsGet(K.settings) && !!lsGet(K.problems);
      if (hasLocal) return false;          // 本机已有数据则不被远程覆盖
      lsSet(K.settings, data.settings);
      if (data.problems) lsSet(K.problems, data.problems);
      this.fs.mirrorDebounced();
      return true;
    },
    async initRemote(){
      const data = await this.fetchRemote();
      if (data) return await this.applyRemoteIfEmpty(data);
      return false;
    },
    getSettings(){ return Object.assign({}, DEFAULT_SETTINGS, lsGet(K.settings, {})); },
    getGhToken(){ return lsGet(K.ghToken, ''); },
    saveSettings(s){ lsSet(K.settings, s); fs.mirrorDebounced(); },
    getProblems(){ return lsGet(K.problems, null); },
    /* 保存题库：内置题只存元信息（避免大测试点数据撑爆 localStorage 配额），
       运行时由 resolveProblems() 从 problems.js 解析完整数据 */
    saveProblems(p){
      const slim = (p || []).map(x => x.builtin
        ? { id: x.id, title: x.title, source: 'builtin', tl: x.tl, enabled: !!x.enabled, builtin: true }
        : Object.assign({}, x, { builtin: false }));
      lsSet(K.problems, slim);
      fs.mirrorDebounced();
    },
    /* 把（可能精简的）题库列表解析为含完整题面与测试点的列表 */
    resolveProblems(list){
      const byId = {};
      (window.BUILTIN_PROBLEMS || []).forEach(b => { byId[b.id] = b; });
      return (list || []).map(p => {
        if (!p.builtin) return p;
        const b = byId[p.id];
        if (!b) return null;
        return {
          id: p.id, title: p.title, source: 'builtin', builtin: true,
          tl: p.tl || b.tl, enabled: !!p.enabled,
          statement: { type: 'html', data: b.statement },
          tests: b.tests,
        };
      }).filter(Boolean);
    },
    getState(){ return lsGet(K.state, { status: 'notstarted' }); },
    saveState(st){ lsSet(K.state, st); fs.mirrorDebounced(); },
    getStudent(){ return lsGet(K.student, null); },
    saveStudent(s){ lsSet(K.student, s); },
    getCodes(){ return lsGet(K.codes, {}); },
    saveCode(pid, code){ const c = lsGet(K.codes, {}); c[pid] = code; lsSet(K.codes, c); },
    getCode(pid){ return lsGet(K.codes, {})[pid] || ''; },
    getSubmissions(){ return lsGet(K.submissions, []); },
    addSubmissions(list){ return lsSet(K.submissions, lsGet(K.submissions, []).concat(list)); },
    getStudentState(){ return lsGet(K.studentState, {}); },
    saveStudentState(st){ lsSet(K.studentState, st); },
    resetExamData(){
      localStorage.removeItem(K.state);
      localStorage.removeItem(K.codes);
      localStorage.removeItem(K.submissions);
      localStorage.removeItem(K.studentState);
      localStorage.removeItem(K.student);
      fs.mirrorDebounced();
    },
    resetAll(){
      Object.values(K).forEach(k => localStorage.removeItem(k));
      localStorage.removeItem('cpp-theme');
    },
  };
})();
