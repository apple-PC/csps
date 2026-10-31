#!/usr/bin/env node
/* 冒烟测试：用 jsdom 加载 index.html，走一遍管理员 → 学生主流程 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('/Users/wangzihan/.workbuddy/binaries/node/workspace/node_modules/jsdom');

const ROOT = path.resolve(__dirname, '..');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => { if (!/Could not load img|not implemented/i.test(String(e))) errors.push('jsdomError: ' + e.message); });
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, {
  url: 'https://cspsim.test/index.html', // jsdom 对 file:// 视为 opaque origin，localStorage 不可用
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const { window } = dom;
const { document } = window;

// 手动按 index.html 的顺序执行脚本
// 注意：浏览器中多个 <script> 共享全局词法作用域，这里拼接为一次 eval 等价模拟
{
  const code = ['util.js', 'store.js', 'problems.js', 'reviews.js', 'review-data.js', 'review-algo.js', 'review-algo-deep.js', 'admin.js', 'desktop.js', 'student.js']
    .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n') +
    '\n;window.showLoading = showLoading; window.hideLoading = hideLoading;';
  try{ window.eval(code); }
  catch(e){ errors.push('脚本执行失败: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')); }
}
window.confirm = () => true;
// 预载隐藏测试点：jsdom outside-only 不会执行动态插入的 <script>，
// 提前 eval 让 loadHiddenTests() 走“已存在”分支，避免 enterDesktop 的 await 挂起
try { window.eval(fs.readFileSync(path.join(ROOT, 'problem-tests.js'), 'utf8')); } catch (e) {}

const $ = s => document.querySelector(s);
const click = elx => elx.dispatchEvent(new window.Event('click', { bubbles: true }));
const visible = id => !$('#' + id).classList.contains('hidden');
let pass = 0, fail = 0;
function check(name, cond){
  if (cond){ pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('— 开始界面 —');
  check('开始界面可见', visible('startScreen'));
  check('入口按钮存在', !!$('#btnEnterAdmin') && !!$('#btnEnterStudent'));

  console.log('— 管理员端 —');
  click($('#btnEnterAdmin'));
  check('管理员端打开', visible('adminApp'));
  check('修复回归：打开面板即初始化配置落盘', !!window.localStorage.getItem('csp_sim:settings') && !!window.localStorage.getItem('csp_sim:problems'));
  check('设置视图可见', visible('view-settings'));
  $('#setExamName').value = 'CSP-S 2026 模拟';
  $('#setExamName').dispatchEvent(new window.Event('input', { bubbles: true }));
  $('#setDuration').value = '240';
  $('#setDuration').dispatchEvent(new window.Event('input', { bubbles: true }));
  const saved = JSON.parse(window.localStorage.getItem('csp_sim:settings'));
  check('设置实时保存', saved.examName === 'CSP-S 2026 模拟' && saved.durationMin === 240);

  // 题目管理
  click(document.querySelector('.adm-navbtn[data-view="problems"]'));
  check('题库渲染 12 行', document.querySelectorAll('#probList .prob-row').length === 12);
  check('4 套卷按钮', document.querySelectorAll('#setsRow .btn').length === 5); // 4 套 + 全部启用
  // 应用套卷一
  document.querySelectorAll('#setsRow .btn')[0].click();
  check('套卷一应用后启用 4 题', JSON.parse(window.localStorage.getItem('csp_sim:problems')).filter(p => p.enabled).length === 4);

  // 考试控制：手动开始
  click(document.querySelector('.adm-navbtn[data-view="control"]'));
  check('控制卡显示未开始', $('#ctrlCard').textContent.includes('未开始'));
  click($('#btnStartExam'));
  const st = JSON.parse(window.localStorage.getItem('csp_sim:state'));
  check('考试状态 running', st.status === 'running' && st.startedAt > 0);

  click($('#btnAdminExit'));
  check('返回开始界面', visible('startScreen'));

  console.log('— 学生端 / NOI Linux 桌面 —');
  click($('#btnEnterStudent'));
  check('登录页打开', visible('studentLogin'));
  check('检测到考试配置', $('#loginNoData').classList.contains('hidden'));
  $('#loginName').value = '测试生';
  $('#loginId').value = 'GZ-001';
  $('#loginForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(60);
  check('进入考试桌面', visible('studentApp'));

  // ── GNOME Flashback 双面板 ──
  check('有顶部面板', !!document.getElementById('sTop'));
  check('有底部面板', !!document.getElementById('sBottom'));
  check('顶部有应用程序菜单', /应用程序/.test(document.getElementById('sAppBtn').textContent));
  check('顶部有位置菜单', /位置/.test(document.getElementById('sPlacesBtn').textContent));
  check('顶部有系统状态区', !!document.getElementById('sSysBtn') && !!document.getElementById('sRemain'));
  check('桌面图标用 SVG 而非 emoji', document.querySelectorAll('.s-icon .ico svg').length > 0);

  const icons = [...document.querySelectorAll('.s-icon')];
  check('桌面图标数（4 题 + 目录 + 须知 + 3 工具 + 交卷）', icons.length === 10);
  check('桌面有准考证号目录', icons.some(i => i.textContent.includes('GZ-001')));

  // ── 壁纸 ──
  const wall0 = document.getElementById('sDesktop').dataset.wall;
  window.Desktop.setWallpaper('noi');
  check('壁纸可切换', document.getElementById('sDesktop').dataset.wall === 'noi');
  window.Desktop.setWallpaper(wall0 || 'plain');

  // ── 应用程序菜单（按分类列出预装软件） ──
  document.getElementById('sAppBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
  const pop = document.getElementById('sPop');
  check('应用程序菜单打开', !pop.classList.contains('hidden'));
  check('菜单按分组列出', /编程/.test(pop.textContent) && /系统工具/.test(pop.textContent) && /互联网/.test(pop.textContent));
  check('菜单含 Code::Blocks / Geany', /Code::Blocks/.test(pop.textContent) && /Geany/.test(pop.textContent));
  check('菜单含 Vim / GDB / Arbiter_local', /Vim/.test(pop.textContent) && /GDB/.test(pop.textContent) && /Arbiter_local/.test(pop.textContent));
  check('菜单含 Firefox', /Firefox/.test(pop.textContent));
  window.Desktop.closePop();
  check('菜单可关闭', pop.classList.contains('hidden'));

  // ── 压缩包 → 题面 ──
  document.querySelectorAll('.s-icon')[0].dispatchEvent(new window.Event('dblclick', { bubbles: true }));
  check('zip 窗口打开', document.querySelectorAll('.s-win').length === 1 && document.querySelector('.win-title').textContent.includes('.zip'));
  document.querySelector('.zip-row').dispatchEvent(new window.Event('dblclick', { bubbles: true }));
  await sleep(20);
  check('题面窗口打开', document.querySelector('.pdf-name') !== null);
  check('题面含标题', document.querySelector('.prob-doc h2') !== null);

  // ── 文件管理器：真实目录结构 ──
  icons.find(i => i.textContent.includes('GZ-001')).dispatchEvent(new window.Event('dblclick', { bubbles: true }));
  await sleep(20);
  check('文件管理器打开', !!document.querySelector('.fman-list'));
  check('文件管理器列出 4 个题目目录', document.querySelectorAll('.fman-row').length === 4);
  check('状态栏显示准考证号路径', /GZ-001/.test(document.querySelector('.fman-status').textContent));
  document.querySelector('.fman-row').dispatchEvent(new window.Event('dblclick', { bubbles: true }));
  await sleep(20);
  const fmRows = [...document.querySelectorAll('.fman-row')];
  check('题目目录含 .cpp 源文件', fmRows.some(r => r.textContent.includes('.cpp')));
  check('题目目录含样例 .in/.ans', fmRows.some(r => r.textContent.includes('.in')) && fmRows.some(r => r.textContent.includes('.ans')));

  // ── IDE ──
  icons.find(i => i.textContent.includes('Code::Blocks')).dispatchEvent(new window.Event('dblclick', { bubbles: true }));
  await sleep(20);
  check('Code::Blocks 打开（NOI Linux 标题）', [...document.querySelectorAll('.win-title')].some(t => t.textContent.includes('Code::Blocks — NOI Linux')));
  check('IDE 题目下拉有 4 题', document.querySelectorAll('.ide-bar select option').length === 4);
  check('IDE 显示源文件真实路径', /GZ-001\/.*\.cpp/.test(document.querySelector('.ide-path').textContent));
  const pid = document.querySelector('.ide-bar select option').value;
  window.postMessage({ type: 'ide:code', code: 'int main(){return 0;}' }, '*');
  await sleep(30);
  check('IDE 代码自动保存', (JSON.parse(window.localStorage.getItem('csp_sim:codes'))[pid] || '').includes('main'));

  // ── 终端 ──
  icons.find(i => i.textContent.includes('终端')).dispatchEvent(new window.Event('dblclick', { bubbles: true }));
  await sleep(30);
  const termInput = () => document.querySelector('.term-input-row input');
  const termText = () => document.querySelector('.term').textContent;
  check('终端打开', !!termInput());
  check('终端提示符含当前路径', /student@noi:~\/Desktop\/GZ-001/.test(document.querySelector('.term-input-row .prompt').textContent));
  async function sh(cmd){
    termInput().value = cmd;
    termInput().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(60);
  }
  await sh('ls');
  check('ls 列出题目目录', /poker|queue/.test(termText()));
  await sh('cd ' + pid);
  await sh('pwd');
  check('cd 后 pwd 进入题目目录', new RegExp('/' + pid).test(termText()));
  await sh('tree');
  check('tree 递归列出目录', /directories/.test(termText()));
  await sh('cat ' + pid + '1.in');
  check('cat 能读到样例输入', termText().length > 400);
  await sh('diff ' + pid + '1.in ' + pid + '1.ans');
  check('diff 报告差异', /< |---/.test(termText()));
  await sh('g++ -o game nosuch.cpp');
  check('g++ 对不存在的文件报错', /No such file/.test(termText()));
  await sh('./game');
  check('./game 未编译时报 No such file', /No such file|权限不够/.test(termText()));
  await sh('ulimit -s 102400');
  check('ulimit 可设置栈上限', /100 MB/.test(termText()));
  await sh('sudo ls');
  check('sudo 被拒绝（非管理员）', /sudoers/.test(termText()));

  // ── Arbiter_local ──
  icons.find(i => i.textContent.includes('Arbiter_local')).dispatchEvent(new window.Event('dblclick', { bubbles: true }));
  await sleep(30);
  check('Arbiter 打开', !!document.querySelector('.arb-table'));
  check('Arbiter 左侧列出 4 题', document.querySelectorAll('.arb-item').length === 4);
  check('Arbiter 列出全部测试点', document.querySelectorAll('.arb-table tbody tr').length >= 3);
  check('Arbiter 显示评分栏', !!document.querySelector('.arb-foot .arb-score'));

  // ── 任务栏 ──
  check('底部面板显示窗口按钮', document.querySelectorAll('#sTaskWins .s-taskbtn').length >= 5);

  // ── 交卷 ──
  icons.find(i => i.textContent.includes('提交试卷')).dispatchEvent(new window.Event('dblclick', { bubbles: true }));
  await sleep(20);
  check('交卷窗口打开', document.querySelector('.submit-table') !== null);
  check('交卷窗口提示提交路径', /GZ-001/.test(document.querySelector('.submit-path').textContent));
  click([...document.querySelectorAll('.submit-pane .btn')].pop());
  await sleep(120);
  check('交卷后显示结束层', visible('sEndOverlay'));
  check('回执含已交题目', $('#endReceipt').textContent.includes(pid));
  const subs = JSON.parse(window.localStorage.getItem('csp_sim:submissions'));
  check('提交记录落库', subs.length === 1 && subs[0].problemId === pid);
  check('状态已结束', JSON.parse(window.localStorage.getItem('csp_sim:state')).status === 'ended');

  click($('#btnEndBack'));
  check('返回开始界面', visible('startScreen'));

  console.log('— 超时自动交卷场景 —');
  window.localStorage.removeItem('csp_sim:submissions');
  window.localStorage.removeItem('csp_sim:studentState');
  window.localStorage.setItem('csp_sim:state', JSON.stringify({
    status: 'running', startedAt: Date.now() - 241 * 60 * 1000, // 已超时
  }));
  click($('#btnEnterStudent'));
  $('#loginName').value = '测试生2';
  $('#loginId').value = 'GZ-002';
  $('#loginForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(1500); // 等 tick 触发
  check('超时后自动交卷锁定', visible('sEndOverlay'));

  console.log('— 复习中心（独立页 study/）—');
  check('开始界面有复习入口', !!$('#btnEnterReview') && /study/.test($('#btnEnterReview').getAttribute('onclick') || ''));
  check('入口不再内嵌复习面板', !document.getElementById('reviewApp'));
  await testStudy();

  console.log('— 加载进度显示 —');
  const showLoading = window.eval('showLoading');
  const hideLoading = window.eval('hideLoading');
  showLoading('正在进入考试', { total: 3, current: 1, file: 'problem-tests.js' });
  check('加载遮罩显示', !$('#globalLoading').classList.contains('hidden'));
  check('加载文字更新', $('#globalLoadingText').textContent.includes('正在进入考试'));
  check('加载文件名更新', $('#globalLoadingFile').textContent.includes('problem-tests.js'));
  check('进度条有宽度', /\d/.test($('#globalLoadingBar').style.width) && parseFloat($('#globalLoadingBar').style.width) > 0);
  showLoading('下载中', { indeterminate: true });
  check('无限进度模式生效', $('#globalLoadingBar').parentElement.classList.contains('g-bar-indet'));
  showLoading('正在下载评测数据…', { percent: 42, detail: '正在下载：problem-tests.js · 已接收 320 KB' });
  check('百分比模式进度条正确', parseFloat($('#globalLoadingBar').style.width) === 42);
  check('百分比数字显示', $('#globalLoadingPct').textContent.trim() === '42%');
  check('副标题（下载文件+字节）显示', $('#globalLoadingFile').textContent.includes('已接收 320 KB'));
  hideLoading();
  check('加载遮罩可隐藏', $('#globalLoading').classList.contains('hidden'));

  console.log('— 题库拆分验证 —');
  const pjsSize = fs.statSync(path.join(ROOT, 'problems.js')).size;
  check('problems.js 首屏轻量 (<100KB)', pjsSize < 100 * 1024);
  const hiddenReady = !!window.BUILTIN_HIDDEN_TESTS &&
    window.BUILTIN_PROBLEMS.every(p => (window.BUILTIN_HIDDEN_TESTS[p.id] || []).length === 4);
  check('隐藏测试点 48 个齐全（4/题）', hiddenReady);
  // 拆分正确：样例留在 meta（每题 2），隐藏点留在 tests 文件（每题 4），二者可拼成 6
  const mergeOK = window.BUILTIN_PROBLEMS.every(p =>
    p.tests.filter(t => t.sample).length === 2 &&
    (window.BUILTIN_HIDDEN_TESTS[p.id] || []).length === 4);
  check('样例2+隐藏4 可拼成每题 6 测试点', mergeOK);

  console.log('\n结果：', pass, '通过 /', fail, '失败');
  if (errors.length){
    console.log('页面错误：');
    errors.slice(0, 10).forEach(e => console.log('  ', e));
  }
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error('测试崩溃:', e && (e.stack || e.message || e)); process.exit(1); });

/* ─────────────────────────────────────────────
   复习中心独立页（study/index.html）
   单独一个 jsdom 实例，模拟真实打开 /study/ 的场景
   ───────────────────────────────────────────── */
async function testStudy(){
  const html = fs.readFileSync(path.join(ROOT, 'study', 'index.html'), 'utf8');
  const sdom = new JSDOM(html, {
    url: 'https://cspsim.test/study/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const w = sdom.window, d = w.document;
  w.confirm = () => true;
  w.alert = () => {};

  const code = ['util.js', 'store.js', 'problems.js', 'reviews.js', 'review-data.js',
    'review-template.js', 'review-algo.js', 'review-algo-deep.js', 'review.js']
    .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n') +
    '\n;window.showLoading = showLoading;';
  try { w.eval(code); }
  catch (e){ errors.push('复习页脚本失败: ' + e.message); }

  await sleep(150);

  const q = s => d.querySelector(s);
  const qa = s => [...d.querySelectorAll(s)];
  const clk = e => e.dispatchEvent(new w.Event('click', { bubbles: true }));
  const vis = id => { const n = d.getElementById(id); return !!n && !n.classList.contains('hidden'); };
  const KEY = k => d.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));

  check('复习页自动进入（无需再点入口）', vis('reviewApp'));
  check('默认停在课程主页', vis('revHome') && !vis('revBody'));
  check('顶栏有 logo 与站名', !!q('.st-brand') && q('.st-brand').textContent.includes('复习中心'));
  check('主页 6 张课程卡片', qa('#revHome .rh-card').length === 6);
  check('主页有总进度区块', !!q('#revHome .rh-overall'));
  check('主页统计 4 项', qa('#revHome .rh-metric').length === 4);
  check('卡片带完成进度条', qa('#revHome .rh-card-prog').length === 6);
  check('顶栏进度环初始 0%', (d.getElementById('stProgTxt') || {}).textContent === '0%');
  check('主页隐藏板块标签栏', !vis('revTabs') || d.getElementById('revTabs').classList.contains('hidden'));

  // 进入「精讲与练习」
  clk(q('#revHome .rh-card[data-id="jiang"]'));
  await sleep(30);
  check('卡片可进入板块', vis('revBody') && !vis('revHome'));
  check('左栏 12 题', qa('#revList .rev-item').length === 12);
  check('板块标签 6 个', qa('#revTabs .rev-tab').length === 6);
  check('当前标签高亮', (q('#revTabs .rev-tab.active') || {}).textContent.includes('精讲与练习'));

  // 侧栏收起
  clk(d.getElementById('btnRevSide'));
  check('侧栏可收起', d.getElementById('revBody').classList.contains('side-hidden'));
  check('侧栏状态持久化', w.localStorage.getItem('csp_sim:revside') === '1');
  clk(d.getElementById('btnRevSide'));
  check('侧栏可展开', !d.getElementById('revBody').classList.contains('side-hidden'));

  // 精讲内容
  clk(q('#revList .rev-item'));
  await sleep(30);
  const txt = q('#revContent').textContent || '';
  check('精讲含思路', txt.includes('思路精讲'));
  check('精讲含知识点', txt.includes('知识点'));
  check('精讲含参考代码按钮', !!d.getElementById('revRun'));
  check('精讲有上一章/下一章', !!q('#revContent .rev-navbtn'));

  // 标记已学完
  const db = q('#revContent .rev-donebar .btn-done');
  check('章节底部有「标记已学完」', !!db);
  clk(db);
  await sleep(20);
  check('标记写入 localStorage', JSON.parse(w.localStorage.getItem('csp_sim:done') || '[]').length === 1);
  check('按钮切换为已学完', db.classList.contains('on'));
  check('左栏同步完成态', qa('#revList .rev-item.done').length === 1);
  check('顶栏进度随之更新', (d.getElementById('stProgTxt') || {}).textContent !== '0%');

  // 回主页看进度
  clk(d.getElementById('btnRevHome'));
  await sleep(20);
  check('可回到主页', vis('revHome'));
  check('主页总进度显示完成数', /[1-9]/.test((q('#revHome .rh-overall-ring b') || {}).textContent || ''));
  check('主页出现「继续上次」', !!d.getElementById('rhContinue'));

  // 算法板块
  clk(q('#revHome .rh-card[data-id="algo"]'));
  await sleep(30);
  check('算法教学 51 章', qa('#revList .rev-item').length === 51);
  check('算法有分组标题', qa('#revList .rev-group').length >= 8);

  const before = qa('#revList .rev-item').length;
  clk(q('#revList .rev-group'));
  check('分组可折叠', qa('#revList .rev-item').length < before);
  clk(q('#revList .rev-group'));
  check('分组可再展开', qa('#revList .rev-item').length === before);

  const flt = d.getElementById('revSearch');
  flt.value = '最短路';
  flt.dispatchEvent(new w.Event('input', { bubbles: true }));
  await sleep(20);
  const filtered = qa('#revList .rev-item').length;
  check('章节筛选可用', filtered > 0 && filtered < 10);
  flt.value = '';
  flt.dispatchEvent(new w.Event('input', { bubbles: true }));
  await sleep(20);

  const sp = qa('#revList .rev-item').find(x => x.textContent.includes('最短路'));
  clk(sp);
  await sleep(30);
  check('章节渲染多块', qa('#revContent .rev-block').length >= 8);
  check('深度讲解有表格', qa('#revContent .rev-table').length >= 2);
  check('深度讲解有提示卡', qa('#revContent .rev-note').length >= 2);
  check('有面包屑定位', !!q('#revContent .rev-crumb'));
  check('本章目录已生成', qa('#revToc a').length >= 2);
  check('URL hash 可分享', /#\/algo\//.test(w.location.hash || ''));

  // 模板速查板块
  clk(d.getElementById('btnRevHome'));
  await sleep(20);
  clk(q('#revHome .rh-card[data-id="template"]'));
  await sleep(30);
  check('模板速查 23 条（1 自检 + 22 模板）', qa('#revList .rev-item').length === 23);
  check('模板速查按算法分类分组', qa('#revList .rev-group').length >= 5);

  const tplItem = qa('#revList .rev-item').find(x => x.textContent.includes('并查集'));
  check('左栏列出并查集模板', !!tplItem);
  clk(tplItem);
  await sleep(30);
  const tplTxt = q('#revContent').textContent || '';
  check('模板标注用途与复杂度', tplTxt.includes('用途与复杂度'));
  check('模板渲染出代码块', qa('#revContent .rev-pre').length >= 1);
  check('模板代码内容正确', ((q('#revContent .rev-pre') || {}).textContent || '').includes('find'));
  check('模板带易错点列表', qa('#revContent .rev-ul').length >= 1);
  check('模板显示标签徽章', !!q('#revContent .rev-tag'));

  const chkItem = qa('#revList .rev-item').find(x => x.textContent.includes('考前 10 分钟'));
  check('含考前自检章节', !!chkItem);
  clk(chkItem);
  await sleep(20);
  check('自检清单 5 条', qa('#revContent .rev-ol li').length === 5);
  check('自检有警示卡', qa('#revContent .rev-note').length >= 1);

  // 全站搜索
  const si = d.getElementById('stSearch');
  si.value = '最短路';
  si.dispatchEvent(new w.Event('input', { bubbles: true }));
  await sleep(260);
  check('全站搜索有结果', qa('#stSearchPop .st-hit').length > 0);
  check('搜索结果显示板块标签', qa('#stSearchPop .st-hit-sec').length > 0);
  check('搜索命中高亮', qa('#stSearchPop mark').length > 0);
  const hitCount = qa('#stSearchPop .st-hit').length;
  check('搜索结果去掉了 HTML 标签', !(q('#stSearchPop').textContent || '').includes('<p>'));
  clk(q('#stSearchPop .st-hit'));
  await sleep(30);
  check('点搜索结果可跳转', !!q('#revContent .rev-h1'));

  // 字号
  clk(d.getElementById('btnFsUp'));
  check('字号可放大', d.body.getAttribute('data-fs') === 'l');
  clk(d.getElementById('btnFsDown'));
  check('字号可还原', d.body.getAttribute('data-fs') === 'm');

  // 键盘翻章
  const h1a = (q('#revContent .rev-h1') || {}).textContent;
  KEY('ArrowRight');
  await sleep(30);
  const h1b = (q('#revContent .rev-h1') || {}).textContent;
  check('→ 键切到下一章', h1a !== h1b);

  // 进度明细
  clk(d.getElementById('stProgBtn'));
  await sleep(10);
  check('进度明细弹层可打开', !!d.getElementById('stProgPop'));

  // 上次位置
  check('记录了上次阅读位置', !!w.localStorage.getItem('csp_sim:last'));

  sdom.window.close();
}
