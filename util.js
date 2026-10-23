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
