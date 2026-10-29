/* 通用小工具 */
'use strict';

function $(sel, root){ return (root || document).querySelector(sel); }
function $$(sel, root){ return Array.from((root || document).querySelectorAll(sel)); }

function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function el(tag, cls, html){
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function pad2(n){ return String(n).padStart(2, '0'); }
function fmtClock(sec){
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return pad2(h) + ':' + pad2(m) + ':' + pad2(s);
}
function fmtTime(ts){
  const d = new Date(ts);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
    ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}
function fmtSize(bytes){
  if (bytes < 1024) return bytes + ' B';
  return (bytes / 1024).toFixed(1) + ' KB';
}
function download(name, text, mime){
  const blob = new Blob([text], { type: mime || 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 300);
}
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

/* 简易模态框：返回 close()；onClose 回调 */
function modal(title, bodyNode, opts){
  opts = opts || {};
  const wrap = el('div', 'modal-wrap');
  const box = el('div', 'modal-box' + (opts.wide ? ' modal-wide' : ''));
  const head = el('div', 'modal-head');
  head.innerHTML = '<span>' + esc(title) + '</span>';
  const x = el('button', 'modal-x', '✕');
  head.appendChild(x);
  const body = el('div', 'modal-body');
  if (typeof bodyNode === 'string') body.innerHTML = bodyNode;
  else body.appendChild(bodyNode);
  box.appendChild(head); box.appendChild(body);
  wrap.appendChild(box);
  document.body.appendChild(wrap);
  let closed = false;
  function close(){ if (closed) return; closed = true; wrap.remove(); if (opts.onClose) opts.onClose(); }
  x.onclick = close;
  wrap.addEventListener('mousedown', e => { if (e.target === wrap && !opts.sticky) close(); });
  return { close, box, body };
}
function toast(msg, kind){
  const t = el('div', 'toast' + (kind ? ' toast-' + kind : ''), esc(msg));
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2400);
}

/* 全局加载动画
 * showLoading(text, opts) 显示遮罩与状态文字
 *   opts.detail  : 副标题原文（优先于 file），如 '正在下载：problem-tests.js · 320 / 856 KB'
 *   opts.file    : 当前正在加载的文件名（如 'problem-tests.js'）
 *   opts.percent : 直接给 0~100 的百分比（有真实进度时用这个）
 *   opts.current / opts.total : 按步骤数换算百分比
 *   opts.indeterminate : true 时显示无限进度（不知道总量）
 * hideLoading() 隐藏
 */
function showLoading(text, opts){
  opts = opts || {};
  const box = document.getElementById('globalLoading');
  const txt = document.getElementById('globalLoadingText');
  const fileEl = document.getElementById('globalLoadingFile');
  const bar = document.getElementById('globalLoadingBar');
  const pctEl = document.getElementById('globalLoadingPct');
  if (txt) txt.textContent = text || '加载中…';
  if (fileEl){
    if (opts.detail) fileEl.textContent = opts.detail;
    else if (opts.file) fileEl.textContent = '正在加载：' + opts.file;
    else if (opts.label) fileEl.textContent = opts.label;
    else fileEl.textContent = '';
  }
  let pct = null;
  if (typeof opts.percent === 'number') pct = opts.percent;
  else if (opts.total) pct = (opts.current || 0) / opts.total * 100;
  if (bar){
    const wrap = bar.parentElement;
    if (opts.indeterminate || pct == null){
      wrap.classList.add('g-bar-indet');
      bar.style.width = '40%';
      if (pctEl) pctEl.textContent = '';
    } else {
      wrap.classList.remove('g-bar-indet');
      const p2 = Math.max(0, Math.min(100, Math.round(pct)));
      bar.style.width = p2 + '%';
      if (pctEl) pctEl.textContent = p2 + '%';
    }
  }
  if (box) box.classList.remove('hidden');
}
function hideLoading(){
  const box = document.getElementById('globalLoading');
  if (box) box.classList.add('hidden');
}
/* 让浏览器有机会重绘一帧（长同步任务前调用，避免动画卡住） */
function nextFrame(){
  return new Promise(r => requestAnimationFrame(() => setTimeout(r, 16)));
}
