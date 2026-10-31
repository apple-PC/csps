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
  let lastLaunch = null;          // 最近一次 launch 的应用 id，供 createWindow 认领归属
  let lastLaunchAt = 0;

  /* ═══════════════ 图标（Yaru 风格：彩色圆角底板 + 简洁图形） ═══════════════ */
  const ICONS = {
    folder: '<svg viewBox="0 0 48 48"><path d="M4 13a3 3 0 0 1 3-3h11l4 4h19a3 3 0 0 1 3 3v20a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" fill="#bcbcbc"/><path d="M4 18h40v17a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" fill="#e9e9e9"/><path d="M4 18h40" stroke="#adadad" stroke-width="1.1"/></svg>',
    zip: '<svg viewBox="0 0 48 48"><rect x="8" y="4" width="32" height="40" rx="4" fill="#f0b429"/><rect x="8" y="4" width="32" height="9" rx="4" fill="#d99a12"/><rect x="21.5" y="14" width="5" height="14" fill="#8a6410"/><path d="M21.5 17h5M21.5 20.5h5M21.5 24h5" stroke="#f0b429" stroke-width="1.8"/><rect x="17" y="29" width="14" height="11" rx="2.5" fill="#8a6410"/><circle cx="24" cy="34.5" r="2" fill="#f0b429"/><rect x="23" y="34.5" width="2" height="4" fill="#f0b429"/></svg>',
    text: '<svg viewBox="0 0 48 48"><path d="M11 4h18l8 8v32a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="#fbfbfb"/><path d="M29 4l8 8h-8z" fill="#dcdcdc"/><path d="M15 20h16M15 26h16M15 32h10" stroke="#b4b4b4" stroke-width="2.2" stroke-linecap="round"/><rect x="11" y="4" width="26" height="44" rx="2" fill="none" stroke="#c8c8c8" stroke-width="1"/></svg>',
    code: '<svg viewBox="0 0 48 48"><rect x="3.5" y="3.5" width="19" height="19" rx="3" fill="#e94b3c"/><rect x="25.5" y="3.5" width="19" height="19" rx="3" fill="#f5c344"/><rect x="3.5" y="25.5" width="19" height="19" rx="3" fill="#3d8ec9"/><rect x="25.5" y="25.5" width="19" height="19" rx="3" fill="#5aa84e"/></svg>',
    term: '<svg viewBox="0 0 48 48"><rect x="3" y="6" width="42" height="36" rx="4.5" fill="#2c001e"/><path d="M11 18.5l5.5 4.5-5.5 4.5" stroke="#ffffff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M21.5 28h12" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round"/></svg>',
    firefox: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="#e8442a"/><path d="M24 4.5a19.5 19.5 0 1 1-13.8 5.7A15 15 0 0 1 24 8.5z" fill="#ff8a1f" opacity=".62"/><circle cx="24.5" cy="25" r="9.4" fill="#5d2a8a"/><path d="M25 14.8c5.9 0 10.7 4.8 10.7 10.7 0 3.3-1.5 6.3-3.9 8.2 4-1.2 7-5.1 7-10 0-7.4-6-13.2-13.4-13.1-4.4.1-8.4 2.3-10.8 5.5 2.6-2.2 6.4-2.7 10.4-1.3z" fill="#ffb347" opacity=".95"/></svg>',
    submit: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="19" fill="#2aa05a"/><path d="M24 33.5V15M17 22l7-7 7 7" stroke="#fff" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    browse: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="19" fill="#e8662c"/><circle cx="24" cy="24" r="12.5" fill="none" stroke="#ffd9c4" stroke-width="1.6"/><path d="M24 4.5c7 6 7 33 0 39M4.5 24h39" stroke="#ffd9c4" stroke-width="1.6" fill="none"/><circle cx="24" cy="24" r="6" fill="#ffd9c4" opacity=".92"/></svg>',
    judge: '<svg viewBox="0 0 48 48"><rect x="6" y="4.5" width="36" height="39" rx="4" fill="#f7f7f7" stroke="#cfcfcf" stroke-width="1"/><path d="M13 14h22M13 21h22M13 28h11" stroke="#c9c9c9" stroke-width="2.6" stroke-linecap="round"/><path d="M23 33.5l4.5 4.5 9-10" stroke="#2aa05a" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    dbg: '<svg viewBox="0 0 48 48"><rect x="3" y="6" width="42" height="36" rx="4.5" fill="#f0f0f0" stroke="#d0d0d0" stroke-width="1"/><circle cx="19" cy="20" r="6.5" fill="none" stroke="#b8862f" stroke-width="3"/><path d="M23.8 24.8L31 32.5" stroke="#b8862f" stroke-width="3" stroke-linecap="round"/><path d="M33 15h8M33 21h8M33 27h6" stroke="#b0b0b0" stroke-width="2.2" stroke-linecap="round"/></svg>',
    app: '<svg viewBox="0 0 48 48"><rect x="5" y="5" width="38" height="38" rx="6" fill="#f0f0f0" stroke="#d4d4d4" stroke-width="1"/><rect x="5" y="5" width="38" height="8" rx="6" fill="#c9c9c9"/><rect x="10" y="18" width="12" height="9" rx="2" fill="#f0b429"/><rect x="25" y="18" width="13" height="9" rx="2" fill="#7bc47f"/><rect x="10" y="30" width="28" height="8" rx="2" fill="#8ab4d8"/></svg>',
    settings: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="18" fill="#f2f2f2" stroke="#d2d2d2" stroke-width="1"/><circle cx="24" cy="24" r="7" fill="none" stroke="#8a8a8a" stroke-width="4"/><path d="M24 6.5v6M24 35.5v6M6.5 24h6M35.5 24h6M11.6 11.6l4.2 4.2M32.2 32.2l4.2 4.2M36.4 11.6l-4.2 4.2M15.8 32.2l-4.2 4.2" stroke="#8a8a8a" stroke-width="4" stroke-linecap="round"/></svg>',
    home: '<svg viewBox="0 0 48 48"><path d="M5 23.5L24 6.5l19 17" stroke="#9a9a9a" stroke-width="3.4" fill="none" stroke-linejoin="round"/><path d="M10.5 22v19.5h27V22" fill="#e3e3e3" stroke="#b9b9b9" stroke-width="1.4"/><rect x="20" y="29" width="8.5" height="12.5" rx="1" fill="#8a8a8a"/></svg>',
    net: '<svg viewBox="0 0 24 24"><path d="M12 4.2l7.2 4.2v7.2L12 19.8 4.8 15.6V8.4z" fill="none" stroke="#eaeaea" stroke-width="1.7"/><path d="M12 8.6l3.4 2v4l-3.4 2-3.4-2v-4z" fill="#eaeaea"/></svg>',
    vol: '<svg viewBox="0 0 24 24"><path d="M4.5 9.2h3.6L13 5.4v13.2l-4.9-3.8H4.5z" fill="#eaeaea"/><path d="M16 9.4a4 4 0 0 1 0 5.2M18.4 7a7.4 7.4 0 0 1 0 10" stroke="#eaeaea" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>',
    power: '<svg viewBox="0 0 24 24"><path d="M12 3.5v7.2" stroke="#eaeaea" stroke-width="2" stroke-linecap="round"/><path d="M7.6 6.3a7.4 7.4 0 1 0 8.8 0" stroke="#eaeaea" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
    /* 各应用的独立图标：GNOME 网格里每个应用都该有自己的样子 */
    cb: '<svg viewBox="0 0 48 48"><rect x="3.5" y="3.5" width="19" height="19" rx="3" fill="#e94b3c"/><rect x="25.5" y="3.5" width="19" height="19" rx="3" fill="#f5c344"/><rect x="3.5" y="25.5" width="19" height="19" rx="3" fill="#3d8ec9"/><rect x="25.5" y="25.5" width="19" height="19" rx="3" fill="#5aa84e"/></svg>',
    geany: '<svg viewBox="0 0 48 48"><rect x="4" y="7" width="40" height="34" rx="4" fill="#e8e4d8"/><rect x="4" y="7" width="40" height="8" rx="4" fill="#c4631f"/><path d="M11 22h20M11 28h26M11 34h14" stroke="#9a8f78" stroke-width="2.4" stroke-linecap="round"/><circle cx="36" cy="34" r="4" fill="#c4631f" opacity=".75"/></svg>',
    gedit: '<svg viewBox="0 0 48 48"><path d="M12 5h17l9 9v29a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" fill="#fdfdfd" stroke="#c8c8c8" stroke-width="1.2"/><path d="M29 5l9 9h-9z" fill="#e0e0e0"/><path d="M16 17h14M16 23h14M16 29h9" stroke="#b8c4cf" stroke-width="2.2" stroke-linecap="round"/><path d="M29 34l9-9 4 4-9 9-5 1z" fill="#e8b23a"/></svg>',
    vim: '<svg viewBox="0 0 48 48"><rect x="5" y="5" width="38" height="38" rx="5" fill="#17963f"/><path d="M14 16l8 16 8-16" fill="none" stroke="#eafff0" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M31 16h5v16" fill="none" stroke="#b6f0c4" stroke-width="3" stroke-linecap="round"/></svg>',
    nano: '<svg viewBox="0 0 48 48"><rect x="5" y="5" width="38" height="38" rx="5" fill="#f4f4f4" stroke="#c4c4c4" stroke-width="1.2"/><text x="24" y="33" font-family="monospace" font-size="24" font-weight="700" fill="#3b6fa8" text-anchor="middle">n</text></svg>',
    emacs: '<svg viewBox="0 0 48 48"><rect x="5" y="5" width="38" height="38" rx="5" fill="#7a4ba8"/><path d="M17 34c-3-6-2-14 3-18 4-3 9-2 11 2 1 3 0 6-3 7-2 1-4 0-4-2" fill="none" stroke="#eee6f7" stroke-width="3.4" stroke-linecap="round"/><circle cx="31" cy="30" r="3" fill="#eee6f7"/></svg>',
    lazarus: '<svg viewBox="0 0 48 48"><rect x="5" y="5" width="38" height="38" rx="5" fill="#3a6ea8"/><path d="M14 34V14h6v16h14v4z" fill="#dfeaf5"/><circle cx="33" cy="17" r="4" fill="#f0b429"/></svg>',
    /* LibreOffice Writer：白纸 + 蓝色标题条，ISO 里预装 6.4.4 */
    low: '<svg viewBox="0 0 48 48"><rect x="6" y="3" width="36" height="42" rx="3" fill="#fbfbfb" stroke="#c6c6c6" stroke-width="1.1"/><path d="M6 6a3 3 0 0 1 3-3h30a3 3 0 0 1 3 3v6.5H6z" fill="#2b5f9e"/><path d="M13 19.5h22M13 26h22M13 32.5h14" stroke="#8aa9c9" stroke-width="2.4" stroke-linecap="round"/><rect x="13" y="38" width="9" height="2.4" rx="1.2" fill="#2b5f9e"/></svg>',
    ddd: '<svg viewBox="0 0 48 48"><rect x="3" y="6" width="42" height="36" rx="4.5" fill="#f7f0e4" stroke="#d8c9b0" stroke-width="1"/><rect x="8" y="12" width="14" height="10" rx="2" fill="#a8c9e8"/><rect x="8" y="26" width="22" height="8" rx="2" fill="#cfe0f0"/><path d="M28 14l4 4 7-8" stroke="#2aa05a" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    grid: '<svg viewBox="0 0 24 24"><g fill="#e8e8e8"><circle cx="6" cy="6" r="1.8"/><circle cx="12" cy="6" r="1.8"/><circle cx="18" cy="6" r="1.8"/><circle cx="6" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18" cy="12" r="1.8"/><circle cx="6" cy="18" r="1.8"/><circle cx="12" cy="18" r="1.8"/><circle cx="18" cy="18" r="1.8"/></g></svg>',
    /* 回收站：灰白桶身 + 绿色回收标志，与 Nautilus 的 trash 图标一致 */
    trash: '<svg viewBox="0 0 48 48"><path d="M12.6 14h22.8l-2.3 26.2a3.2 3.2 0 0 1-3.2 2.9H18.1a3.2 3.2 0 0 1-3.2-2.9z" fill="#dedede" stroke="#b6b6b6" stroke-width="1.2"/><rect x="9.5" y="9.2" width="29" height="5.2" rx="2.6" fill="#c9c9c9" stroke="#b0b0b0" stroke-width=".9"/><path d="M19.4 9.1a4.6 4.6 0 0 1 9.2 0" fill="none" stroke="#b0b0b0" stroke-width="2"/><path d="M21 21.8l3.6 3.1-1.5 4.3h-2.6l-1.5-4.3z" fill="#5aa84e"/><path d="M27 21.8l-3.6 3.1 1.5 4.3h2.6l1.5-4.3z" fill="#5aa84e"/><path d="M24 21.8v7.4" stroke="#5aa84e" stroke-width="1.6"/></svg>',
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

    // Yaru 主题：按钮在标题栏右上角，顺序为 最小化 / 最大化 / 关闭（关闭为红圆）
    const head = el('div', 's-win-head');
    head.insertAdjacentHTML('beforeend',
      '<span class="win-ico">' + (ICONS[opts.ico] || ICONS.app) + '</span>');
    const btnBox = el('div', 'win-btns');
    const bMin = el('button', 'win-btn', '\u2013');
    const bMax = el('button', 'win-btn', '\u25a1');
    const bX = el('button', 'win-btn close', '\u2715');
    bMin.title = '最小化'; bMax.title = '最大化'; bX.title = '关闭';
    btnBox.appendChild(bMin); btnBox.appendChild(bMax); btnBox.appendChild(bX);
    head.appendChild(btnBox);
    head.insertAdjacentHTML('beforeend',
      '<span class="win-title">' + esc(opts.title || '') + '</span>');
    const body = el('div', 's-win-body');
    win.appendChild(head); win.appendChild(body);
    dw.appendChild(win);

    const rec = {
      id: opts.id || wid, el: win, head, body, title: opts.title || '',
      ico: opts.ico, minimized: false, maximized: false, onClose: opts.onClose,
    };
    wins.set(wid, rec);

    rec.appId = opts.appId || ((Date.now() - lastLaunchAt < 900) ? lastLaunch : null);

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
    wins.forEach(w => w.el.classList.remove('focused'));
    rec.el.classList.add('focused');
    if (rec.minimized && rec.el.style.display === 'none'){ rec.minimized = false; rec.el.style.display = 'flex'; }
    zTop(rec);
    closeAppGrid();
    closePop();
    setActTitle(rec.title, rec.ico);
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
    for (const [k, w] of wins){ if (w === rec){ wins.delete(k); break; } }
    syncDock();
    if (![...wins.values()].some(w => !w.minimized)) setActTitle(null);
  }
  function toggleMin(rec){
    rec.minimized = !rec.minimized;
    rec.el.style.display = rec.minimized ? 'none' : 'flex';
    if (!rec.minimized) focusWin(rec);
    else if (![...wins.values()].some(w => !w.minimized && w.el.classList.contains('focused'))) setActTitle(null);
    syncDock();
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
    syncDock();
    setActTitle(null);
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
  /* 直接取自 NOI Linux 2.0 ISO 的 /usr/share/backgrounds/noi_wallpaper_00..08.png
     （/etc/skel/.config/dconf/user 记录默认值就是 noi_wallpaper_00） */
  const WALLS = [
    { id: 'noi-00', name: 'NOI Linux 2.0（默认）', src: 'assets/wall/noi-00.png' },
    { id: 'noi-01', name: 'NOI Linux 光影',        src: 'assets/wall/noi-01.jpg' },
    { id: 'noi-02', name: 'NOI Linux 线框',        src: 'assets/wall/noi-02.jpg' },
    { id: 'noi-03', name: '企鹅 · 努力成就梦想',   src: 'assets/wall/noi-03.jpg' },
    { id: 'noi-04', name: '企鹅 · 浅黄',           src: 'assets/wall/noi-04.jpg' },
    { id: 'noi-05', name: 'NOI Linux 浅蓝',        src: 'assets/wall/noi-05.jpg' },
    { id: 'noi-06', name: 'NOI 数字城市',          src: 'assets/wall/noi-06.jpg' },
    { id: 'noi-07', name: 'NOI 历年徽标',          src: 'assets/wall/noi-07.jpg' },
    { id: 'noi-08', name: 'NOI 立体方块',          src: 'assets/wall/noi-08.jpg' },
  ];
  function wallById(id){ return WALLS.find(w => w.id === id) || WALLS[0]; }
  function wallpaper(){
    const v = localStorage.getItem('csp_sim:wall');
    return WALLS.some(w => w.id === v) ? v : 'noi-00';
  }
  function setWallpaper(id){
    localStorage.setItem('csp_sim:wall', id);
    const root = app();
    if (root) root.style.setProperty('--wall', 'url("' + wallById(id).src + '")');
  }

  /* ═══════════════ 应用注册与启动 ═══════════════ */
  function addApp(a){ if (!apps.find(x => x.id === a.id)) apps.push(a); }
  function registerApps(list){
    list.forEach(addApp);
    // 应用是分批注册进来的，注册完要刷新 Dock 与已打开的应用网格
    if (mounted){ syncDock(); if (gridOpen()) renderGrid(''); }
  }
  function launch(id){
    const a = apps.find(x => x.id === id);
    if (!a) return null;
    if (a.disabled){ toast(a.disabled, 'err'); return null; }
    lastLaunch = id; lastLaunchAt = Date.now();
    let r = null;
    try { r = a.run(); } catch (e){ toast('启动失败：' + (e.message || e), 'err'); }
    syncDock();
    return r;
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

  /* ═══════════════ Dock / 应用网格 ═══════════════ */
  // 顶栏左侧：有聚焦窗口时显示应用名（Ubuntu 的全局应用菜单位），否则显示「活动」
  function setActTitle(title, icoName){
    const lbl = document.getElementById('sActLbl');
    const ic = document.getElementById('sActIco');
    if (!lbl) return;
    if (title){
      lbl.textContent = title;
      if (ic) ic.innerHTML = ICONS[icoName] || ICONS.app;
    } else {
      lbl.textContent = '活动';
      if (ic) ic.innerHTML = '';
    }
  }

  // Dock：固定启动器 + 运行中的应用，运行中右上角有橙色小圆点
  function syncDock(){
    const host = document.getElementById('sDockApps');
    if (!host) return;
    const pinned = apps.filter(a => a.pin && !a.hidden);
    const list = pinned.slice();
    wins.forEach(w => {
      if (!w.appId || list.some(a => a.id === w.appId)) return;
      const a = apps.find(x => x.id === w.appId);
      if (a) list.push(a);
    });
    host.innerHTML = '';
    list.forEach(a => {
      const b = el('button', 'ub-dock-item');
      b.title = a.label;
      b.dataset.app = a.id;
      b.innerHTML = ICONS[a.ico] || ICONS.app;
      const opened = [...wins.values()].filter(w => w.appId === a.id);
      if (opened.length) b.classList.add('running');
      b.onclick = e => {
        e.stopPropagation();
        closeAppGrid(); closePop();
        if (!opened.length){ launch(a.id); return; }
        const top = opened[opened.length - 1];
        if (top.minimized){ focusWin(top); }
        else if (top.el.classList.contains('focused')) toggleMin(top);
        else focusWin(top);
      };
      host.appendChild(b);
    });
  }

  function openAppGrid(){
    const g = document.getElementById('sGrid');
    if (!g) return;
    closePop();
    renderGrid('');
    g.classList.remove('hidden');
    setActTitle(null);
    const inp = document.getElementById('sGridInput');
    if (inp){ inp.value = ''; setTimeout(() => { try { inp.focus(); } catch (e){} }, 0); }
  }
  function closeAppGrid(){
    const g = document.getElementById('sGrid');
    if (g) g.classList.add('hidden');
  }
  function gridOpen(){ const g = document.getElementById('sGrid'); return g && !g.classList.contains('hidden'); }

  // GNOME 应用网格：不分组，按名称排序
  function renderGrid(q){
    const body = document.getElementById('sGridBody');
    if (!body) return;
    q = String(q || '').trim().toLowerCase();
    let list = apps.filter(a => !a.hidden);
    if (q){
      list = list.filter(a =>
        a.label.toLowerCase().includes(q) ||
        (a.desc || '').toLowerCase().includes(q) ||
        (a.id || '').toLowerCase().includes(q));
    }
    list.sort((a, b) => String(a.label).localeCompare(String(b.label), 'zh-Hans-CN'));
    if (!list.length){ body.innerHTML = '<div class="ub-grid-empty">没有匹配的应用</div>'; return; }
    body.innerHTML = '';
    list.forEach(a => {
      const b = el('button', 'ub-grid-app');
      b.title = a.desc ? (a.label + ' — ' + a.desc) : a.label;
      b.innerHTML = (ICONS[a.ico] || ICONS.app) + '<span>' + esc(a.label) + '</span>';
      if (a.disabled) b.disabled = true;
      b.onclick = () => { closeAppGrid(); launch(a.id); };
      body.appendChild(b);
    });
  }

  /* ═══════════════ 初始化 ═══════════════ */
  function mount(){
    if (mounted) return;
    mounted = true;
    // 只在文件系统尚未初始化时重置，避免清掉 mountFs 刚建好的考试目录
    if (fs.nodes.size === 0) fs.reset();
    setWallpaper(wallpaper());

    const actBtn = document.getElementById('sActBtn');
    if (actBtn) actBtn.onclick = e => { e.stopPropagation(); gridOpen() ? closeAppGrid() : openAppGrid(); };
    const sysBtn = document.getElementById('sSysBtn');
    if (sysBtn){
      sysBtn.innerHTML = ICONS.power;
      sysBtn.onclick = e => { e.stopPropagation(); openSysMenu(sysBtn); };
    }
    const showApps = document.getElementById('sShowApps');
    if (showApps) showApps.onclick = e => { e.stopPropagation(); gridOpen() ? closeAppGrid() : openAppGrid(); };

    const netIco = document.getElementById('sNetIco');
    if (netIco) netIco.innerHTML = ICONS.net;
    const volIco = document.getElementById('sVolIco');
    if (volIco) volIco.innerHTML = ICONS.vol;

    const gi = document.getElementById('sGridInput');
    if (gi) gi.addEventListener('input', () => renderGrid(gi.value));

    const desk = deskEl();
    if (desk){
      desk.addEventListener('mousedown', e => {
        if (e.target === desk) selectIcon(null);
      });
      desk.addEventListener('contextmenu', e => {
        if (e.target.closest('.s-icon') || e.target.closest('.s-win')) return;
        e.preventDefault();
        showCtx(e.clientX, e.clientY, [
          { label: '新建文件夹', ico: 'folder', run(){ promptMkdir(); } },
          { sep: true },
          { label: '更改背景…', ico: 'settings', run(){ openWallMenu(e.clientX, e.clientY); } },
          { label: '显示设置', ico: 'settings', run(){ if (window.__app) window.__app('sysinfo'); } },
          { label: '设置', ico: 'settings', run(){ if (window.__app) window.__app('sysinfo'); } },
        ]);
      });
    }

    document.addEventListener('mousedown', e => {
      if (e.target.closest('.gp-pop') || e.target.closest('.gp-ctx') || e.target.closest('.ub-grid')) return;
      if (e.target.closest('#sActBtn') || e.target.closest('#sSysBtn') || e.target.closest('#sShowApps')) return;
      closePop();
      if (gridOpen() && !e.target.closest('#sDock')) closeAppGrid();
    });
    window.addEventListener('resize', closePop);

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape'){ closePop(); closeAppGrid(); }
      // Super（Meta）单独按下 = 打开应用网格，与 GNOME 一致
      if (e.key === 'Meta' && !e.repeat){ e.preventDefault(); gridOpen() ? closeAppGrid() : openAppGrid(); }
    });

    syncDock();
  }

  function openAppsMenu(){ openAppGrid(); }
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
      { label: '程序回收系统', ico: 'browse', run(){ if (window.__app) window.__app('recovery'); } },
      { label: '交卷并结束考试', ico: 'submit', run(){ if (window.__app) window.__app('finish'); } },
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
    addApp, registerApps, launch, apps, syncDock,
    setWallpaper, wallpaper, WALLS, wallById,
    openMenuAt, showCtx, openAppsMenu, openAppGrid, closeAppGrid, renderGrid,
    openPlacesMenu, openSysMenu, openWallMenu, setActTitle,
    fs, HOME,
    get wins(){ return wins; },
  };
})();

/* 暴露到 window：方便测试与其它脚本按名访问（const 声明不会挂到 window 上） */
window.Desktop = Desktop;
