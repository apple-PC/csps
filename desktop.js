/* 桌面外壳：GNOME Flashback 风格双面板 + 应用菜单 + 窗口管理器 + 虚拟文件系统
 * 只负责「桌面怎么长、怎么点」，不关心考试业务；业务窗口由 student.js 注册进来。
 */
'use strict';

const Desktop = (() => {
  const app = () => document.getElementById('studentApp');
  const deskEl = () => document.getElementById('sDesktop');

  const apps = [];                 // {id, group, label, ico, desc, run, hidden}
  const wins = new Map();          // wid -> rec
  let winSeq = 0;
  let ctxEl = null;
  let popEl = null;
  let mounted = false;

  /* ═══════════════ 图标（内联 SVG，朴素风格） ═══════════════ */
  const ICONS = {
    folder: '<svg viewBox="0 0 48 48"><path d="M3 11a3 3 0 013-3h12l4 4h20a3 3 0 013 3v24a3 3 0 01-3 3H6a3 3 0 01-3-3z" fill="#d9a13a" stroke="#a97c22" stroke-width="1.2"/><path d="M3 16h42v22a3 3 0 01-3 3H6a3 3 0 01-3-3z" fill="#f0c05a" stroke="#a97c22" stroke-width="1.2"/><path d="M3 16h42" stroke="#c08d2c" stroke-width="1.4"/></svg>',
    zip: '<svg viewBox="0 0 48 48"><rect x="9" y="4" width="30" height="40" rx="3" fill="#eef2f6" stroke="#6f7d8a" stroke-width="1.4"/><rect x="9" y="4" width="30" height="10" rx="3" fill="#cdd7e1" stroke="#6f7d8a" stroke-width="1.4"/><rect x="22" y="15" width="4" height="15" fill="#5b6874"/><path d="M22 18h4M22 22h4M22 26h4" stroke="#eef2f6" stroke-width="1.6"/><rect x="18.5" y="30" width="11" height="10" rx="2" fill="#5b6874"/><circle cx="24" cy="35" r="1.8" fill="#eef2f6"/></svg>',
    text: '<svg viewBox="0 0 48 48"><path d="M10 4h19l9 9v31a2 2 0 01-2 2H10a2 2 0 01-2-2V6a2 2 0 012-2z" fill="#fbfcfd" stroke="#7f8d9b" stroke-width="1.3"/><path d="M29 4l9 9h-9z" fill="#dbe3eb" stroke="#7f8d9b" stroke-width="1.3"/><path d="M14 21h18M14 27h18M14 33h11" stroke="#9aa8b6" stroke-width="2.2" stroke-linecap="round"/></svg>',
    code: '<svg viewBox="0 0 48 48"><rect x="4" y="7" width="40" height="34" rx="4" fill="#e7edf4" stroke="#7f8d9b" stroke-width="1.4"/><path d="M4 12a4 4 0 014-4h32a4 4 0 014 4v4H4z" fill="#c9d6e3"/><path d="M16 23l-5 6 5 6M32 23l5 6-5 6M27 21l-6 16" stroke="#2b6ca3" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    term: '<svg viewBox="0 0 48 48"><rect x="4" y="7" width="40" height="34" rx="4" fill="#242c33" stroke="#9fb0c0" stroke-width="1.6"/><path d="M12 19l6 5-6 5" stroke="#7fe08a" stroke-width="2.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M23 30h12" stroke="#e2ecf5" stroke-width="2.9" stroke-linecap="round"/></svg>',
    submit: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="19" fill="#2f8f5b" stroke="#1f6b43" stroke-width="1.4"/><path d="M24 33V15M17 22l7-7 7 7" stroke="#fff" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    browse: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="18" fill="#e8622c" stroke="#b8481c" stroke-width="1.4"/><path d="M24 6c6 6 6 30 0 36M6 24h36" stroke="#fbd0b6" stroke-width="2" fill="none"/><circle cx="24" cy="24" r="6" fill="#fbd0b6" opacity=".9"/></svg>',
    judge: '<svg viewBox="0 0 48 48"><rect x="7" y="5" width="34" height="38" rx="3" fill="#fbfcfd" stroke="#7f8d9b" stroke-width="1.4"/><path d="M13 14h22M13 21h22M13 28h11" stroke="#c3ccd6" stroke-width="2.4" stroke-linecap="round"/><path d="M24 33l4 4 8-9" stroke="#2f8f5b" stroke-width="3.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    dbg: '<svg viewBox="0 0 48 48"><rect x="4" y="7" width="40" height="34" rx="4" fill="#e7edf4" stroke="#7f8d9b" stroke-width="1.4"/><circle cx="19" cy="21" r="6" fill="none" stroke="#b8862f" stroke-width="2.9"/><path d="M23.5 25.5L30 32" stroke="#b8862f" stroke-width="2.9" stroke-linecap="round"/><path d="M33 17h7M33 23h7M33 29h5" stroke="#9aa8b6" stroke-width="2.1" stroke-linecap="round"/></svg>',
    app: '<svg viewBox="0 0 48 48"><rect x="5" y="6" width="38" height="36" rx="4" fill="#e7edf4" stroke="#7f8d9b" stroke-width="1.4"/><rect x="5" y="6" width="38" height="7" rx="4" fill="#c1cfdd"/><rect x="10" y="17" width="12" height="9" rx="1.5" fill="#f0c05a"/><rect x="24" y="17" width="14" height="9" rx="1.5" fill="#8fd6a8"/><rect x="10" y="28" width="28" height="8" rx="1.5" fill="#9fb8d0"/></svg>',
    settings: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="7" fill="none" stroke="#8b98a5" stroke-width="4"/><path d="M24 6v6M24 36v6M6 24h6M36 24h6M11 11l4 4M33 33l4 4M37 11l-4 4M15 33l-4 4" stroke="#8b98a5" stroke-width="4" stroke-linecap="round"/></svg>',
    home: '<svg viewBox="0 0 48 48"><path d="M6 23L24 7l18 16" stroke="#a9b6c4" stroke-width="3.2" fill="none" stroke-linejoin="round"/><path d="M11 22v19h26V22" fill="#c9d3dc" stroke="#8b98a5" stroke-width="1.6"/><rect x="20" y="29" width="8" height="12" fill="#6d7a87"/></svg>',
    net: '<svg viewBox="0 0 24 24"><path d="M4 15h4v5H4zM10 9h4v11h-4zM16 12h4v8h-4z" fill="#cfd6dd"/></svg>',
    vol: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="#cfd6dd"/><path d="M16 9.5a4 4 0 010 5M18.5 7a7.5 7.5 0 010 10" stroke="#cfd6dd" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>',
  };
  function ico(name, cls){
    return '<span class="ico' + (cls ? ' ' + cls : '') + '">' + (ICONS[name] || ICONS.app) + '</span>';
  }

  /* ═══════════════ 虚拟文件系统 ═══════════════ */
  const HOME = '/home/student';
  const fs = {
    home: HOME,
    cwd: HOME,
    nodes: new Map(),          // abs -> {type:'dir'|'file', content, mtime}
    onWrite: null,             // (abs, content) => void  外部同步钩子
    reset(){
      this.nodes.clear();
      this.cwd = HOME;
      this.nodes.set(HOME, { type: 'dir', mtime: Date.now() });
      this.nodes.set(HOME + '/Desktop', { type: 'dir', mtime: Date.now() });
    },
    abs(p){
      if (!p) return this.cwd;
      p = String(p);
      if (p === '~') return HOME;
      if (p.startsWith('~/')) return HOME + p.slice(1);
      if (p.startsWith('/')) return p.replace(/\/+$/, '') || '/';
      const base = this.cwd === '/' ? '' : this.cwd;
      const out = [];
      (base + '/' + p).split('/').forEach(seg => {
        if (!seg || seg === '.') return;
        if (seg === '..') out.pop();
        else out.push(seg);
      });
      return '/' + out.join('/');
    },
    pretty(p){
      p = p || this.cwd;
      return p === HOME ? '~' : p.startsWith(HOME + '/') ? '~' + p.slice(HOME.length) : p;
    },
    exists(p){ return this.nodes.has(this.abs(p)); },
    isDir(p){ const n = this.nodes.get(this.abs(p)); return !!n && n.type === 'dir'; },
    mkdir(p){
      const a = this.abs(p);
      if (this.nodes.has(a)) return false;
      const parent = a.slice(0, a.lastIndexOf('/')) || '/';
      if (!this.isDir(parent)) throw new Error('No such file or directory');
      this.nodes.set(a, { type: 'dir', mtime: Date.now() });
      return true;
    },
    mkdirp(p){
      const a = this.abs(p);
      const parts = a.split('/').filter(Boolean);
      let cur = '';
      for (const seg of parts){
        cur += '/' + seg;
        if (!this.nodes.has(cur)) this.nodes.set(cur, { type: 'dir', mtime: Date.now() });
      }
      return a;
    },
    write(p, content){
      const a = this.abs(p);
      const parent = a.slice(0, a.lastIndexOf('/')) || '/';
      if (!this.isDir(parent)) throw new Error('No such file or directory');
      this.nodes.set(a, { type: 'file', content: String(content == null ? '' : content), mtime: Date.now() });
      if (this.onWrite) { try { this.onWrite(a, String(content == null ? '' : content)); } catch (e) {} }
      return a;
    },
    read(p){
      const n = this.nodes.get(this.abs(p));
      if (!n) throw new Error('No such file or directory');
      if (n.type === 'dir') throw new Error('Is a directory');
      return n.content;
    },
    rm(p){
      const a = this.abs(p);
      if (!this.nodes.has(a)) return false;
      for (const k of [...this.nodes.keys()]) if (k === a || k.startsWith(a + '/')) this.nodes.delete(k);
      return true;
    },
    list(p){
      const a = this.abs(p);
      if (!this.isDir(a)) return null;
      const out = [];
      const seen = new Set();
      for (const [k, v] of this.nodes){
        if (k === a || !k.startsWith(a === '/' ? '/' : a + '/')) continue;
        const rest = k.slice(a === '/' ? 1 : a.length + 1);
        if (!rest || rest.includes('/')) continue;
        if (seen.has(rest)) continue;
        seen.add(rest);
        out.push({ name: rest, type: v.type, path: k, content: v.content, mtime: v.mtime });
      }
      out.sort((x, y) => (x.type === y.type ? x.name.localeCompare(y.name) : x.type === 'dir' ? -1 : 1));
      return out;
    },
  };

  /* ═══════════════ 窗口管理器 ═══════════════ */
  function createWindow(opts){
    opts = opts || {};
    if (opts.id){
      const ex = [...wins.values()].find(w => w.id === opts.id);
      if (ex){ if (ex.minimized) toggleMin(ex); focusWin(ex); return ex; }
    }
    const wid = 'w' + (++winSeq);
    const win = el('div', 's-win focused');
    const dw = deskEl();
    const maxW = Math.max(360, dw.clientWidth - 24);
    const maxH = Math.max(240, dw.clientHeight - 24);
    const W = Math.min(opts.w || 720, maxW);
    const H = Math.min(opts.h || 520, maxH);
    win.style.width = W + 'px';
    win.style.height = H + 'px';
    win.style.left = Math.max(6, (dw.clientWidth - W) / 2 + (wins.size % 5) * 24 - 40) + 'px';
    win.style.top = Math.max(6, (dw.clientHeight - H) / 2 + (wins.size % 5) * 22 - 36) + 'px';

    const head = el('div', 's-win-head');
    // Ambiance 主题：窗口按钮在左侧，顺序为 关闭 / 最小化 / 最大化
    const btnBox = el('div', 'win-btns');
    const bX = el('button', 'win-btn close', '✕');
    const bMin = el('button', 'win-btn', '—');
    const bMax = el('button', 'win-btn', '▢');
    bX.title = '关闭'; bMin.title = '最小化'; bMax.title = '最大化';
    btnBox.appendChild(bX); btnBox.appendChild(bMin); btnBox.appendChild(bMax);
    head.appendChild(btnBox);
    head.insertAdjacentHTML('beforeend',
      '<span class="win-ico">' + (ICONS[opts.ico] || ICONS.app) + '</span>' +
      '<span class="win-title">' + esc(opts.title || '') + '</span>');
    const body = el('div', 's-win-body');
    win.appendChild(head); win.appendChild(body);
    dw.appendChild(win);

    const rec = {
      id: opts.id || wid, el: win, head, body, title: opts.title || '',
      ico: opts.ico, minimized: false, maximized: false, onClose: opts.onClose,
    };
    wins.set(wid, rec);

    const taskBtn = el('button', 's-taskbtn active');
    taskBtn.innerHTML = (ICONS[opts.ico] || ICONS.app).replace('<svg', '<svg class="tsk-svg"') +
      '<span>' + esc(opts.title || '') + '</span>';
    taskBtn.onclick = () => {
      if (rec.minimized){ toggleMin(rec); focusWin(rec); }
      else if (win.classList.contains('focused')) toggleMin(rec);
      else focusWin(rec);
    };
    document.getElementById('sTaskWins').appendChild(taskBtn);
    rec.taskBtn = taskBtn;

    win.addEventListener('mousedown', () => focusWin(rec));
    bX.onclick = e => { e.stopPropagation(); closeWin(rec); };
    bMin.onclick = e => { e.stopPropagation(); toggleMin(rec); };
    bMax.onclick = e => { e.stopPropagation(); toggleMax(rec); };
    head.addEventListener('dblclick', e => { if (!e.target.closest('.win-btn')) toggleMax(rec); });
    dragify(head, win);
    focusWin(rec);
    return rec;
  }

  function toggleMax(rec){
    const dw = deskEl();
    if (!rec.maximized){
      rec._prev = { left: rec.el.style.left, top: rec.el.style.top, w: rec.el.style.width, h: rec.el.style.height };
      rec.el.style.left = '0px'; rec.el.style.top = '0px';
      rec.el.style.width = dw.clientWidth + 'px';
      rec.el.style.height = dw.clientHeight + 'px';
      rec.el.classList.add('maxed');
    } else {
      const p = rec._prev || {};
      rec.el.style.left = p.left || '20px'; rec.el.style.top = p.top || '20px';
      rec.el.style.width = p.w || '720px'; rec.el.style.height = p.h || '520px';
      rec.el.classList.remove('maxed');
    }
    rec.maximized = !rec.maximized;
  }

  function focusWin(rec){
    wins.forEach(w => { w.el.classList.remove('focused'); if (w.taskBtn) w.taskBtn.classList.remove('active'); });
    rec.el.classList.add('focused');
    if (rec.taskBtn) rec.taskBtn.classList.add('active');
    if (rec.minimized && rec.el.style.display === 'none'){ rec.minimized = false; rec.el.style.display = 'flex'; }
    zTop(rec);
    closePop();
  }
  let zBase = 100;
  function zTop(rec){
    // 让聚焦窗口略高于其它，但不影响任务层
    rec.el.style.zIndex = String(500 + (++zBase % 100));
  }

  function closeWin(rec){
    if (!rec) return;
    if (rec.onClose){ try { rec.onClose(); } catch (e) {} }
    rec.el.remove();
    if (rec.taskBtn) rec.taskBtn.remove();
    for (const [k, w] of wins){ if (w === rec){ wins.delete(k); break; } }
  }
  function toggleMin(rec){
    rec.minimized = !rec.minimized;
    rec.el.style.display = rec.minimized ? 'none' : 'flex';
    if (rec.taskBtn) rec.taskBtn.classList.toggle('min', rec.minimized);
    if (!rec.minimized) focusWin(rec);
  }
  function dragify(head, win){
    let sx, sy, ox, oy, on = false;
    head.addEventListener('mousedown', e => {
      if (e.target.closest('.win-btn')) return;
      const rec = [...wins.values()].find(w => w.el === win);
      if (rec && rec.maximized) return;
      on = true; sx = e.clientX; sy = e.clientY;
      ox = win.offsetLeft; oy = win.offsetTop;
      e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
      if (!on) return;
      const dw = deskEl();
      const nx = ox + e.clientX - sx;
      const ny = oy + e.clientY - sy;
      win.style.left = Math.max(-win.offsetWidth + 90, Math.min(dw.clientWidth - 90, nx)) + 'px';
      win.style.top = Math.max(0, Math.min(dw.clientHeight - 34, ny)) + 'px';
    });
    window.addEventListener('mouseup', () => { on = false; });
  }
  function closeAllWins(){
    for (const [, w] of [...wins]) closeWin(w);
    const t = document.getElementById('sTaskWins');
    if (t) t.innerHTML = '';
  }
  function showDesktop(){
    const visible = [...wins.values()].filter(w => !w.minimized);
    if (visible.length){ visible.forEach(w => toggleMin(w)); }
    else wins.forEach(w => { if (w.minimized) toggleMin(w); });
  }

  /* ═══════════════ 图标区 ═══════════════ */
  function renderIcons(list){
    const desk = deskEl();
    desk.innerHTML = '';
    list.forEach((it, i) => desk.appendChild(makeIcon(it, i)));
  }
  function makeIcon(it, idx){
    const d = el('div', 's-icon');
    d.dataset.key = String(it.key == null ? idx : it.key);
    d.dataset.kind = it.kind || 'file';
    d.innerHTML = ico(it.kind || 'text') + '<span class="lbl">' + esc(it.label) + '</span>';
    d.title = it.tip || it.label;
    d.addEventListener('click', e => {
      e.stopPropagation();
      selectIcon(d);
    });
    d.addEventListener('dblclick', () => { if (it.onOpen) it.onOpen(); });
    d.addEventListener('contextmenu', e => {
      e.preventDefault(); e.stopPropagation();
      selectIcon(d);
      showCtx(e.clientX, e.clientY, it.menu ? it.menu() : []);
    });
    return d;
  }
  function selectIcon(node){
    document.querySelectorAll('.s-icon.selected').forEach(x => x.classList.remove('selected'));
    if (node) node.classList.add('selected');
  }

  /* ═══════════════ 弹出菜单 ═══════════════ */
  function popHost(){
    if (!popEl) popEl = document.getElementById('sPop');
    return popEl;
  }
  function closePop(){
    const p = popHost();
    if (p){ p.classList.add('hidden'); p.innerHTML = ''; }
    const c = document.getElementById('sCtx');
    if (c){ c.classList.add('hidden'); c.innerHTML = ''; }
  }
  /* 菜单结构：[{label, ico, run, sep, sub:[...] , dim, check}] */
  function renderMenu(items, onPick){
    return items.map(it => {
      if (it.sep) return '<div class="gp-sep"></div>';
      if (it.head) return '<div class="gp-menuhead">' + esc(it.head) + '</div>';
      const check = it.check ? '<span class="gp-chk">✓</span>' : '';
      return '<button class="gp-item' + (it.dim ? ' dim' : '') + '" data-k="' + esc(it.key || it.label) + '">' +
        '<span class="gp-item-ico">' + (it.ico ? ICONS[it.ico] || '' : '') + '</span>' +
        '<span class="gp-item-lbl">' + esc(it.label) + '</span>' +
        (it.hint ? '<span class="gp-item-hint">' + esc(it.hint) + '</span>' : '') + check + '</button>';
    }).join('');
  }
  function bindMenu(host, items, onPick){
    host.querySelectorAll('.gp-item').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        const key = btn.dataset.k;
        const it = items.find(x => (x.key || x.label) === key);
        closePop();
        if (it && it.run) it.run();
      };
    });
  }
  function openMenuAt(anchor, title, items, opts){
    opts = opts || {};
    const host = popHost();
    if (!host) return;
    const r = anchor.getBoundingClientRect();
    host.className = 'gp-pop' + (opts.cls ? ' ' + opts.cls : '');
    host.innerHTML = (title ? '<div class="gp-menuhead">' + esc(title) + '</div>' : '') + renderMenu(items);
    host.style.left = Math.max(4, Math.min(window.innerWidth - 230, r.left)) + 'px';
    host.style.top = (r.bottom + 2) + 'px';
    host.classList.remove('hidden');
    bindMenu(host, items);
  }
  function showCtx(x, y, items){
    const c = document.getElementById('sCtx');
    if (!c) return;
    c.innerHTML = renderMenu(items);
    c.classList.remove('hidden');
    const w = 210, h = Math.min(320, items.length * 32 + 12);
    c.style.left = Math.min(x, window.innerWidth - w - 6) + 'px';
    c.style.top = Math.min(y, window.innerHeight - h - 6) + 'px';
    bindMenu(c, items);
  }

  /* ═══════════════ 壁纸 ═══════════════ */
  // NOI Linux 2.0 = Ubuntu 20.04（Focal Fossa），默认壁纸为深紫渐变
  const WALLS = [
    { id: 'focal', name: 'Focal Fossa（默认）' },
    { id: 'focal-dark', name: 'Focal Fossa 深色' },
    { id: 'plain', name: '素灰' },
    { id: 'noi', name: 'NOI 纪念（深蓝）' },
    { id: 'olive', name: '橄榄绿' },
  ];
  function wallpaper(){ return localStorage.getItem('csp_sim:wall') || 'focal'; }
  function setWallpaper(id){
    localStorage.setItem('csp_sim:wall', id);
    const d = deskEl();
    if (d) d.dataset.wall = id;
    document.querySelectorAll('.s-watermark').forEach(w => { w.dataset.wall = id; });
  }

  /* ═══════════════ 应用注册与启动 ═══════════════ */
  function addApp(a){ if (!apps.find(x => x.id === a.id)) apps.push(a); }
  function registerApps(list){ list.forEach(addApp); }
  function launch(id){
    const a = apps.find(x => x.id === id);
    if (!a) return null;
    if (a.disabled){ toast(a.disabled, 'err'); return null; }
    try { return a.run(); } catch (e){ toast('启动失败：' + (e.message || e), 'err'); return null; }
  }
  function appsByGroup(){
    const g = new Map();
    apps.filter(a => !a.hidden).forEach(a => {
      const k = a.group || '其它';
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(a);
    });
    return g;
  }

  /* ═══════════════ 初始化 ═══════════════ */
  function mount(){
    if (mounted) return;
    mounted = true;
    // 只在文件系统尚未初始化时重置，避免清掉 mountFs 刚建好的考试目录
    if (fs.nodes.size === 0) fs.reset();
    setWallpaper(wallpaper());

    const appBtn = document.getElementById('sAppBtn');
    const placesBtn = document.getElementById('sPlacesBtn');
    const sysBtn = document.getElementById('sSysBtn');

    appBtn.onclick = e => { e.stopPropagation(); openAppsMenu(appBtn); };
    placesBtn.onclick = e => { e.stopPropagation(); openPlacesMenu(placesBtn); };
    sysBtn.onclick = e => { e.stopPropagation(); openSysMenu(sysBtn); };

    const netIco = document.getElementById('sNetIco');
    if (netIco) netIco.innerHTML = ICONS.net;
    const volIco = document.getElementById('sVolIco');
    if (volIco) volIco.innerHTML = ICONS.vol;

    const showDesk = document.getElementById('sShowDesk');
    if (showDesk) showDesk.onclick = () => showDesktop();

    const desk = deskEl();
    desk.addEventListener('mousedown', e => {
      if (e.target === desk || e.target.classList.contains('s-icon')) { /* keep */ }
      if (e.target === desk) selectIcon(null);
    });
    desk.addEventListener('contextmenu', e => {
      if (e.target.closest('.s-icon') || e.target.closest('.s-win')) return;
      e.preventDefault();
      const p = deskEl();
      const rect = p.getBoundingClientRect();
      showCtx(e.clientX, e.clientY, [
        { label: '更换壁纸', ico: 'app', sub: true, run(){ openWallMenu(e.clientX, e.clientY); } },
        { sep: true },
        { label: '新建文件夹', ico: 'folder', run(){ promptMkdir(); } },
        { label: '在终端中打开', ico: 'term', run(){ launch('terminal'); } },
        { label: '打开考试目录', ico: 'home', run(){ launch('files'); } },
        { sep: true },
        { label: '排列图标', ico: 'settings', run(){ toast('图标已按名称排列'); } },
      ]);
    });

    document.addEventListener('mousedown', e => {
      if (!e.target.closest('.gp-pop') && !e.target.closest('.gp-ctx') &&
          !e.target.closest('#sAppBtn') && !e.target.closest('#sPlacesBtn') && !e.target.closest('#sSysBtn')){
        closePop();
      }
    });
    window.addEventListener('resize', closePop);
  }

  function openAppsMenu(anchor){
    const items = [];
    appsByGroup().forEach((list, group) => {
      items.push({ head: group });
      list.forEach(a => items.push({
        label: a.label, ico: a.ico, hint: a.desc, key: a.id,
        run(){ launch(a.id); },
      }));
    });
    const host = popHost();
    host.className = 'gp-pop gp-pop-wide';
    host.innerHTML = renderMenu(items);
    const r = anchor.getBoundingClientRect();
    host.style.left = Math.max(4, r.left) + 'px';
    host.style.top = (r.bottom + 3) + 'px';
    host.classList.remove('hidden');
    bindMenu(host, items);
  }
  function openPlacesMenu(anchor){
    const items = [
      { head: '位置' },
      { label: '主文件夹', ico: 'home', run(){ launch('files'); } },
      { label: '桌面', ico: 'folder', run(){ launch('files'); } },
      { sep: true },
      { head: '考试目录' },
    ];
    const stu = window.__stu || {};
    items.push({ label: (stu.id || 'answers') + '/', ico: 'folder', run(){ launch('files'); } });
    (window.__probs || []).forEach(p => items.push({
      label: p.id + '/', ico: 'folder', run(){ launch('files'); },
    }));
    openMenuAt(anchor, '', items);
    if (anchor) anchor.classList.remove('active');
  }
  function openSysMenu(anchor){
    const stu = window.__stu || {};
    openMenuAt(anchor, '', [
      { head: '系统' },
      { label: '首选项', ico: 'settings', run(){ if (window.__app) window.__app('sysinfo'); } },
      { label: '系统管理', ico: 'settings', run(){ if (window.__app) window.__app('sysinfo'); } },
      { sep: true },
      { label: '考试信息', ico: 'browse', run(){ if (window.__app) window.__app('sysinfo'); } },
      { label: '提交试卷', ico: 'submit', run(){ if (window.__app) window.__app('submit'); } },
      { sep: true },
      { label: '锁定屏幕', dim: true },
      { label: '注销 ' + (stu.name || 'student'), dim: true },
      { label: '关机', dim: true },
    ]);
  }
  function openWallMenu(x, y){
    const cur = wallpaper();
    showCtx(x, y, WALLS.map(w => ({
      label: w.name, check: w.id === cur, run(){ setWallpaper(w.id); toast('壁纸已更换为「' + w.name + '」'); },
    })));
  }
  function promptMkdir(){
    const name = (window.prompt('新建文件夹名称：', '新建文件夹') || '').trim();
    if (!name) return;
    try { fs.mkdir('~/Desktop/' + name); toast('已创建 ~/Desktop/' + name, 'ok'); }
    catch (e){ toast('创建失败：' + e.message, 'err'); }
  }

  return {
    mount, closePop,
    createWindow, closeWin, focusWin, toggleMin, closeAllWins, showDesktop,
    renderIcons, makeIcon, selectIcon, ico, ICONS,
    addApp, registerApps, launch, apps,
    setWallpaper, wallpaper, WALLS,
    openMenuAt, showCtx, openAppsMenu,
    fs, HOME,
    get wins(){ return wins; },
  };
})();

/* 暴露到 window：方便测试与其它脚本按名访问（const 声明不会挂到 window 上） */
window.Desktop = Desktop;
