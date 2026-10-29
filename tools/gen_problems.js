#!/usr/bin/env node
/* 生成内置题库 problems.js
 * 每道题：题面 HTML（样例自动嵌入）+ 测试点数据（答案由参考解法算出）
 * 运行：node tools/gen_problems.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

/* ---------- 确定性随机 ---------- */
let _seed = 20261022;
function rnd(){ _seed = (_seed * 1103515245 + 12345) % 2147483648; return _seed / 2147483648; }
function ri(a, b){ return a + Math.floor(rnd() * (b - a + 1)); }
function shuffle(arr){ for (let i = arr.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

function T(input, expected, sample){ return { input: String(input).trim() + '\n', expected: String(expected).trim() + '\n', sample: !!sample }; }

/* ---------- 参考解法 ---------- */
function refQueue(inp){
  const t = inp.trim().split(/\s+/).map(Number);
  const n = t[0], h = t.slice(1, 1 + n);
  const out = [];
  for (let i = 0; i < n; i++){
    let c = 0;
    for (let j = i + 1; j < n; j++) if (h[j] > h[i]) c++;
    out.push(c);
  }
  return out.join('\n');
}
function refDecode(inp){
  const s = inp.trim();
  const MOD = 1e9 + 7;
  let a = 1, b = 1; // dp[0], dp[1]
  for (let i = 1; i < s.length; i++){
    let c = a;
    const two = Number(s.slice(i - 1, i + 1));
    if (two >= 10 && two <= 26) c = (c + b) % MOD;
    b = a; a = c;
  }
  return a % MOD;
}
function refGrid(inp){
  const lines = inp.trim().split('\n');
  const [n, m] = lines[0].trim().split(/\s+/).map(Number);
  const g = [];
  for (let i = 0; i < n; i++) g.push(lines[1 + i].trim());
  const MOD = 1e9 + 7;
  const dp = Array.from({ length: n }, () => new Array(m).fill(0));
  dp[0][0] = g[0][0] === '.' ? 1 : 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++){
    if (g[i][j] === '#'){ dp[i][j] = 0; continue; }
    if (i > 0) dp[i][j] = (dp[i][j] + dp[i - 1][j]) % MOD;
    if (j > 0) dp[i][j] = (dp[i][j] + dp[i][j - 1]) % MOD;
  }
  return dp[n - 1][m - 1] % MOD;
}
function refCover(inp){
  const t = inp.trim().split(/\s+/).map(Number);
  const n = t[0], Tm = t[1];
  const iv = [];
  for (let i = 0; i < n; i++) iv.push([t[2 + i * 2], t[3 + i * 2]]);
  iv.sort((a, b) => a[0] - b[0]);
  let reach = 0, cnt = 0, i = 0;
  while (reach < Tm){
    let best = reach;
    while (i < n && iv[i][0] <= reach + 1){ best = Math.max(best, iv[i][1]); i++; }
    if (best === reach) return -1;
    reach = best; cnt++;
  }
  return cnt;
}
function refBrackets(inp){
  const s = inp.trim();
  const st = [-1];
  let best = 0;
  for (let i = 0; i < s.length; i++){
    if (s[i] === '(') st.push(i);
    else {
      st.pop();
      if (!st.length) st.push(i);
      else best = Math.max(best, i - st[st.length - 1]);
    }
  }
  return best;
}
function refMaxsub(inp){
  const t = inp.trim().split(/\s+/).map(Number);
  const n = t[0], a = t.slice(1, 1 + n);
  let cur = a[0], best = a[0];
  for (let i = 1; i < n; i++){
    cur = Math.max(a[i], cur + a[i]);
    best = Math.max(best, cur);
  }
  return best;
}
function refTree(inp){
  const t = inp.trim().split(/\s+/).map(Number);
  const n = t[0];
  const adj = Array.from({ length: n + 1 }, () => []);
  for (let i = 0; i < n - 1; i++){
    const u = t[1 + i * 2], v = t[2 + i * 2];
    adj[u].push(v); adj[v].push(u);
  }
  function bfs(s){
    const dist = new Array(n + 1).fill(-1);
    const q = [s]; dist[s] = 0;
    for (let h = 0; h < q.length; h++){
      const u = q[h];
      for (const v of adj[u]) if (dist[v] < 0){ dist[v] = dist[u] + 1; q.push(v); }
    }
    let far = s, d = 0;
    for (let i = 1; i <= n; i++) if (dist[i] > d){ d = dist[i]; far = i; }
    return [far, d];
  }
  const [u] = bfs(1);
  const [, d] = bfs(u);
  return d;
}
function refDigit(inp){
  const n = Number(inp.trim());
  let c = 0;
  for (let f = 1; f <= n; f *= 10){
    const hi = Math.floor(n / (f * 10));
    const cur = Math.floor(n / f) % 10;
    const lo = n % f;
    c += hi * f + (cur > 1 ? f : cur === 1 ? lo + 1 : 0);
  }
  return c;
}
function refInverse(inp){
  const t = inp.trim().split(/\s+/).map(Number);
  const n = t[0], a = t.slice(1, 1 + n);
  let cnt = 0;
  const buf = new Array(n);
  (function msort(l, r){
    if (r - l <= 1) return;
    const m = (l + r) >> 1;
    msort(l, m); msort(m, r);
    let i = l, j = m, k = l;
    while (i < m && j < r){
      if (a[i] <= a[j]) buf[k++] = a[i++];
      else { cnt += m - i; buf[k++] = a[j++]; }
    }
    while (i < m) buf[k++] = a[i++];
    while (j < r) buf[k++] = a[j++];
    for (let x = l; x < r; x++) a[x] = buf[x];
  })(0, n);
  return cnt;
}
function refLis(inp){
  const t = inp.trim().split(/\s+/).map(Number);
  const n = t[0], a = t.slice(1, 1 + n);
  const tails = [];
  for (const x of a){
    let lo = 0, hi = tails.length;
    while (lo < hi){ const m = (lo + hi) >> 1; if (tails[m] < x) lo = m + 1; else hi = m; }
    if (lo === tails.length) tails.push(x); else tails[lo] = x;
  }
  return tails.length;
}
function refPack(inp){
  const t = inp.trim().split(/\s+/).map(Number);
  const n = t[0], W = t[1];
  const dp = new Array(W + 1).fill(0);
  for (let i = 0; i < n; i++){
    const w = t[2 + i * 2], v = t[3 + i * 2];
    for (let j = W; j >= w; j--) if (dp[j - w] + v > dp[j]) dp[j] = dp[j - w] + v;
  }
  return dp[W];
}
function refDij(inp){
  const t = inp.trim().split(/\s+/).map(Number);
  const n = t[0], m = t[1];
  const g = Array.from({ length: n + 1 }, () => new Float64Array(n + 1)); // 0 = 无边
  for (let i = 0; i < m; i++){
    const u = t[2 + i * 3], v = t[3 + i * 3], w = t[4 + i * 3];
    if (!g[u][v] || w < g[u][v]){ g[u][v] = w; g[v][u] = w; }
  }
  const dist = new Array(n + 1).fill(Infinity);
  const done = new Array(n + 1).fill(false);
  dist[1] = 0;
  for (let k = 1; k <= n; k++){
    let u = -1;
    for (let i = 1; i <= n; i++) if (!done[i] && (u === -1 || dist[i] < dist[u])) u = i;
    if (u === -1 || dist[u] === Infinity) break;
    done[u] = true;
    for (let v = 1; v <= n; v++) if (g[u][v] && dist[u] + g[u][v] < dist[v]) dist[v] = dist[u] + g[u][v];
  }
  return dist[n] === Infinity ? -1 : dist[n];
}

/* ---------- 暴力对拍（小数据校验参考解法） ---------- */
function refCoverBrute(inp){
  const t = inp.trim().split(/\s+/).map(Number);
  const n = t[0], Tm = t[1];
  const iv = [];
  for (let i = 0; i < n; i++) iv.push([t[2 + i * 2], t[3 + i * 2]]);
  let best = Infinity;
  const total = 1 << n;
  if (n > 12) return null;
  for (let m = 1; m < total; m++){
    let lo = Infinity, hi = -Infinity, c = 0;
    for (let i = 0; i < n; i++) if (m >> i & 1){ lo = Math.min(lo, iv[i][0]); hi = Math.max(hi, iv[i][1]); c++; }
    if (lo <= 1 && hi >= Tm) best = Math.min(best, c);
  }
  return best === Infinity ? -1 : best;
}

/* ---------- 测试点构造 ---------- */
function genQueueTests(){
  const tests = [
    T('5\n180 175 190 175 180', refQueue('5\n180 175 190 175 180'), true),
    T('4\n1 2 3 4', refQueue('4\n1 2 3 4'), true),
  ];
  for (let k = 0; k < 4; k++){
    const n = k === 3 ? 500 : ri(150, 400);
    const h = Array.from({ length: n }, () => ri(1, 1e9)).join(' ');
    const inp = n + '\n' + h;
    tests.push(T(inp, refQueue(inp)));
  }
  return tests;
}
function genDecodeTests(){
  const tests = [
    T('111', refDecode('111'), true),
    T('1234', refDecode('1234'), true),
  ];
  const chars = '123456789';
  for (let k = 0; k < 4; k++){
    const len = k === 3 ? 2000 : ri(300, 900);
    let s = '';
    for (let i = 0; i < len; i++) s += chars[ri(0, 8)];
    tests.push(T(s, refDecode(s)));
  }
  return tests;
}
function genGridTests(){
  const mk = (n, m, blocked) => {
    const g = Array.from({ length: n }, () => new Array(m).fill('.'));
    for (const [x, y] of blocked) g[x][y] = '#';
    return n + ' ' + m + '\n' + g.map(r => r.join('')).join('\n');
  };
  const tests = [
    T('2 2\n..\n..', refGrid('2 2\n..\n..'), true),
    T('3 3\n...\n.#.\n...', refGrid('3 3\n...\n.#.\n...'), true),
  ];
  for (let k = 0; k < 4; k++){
    const n = k === 3 ? 200 : ri(60, 150);
    const m = k === 3 ? 200 : ri(60, 150);
    // 先铺一条保证通路，再撒障碍
    let x = 0, y = 0;
    const path = new Set(['0,0']);
    while (x < n - 1 || y < m - 1){
      if (x === n - 1) y++;
      else if (y === m - 1) x++;
      else if (rnd() < 0.5) x++; else y++;
      path.add(x + ',' + y);
    }
    const blocked = [];
    const total = n * m;
    const nb = Math.floor(total * 0.13);
    for (let i = 0; i < nb; i++){
      const bx = ri(0, n - 1), by = ri(0, m - 1);
      if (!path.has(bx + ',' + by)) blocked.push([bx, by]);
    }
    const inp = mk(n, m, blocked);
    tests.push(T(inp, refGrid(inp)));
  }
  return tests;
}
function genCoverTests(){
  const fmt = (n, Tm, iv) => n + ' ' + Tm + '\n' + iv.map(p => p[0] + ' ' + p[1]).join('\n');
  const s1 = [[1, 4], [3, 6], [5, 10], [7, 8], [2, 5]];
  const s2 = [[1, 2], [4, 5]];
  const tests = [
    T(fmt(5, 10, s1), refCover(fmt(5, 10, s1)), true),
    T(fmt(2, 5, s2), refCover(fmt(2, 5, s2)), true),
  ];
  for (let k = 0; k < 4; k++){
    const Tm = ri(50, 200);
    const n = ri(20, 2000);
    const iv = [];
    for (let i = 0; i < n; i++){
      const l = ri(1, Tm);
      iv.push([l, Math.min(Tm, l + ri(0, 30))]);
    }
    if (k % 2 === 0){ // 保证有解：铺一条链
      let cur = 1;
      while (cur <= Tm){ const r = Math.min(Tm, cur + ri(3, 15)); iv.push([cur, r]); cur = r + 1; }
    }
    const inp = fmt(iv.length, Tm, iv);
    const g = refCover(inp);
    const b = refCoverBrute(inp);
    if (b !== null && b !== g) throw new Error('cover 对拍失败: ' + inp.slice(0, 200));
    tests.push(T(inp, g));
  }
  return tests;
}
function genBracketTests(){
  const tests = [
    T(')()())', refBrackets(')()())'), true),
    T('(()', refBrackets('(()'), true),
  ];
  for (let k = 0; k < 4; k++){
    const len = k === 3 ? 50000 : ri(1000, 15000);
    let s = '';
    for (let i = 0; i < len; i++) s += rnd() < 0.5 ? '(' : ')';
    tests.push(T(s, refBrackets(s)));
  }
  return tests;
}
function genMaxsubTests(){
  const tests = [
    T('9\n-2 1 -3 4 -1 2 1 -5 4', refMaxsub('9\n-2 1 -3 4 -1 2 1 -5 4'), true),
    T('3\n-1 -2 -3', refMaxsub('3\n-1 -2 -3'), true),
  ];
  for (let k = 0; k < 4; k++){
    const n = k === 3 ? 10000 : ri(100, 3000);
    const a = Array.from({ length: n }, () => ri(-1000, 1000)).join(' ');
    const inp = n + '\n' + a;
    tests.push(T(inp, refMaxsub(inp)));
  }
  return tests;
}
function genTreeTests(){
  const fmt = (n, edges) => n + '\n' + edges.map(e => e[0] + ' ' + e[1]).join('\n');
  const s1 = fmt(5, [[1, 2], [2, 3], [3, 4], [4, 5]]);
  const s2 = fmt(4, [[1, 2], [1, 3], [1, 4]]);
  const tests = [
    T(s1, refTree(s1), true),
    T(s2, refTree(s2), true),
  ];
  for (let k = 0; k < 4; k++){
    const n = k === 3 ? 10000 : ri(800, 4000);
    const edges = [];
    for (let v = 2; v <= n; v++) edges.push([ri(1, v - 1), v]);
    shuffle(edges);
    const inp = fmt(n, edges);
    tests.push(T(inp, refTree(inp)));
  }
  return tests;
}
function genDigitTests(){
  const tests = [
    T('13', refDigit('13'), true),
    T('99', refDigit('99'), true),
  ];
  for (let k = 0; k < 4; k++){
    const n = k === 3 ? 999999999999 : ri(1, 1e12);
    tests.push(T(String(n), refDigit(String(n))));
  }
  return tests;
}
function genInverseTests(){
  const fmt = (n, a) => n + '\n' + a.join(' ');
  const s1 = [3, 1, 2, 5, 4];
  const s2 = [1, 2, 3];
  const tests = [
    T(fmt(5, s1), refInverse(fmt(5, s1)), true),
    T(fmt(3, s2), refInverse(fmt(3, s2)), true),
  ];
  tests.push(T(fmt(6000, Array.from({ length: 6000 }, (_, i) => 6000 - i)), refInverse(fmt(6000, Array.from({ length: 6000 }, (_, i) => 6000 - i))))); // 完全逆序
  for (let k = 0; k < 3; k++){
    const n = k === 2 ? 6000 : ri(1000, 4000);
    const a = Array.from({ length: n }, () => ri(0, 1e9));
    const inp = fmt(n, a);
    tests.push(T(inp, refInverse(inp)));
  }
  return tests;
}
function genLisTests(){
  const fmt = (n, a) => n + '\n' + a.join(' ');
  const s1 = [1, 7, 3, 5, 9, 4, 8];
  const s2 = [5, 4, 3, 2, 1];
  const tests = [
    T(fmt(7, s1), refLis(fmt(7, s1)), true),
    T(fmt(5, s2), refLis(fmt(5, s2)), true),
  ];
  tests.push(T(fmt(10000, Array.from({ length: 10000 }, (_, i) => i + 1)), refLis(fmt(10000, Array.from({ length: 10000 }, (_, i) => i + 1))))); // 全递增
  for (let k = 0; k < 3; k++){
    const n = k === 2 ? 10000 : ri(2000, 7000);
    const a = Array.from({ length: n }, () => ri(0, 1e9));
    const inp = fmt(n, a);
    tests.push(T(inp, refLis(inp)));
  }
  return tests;
}
function genPackTests(){
  const fmt = (n, W, items) => n + ' ' + W + '\n' + items.map(p => p[0] + ' ' + p[1]).join('\n');
  const s1 = [[1, 2], [2, 4], [3, 4], [4, 5]];
  const s2 = [[4, 10], [2, 3]];
  const tests = [
    T(fmt(4, 5, s1), refPack(fmt(4, 5, s1)), true),
    T(fmt(2, 3, s2), refPack(fmt(2, 3, s2)), true),
  ];
  for (let k = 0; k < 4; k++){
    const W = k === 3 ? 2000 : ri(50, 800);
    const n = k === 3 ? 100 : ri(5, 80);
    const items = Array.from({ length: n }, () => [ri(1, 1000), ri(1, 1000)]);
    const inp = fmt(n, W, items);
    tests.push(T(inp, refPack(inp)));
  }
  return tests;
}
function genDijTests(){
  const fmt = (n, edges) => n + ' ' + edges.length + '\n' + edges.map(e => e[0] + ' ' + e[1] + ' ' + e[2]).join('\n');
  const s1 = [[1, 2, 1], [2, 3, 2], [3, 4, 3], [1, 4, 10]];
  const s2 = [[1, 2, 5]];
  const tests = [
    T(fmt(4, s1), refDij(fmt(4, s1)), true),
    T(fmt(3, s2), refDij(fmt(3, s2)), true),
  ];
  for (let k = 0; k < 4; k++){
    const n = k === 3 ? 500 : ri(80, 300);
    const edges = [];
    // 生成连通图：随机父节点生成树 + 额外随机边
    for (let v = 2; v <= n; v++) edges.push([ri(1, v - 1), v, ri(1, 1e6)]);
    const extra = Math.min(5000 - (n - 1), ri(0, n * 2));
    for (let i = 0; i < extra; i++){
      const u = ri(1, n), v = ri(1, n);
      if (u !== v) edges.push([u, v, ri(1, 1e6)]);
    }
    const inp = fmt(n, edges);
    tests.push(T(inp, refDij(inp)));
  }
  return tests;
}

/* ---------- 题面 ---------- */
function sampleBlock(tests, idx){
  const t = tests[idx];
  return '<div class="sample"><div class="sample-io"><div><h4>输入样例 ' + idx + '</h4><pre>' +
    esc(t.input) + '</pre></div><div><h4>输出样例 ' + idx + '</h4><pre>' +
    esc(t.expected) + '</pre></div></div></div>';
}
function esc(s){ return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function doc(p){
  return '<h2>' + p.title + '</h2>' + p.body +
    '<h3>样例 1</h3>' + sampleBlock(p.tests, 0) +
    '<h3>样例 2</h3>' + sampleBlock(p.tests, 1) +
    '<h3>数据范围与约定</h3><p>' + p.range + '</p>' + (p.hint ? '<h3>提示</h3><p>' + p.hint + '</p>' : '');
}

const PROBLEMS = [
  {
    id: 'queue', title: '排队（queue）', tl: 2000,
    body: '<h3>题目描述</h3><p>体育课上，n 名同学从左到右站成一排，第 i 名同学的身高为 h_i（单位：厘米）。</p>' +
      '<p>体育老师想知道：对于每一名同学，排在他<b>右边</b>且身高<b>严格大于</b>他的同学共有多少名。</p>' +
      '<h3>输入格式</h3><p>第一行一个整数 n，表示同学的人数。</p><p>第二行 n 个整数 h_1, h_2, …, h_n，表示每名同学的身高。</p>' +
      '<h3>输出格式</h3><p>输出共 n 行，第 i 行一个整数，表示第 i 名同学右边比他高的同学数量。</p>',
    range: '对于 100% 的数据，2 ≤ n ≤ 500，1 ≤ h_i ≤ 10^9。',
    hint: '本题数据规模较小，O(n²) 的做法即可通过。',
    tests: genQueueTests(), ref: refQueue,
  },
  {
    id: 'decode', title: '解码（decode）', tl: 1000,
    body: '<h3>题目描述</h3><p>一种加密方式把字母 A~Z 依次编号为 1~26。一段明文经过加密后变成了一个仅由数字 1~9 组成的字符串 s。由于解码时可能把相邻的两个数字合并为一个两位数（该两位数必须在 1~26 之间），一段密文可能对应多种明文。</p>' +
      '<p>给定密文 s，求它可能对应的明文<b>总数</b>。答案可能很大，请对 10^9+7 取模。</p>' +
      '<p>例如密文 <code>111</code> 可以解码为 <code>AAA</code>、<code>KA</code>、<code>AK</code>，共 3 种。</p>' +
      '<h3>输入格式</h3><p>一行一个字符串 s，仅包含字符 1~9。</p>' +
      '<h3>输出格式</h3><p>一行一个整数，表示解码方案数对 10^9+7 取模的结果。</p>',
    range: '对于 100% 的数据，1 ≤ |s| ≤ 2000。',
    hint: '',
    tests: genDecodeTests(), ref: refDecode,
  },
  {
    id: 'gridpath', title: '网格路径（gridpath）', tl: 2000,
    body: '<h3>题目描述</h3><p>有一个 n 行 m 列的网格，其中一些格子是障碍。小 H 从左上角 (1,1) 出发，要走到右下角 (n,m)。每一步他只能向右或向下移动一格，且不能走出网格、不能经过障碍格。</p>' +
      '<p>保证起点和终点不是障碍。求从起点到终点的不同路径条数，答案对 10^9+7 取模。</p>' +
      '<h3>输入格式</h3><p>第一行两个整数 n, m。</p><p>接下来 n 行，每行一个长度为 m 的字符串，<code>.</code> 表示空格，<code>#</code> 表示障碍。</p>' +
      '<h3>输出格式</h3><p>一行一个整数，表示路径条数对 10^9+7 取模的结果。</p>',
    range: '对于 100% 的数据，1 ≤ n, m ≤ 200，起点与终点均为空格。',
    hint: '',
    tests: genGridTests(), ref: refGrid,
  },
  {
    id: 'cover', title: '区间覆盖（cover）', tl: 2000,
    body: '<h3>题目描述</h3><p>数轴上共有 T 个单位位置 1, 2, …, T，需要被完全覆盖。现有 n 条线段，第 i 条覆盖 [l_i, r_i]（整数端点，含两端）。</p>' +
      '<p>请选出<b>最少</b>的线段，使它们的并完整覆盖 1~T 的每一个位置。若无解，输出 -1。</p>' +
      '<h3>输入格式</h3><p>第一行两个整数 n, T。</p><p>接下来 n 行，每行两个整数 l_i, r_i。</p>' +
      '<h3>输出格式</h3><p>一行一个整数：最少的线段条数；无解输出 -1。</p>',
    range: '对于 100% 的数据，1 ≤ n ≤ 2000，1 ≤ T ≤ 200，1 ≤ l_i ≤ r_i ≤ T。',
    hint: '位置 x 被覆盖当且仅当存在所选线段 [l, r] 满足 l ≤ x ≤ r。',
    tests: genCoverTests(), ref: refCover,
  },
  {
    id: 'brackets', title: '括号序列（brackets）', tl: 1000,
    body: '<h3>题目描述</h3><p>给定一个仅由 <code>(</code> 和 <code>)</code> 组成的字符串 s。称 s 的一个连续子串是「合法的」，当且仅当该子串是一个匹配的括号序列（即每个左括号都能与右侧某个未匹配的右括号一一配对）。</p>' +
      '<p>求 s 中<b>最长合法子串</b>的长度。若不存在合法子串，输出 0。</p>' +
      '<h3>输入格式</h3><p>一行一个字符串 s。</p>' +
      '<h3>输出格式</h3><p>一行一个整数，表示最长合法子串的长度。</p>',
    range: '对于 100% 的数据，1 ≤ |s| ≤ 10^5。',
    hint: '样例 1 中 <code>()()</code> 是最长的合法子串。',
    tests: genBracketTests(), ref: refBrackets,
  },
  {
    id: 'maxsub', title: '最大子段和（maxsub）', tl: 1000,
    body: '<h3>题目描述</h3><p>给定一个长度为 n 的整数序列 a_1, a_2, …, a_n。求一个非空连续子段 a_l..a_r（1 ≤ l ≤ r ≤ n），使子段内所有数之和最大，输出这个最大值。</p>' +
      '<h3>输入格式</h3><p>第一行一个整数 n。</p><p>第二行 n 个整数 a_1, a_2, …, a_n。</p>' +
      '<h3>输出格式</h3><p>一行一个整数，表示最大子段和。</p>',
    range: '对于 100% 的数据，1 ≤ n ≤ 10000，-1000 ≤ a_i ≤ 1000。注意：子段至少包含一个元素，因此全为负数时答案为最大的那个元素。',
    hint: '',
    tests: genMaxsubTests(), ref: refMaxsub,
  },
  {
    id: 'tree', title: '树的直径（tree）', tl: 2000,
    body: '<h3>题目描述</h3><p>给定一棵 n 个节点的树，节点编号 1~n，每条边长度为 1。</p>' +
      '<p>树的「直径」定义为树上任意两点间最短路径长度的最大值。求这棵树的直径长度。</p>' +
      '<h3>输入格式</h3><p>第一行一个整数 n。</p><p>接下来 n−1 行，每行两个整数 u, v，表示一条连接节点 u 与 v 的边。</p>' +
      '<h3>输出格式</h3><p>一行一个整数，表示直径长度。</p>',
    range: '对于 100% 的数据，2 ≤ n ≤ 10^4，输入保证是一棵树。',
    hint: '注意递归深度，n 较大时建议使用广度优先搜索。',
    tests: genTreeTests(), ref: refTree,
  },
  {
    id: 'digit', title: '数位统计（digit）', tl: 1000,
    body: '<h3>题目描述</h3><p>把 1 到 n 的所有整数依次写下来：123456789101112…。求其中数字字符 <code>1</code> 一共出现了多少次。</p>' +
      '<p>例如 n = 13 时，写出 <code>12345678910111213</code>，其中 1 出现了 6 次。</p>' +
      '<h3>输入格式</h3><p>一行一个整数 n。</p>' +
      '<h3>输出格式</h3><p>一行一个整数，表示数字 1 出现的次数。</p>',
    range: '对于 100% 的数据，1 ≤ n ≤ 10^12。',
    hint: '',
    tests: genDigitTests(), ref: refDigit,
  },
  {
    id: 'inverse', title: '逆序对（inverse）', tl: 3000,
    body: '<h3>题目描述</h3><p>给定一个长度为 n 的序列 a_1, a_2, …, a_n。若存在 i &lt; j 且 a_i &gt; a_j，则称 (i, j) 构成一个<b>逆序对</b>。</p>' +
      '<p>求整个序列中逆序对的数量。</p>' +
      '<h3>输入格式</h3><p>第一行一个整数 n。</p><p>第二行 n 个整数 a_1, a_2, …, a_n。</p>' +
      '<h3>输出格式</h3><p>一行一个整数，表示逆序对的数量。</p>',
    range: '对于 100% 的数据，1 ≤ n ≤ 6000，0 ≤ a_i ≤ 10^9。',
    hint: 'O(n²) 的做法无法通过全部测试点，请使用归并排序或树状数组。',
    tests: genInverseTests(), ref: refInverse,
  },
  {
    id: 'lis', title: '最长上升子序列（lis）', tl: 2000,
    body: '<h3>题目描述</h3><p>给定一个长度为 n 的序列 a_1, a_2, …, a_n，求它的<b>最长严格上升子序列</b>的长度。</p>' +
      '<p>子序列指从原序列中删除若干个（可以为零个）元素后，按原有顺序排列得到的序列；「严格上升」指子序列中相邻两个元素满足后一个严格大于前一个。</p>' +
      '<h3>输入格式</h3><p>第一行一个整数 n。</p><p>第二行 n 个整数 a_1, a_2, …, a_n。</p>' +
      '<h3>输出格式</h3><p>一行一个整数，表示最长严格上升子序列的长度。</p>',
    range: '对于 100% 的数据，1 ≤ n ≤ 10^4，0 ≤ a_i ≤ 10^9。',
    hint: 'O(n²) 的做法无法通过全部测试点，请使用 O(n log n) 的做法。',
    tests: genLisTests(), ref: refLis,
  },
  {
    id: 'pack', title: '小鱼的背包（pack）', tl: 3000,
    body: '<h3>题目描述</h3><p>小鱼的背包容量为 W。今有 n 件物品，第 i 件物品占据 w_i 的容量，价值为 v_i。每件物品至多选一件。</p>' +
      '<p>在所选物品总容量不超过 W 的前提下，求物品价值总和的最大值。</p>' +
      '<h3>输入格式</h3><p>第一行两个整数 n, W。</p><p>接下来 n 行，每行两个整数 w_i, v_i。</p>' +
      '<h3>输出格式</h3><p>一行一个整数，表示最大价值总和。</p>',
    range: '对于 100% 的数据，1 ≤ n ≤ 100，1 ≤ W ≤ 2000，1 ≤ w_i, v_i ≤ 1000。',
    hint: '',
    tests: genPackTests(), ref: refPack,
  },
  {
    id: 'dijkstra', title: '最短路（dijkstra）', tl: 3000,
    body: '<h3>题目描述</h3><p>给定一个 n 个点、m 条边的<b>无向带权图</b>，边权均为正。求从节点 1 到节点 n 的最短路径长度；若节点 n 不可达，输出 -1。</p>' +
      '<h3>输入格式</h3><p>第一行两个整数 n, m。</p><p>接下来 m 行，每行三个整数 u, v, w，表示节点 u 与 v 之间有一条权为 w 的无向边。</p>' +
      '<h3>输出格式</h3><p>一行一个整数：从 1 到 n 的最短路径长度，不可达输出 -1。</p>',
    range: '对于 100% 的数据，1 ≤ n ≤ 500，1 ≤ m ≤ 1500，1 ≤ w ≤ 10^6。图中可能存在重边，不存在自环。',
    hint: '本题边权均为正，可使用 Dijkstra 算法。',
    tests: genDijTests(), ref: refDij,
  },
];

/* ---------- 生成题面 / 拆分流（题面进 problems.js，隐藏点进 problem-tests.js） ---------- */
const HIDDEN = {};
for (const p of PROBLEMS){
  p.statement = doc(p);
  delete p.ref;
  // 剥离隐藏测试点：problems.js 只保留样例（首屏秒开），隐藏点单独文件按需加载
  HIDDEN[p.id] = p.tests.filter(t => !t.sample);
  p.tests = p.tests.filter(t => t.sample);
}
const SETS = [
  { name: '模拟卷一（基础）', ids: ['queue', 'decode', 'maxsub', 'digit'] },
  { name: '模拟卷二（进阶）', ids: ['gridpath', 'brackets', 'cover', 'tree'] },
  { name: '模拟卷三（挑战）', ids: ['inverse', 'lis', 'pack', 'dijkstra'] },
  { name: '模拟卷四（混合）', ids: ['maxsub', 'inverse', 'brackets', 'dijkstra'] },
];

const banner = '/* 本文件由 tools/gen_problems.js 生成，请勿手改（改完题目请重新运行生成器） */\n';
const meta = banner + 'window.BUILTIN_PROBLEMS = ' + JSON.stringify(PROBLEMS, null, 1) + ';\n' +
  'window.BUILTIN_SETS = ' + JSON.stringify(SETS, null, 1) + ';\n';
const dest = path.join(__dirname, '..', 'problems.js');
fs.writeFileSync(dest, meta, 'utf8');

// 隐藏测试点：学生端进入桌面时动态加载，不阻塞首屏
const testsPath = path.join(__dirname, '..', 'problem-tests.js');
const testsOut = banner + 'window.BUILTIN_HIDDEN_TESTS = ' + JSON.stringify(HIDDEN, null, 1) + ';\n';
fs.writeFileSync(testsPath, testsOut, 'utf8');

let sampleCnt = 0, total = 0, hiddenTotal = 0;
for (const p of PROBLEMS){
  total += p.tests.length;
  hiddenTotal += (HIDDEN[p.id] || []).length;
  sampleCnt += p.tests.filter(t => t.sample).length;
  console.log(p.id.padEnd(10), '样例', p.tests.length, '| 隐藏', (HIDDEN[p.id] || []).length, '| 样例答案:', p.tests.slice(0, 2).map(t => t.expected.trim()).join(' / '));
}
console.log('--- 共', PROBLEMS.length, '题：problems.js 仅含样例（秒开），problem-tests.js 含隐藏点', hiddenTotal, '个 →', dest, '及', testsPath);
