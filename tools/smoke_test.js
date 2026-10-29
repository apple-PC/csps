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
  const code = ['util.js', 'store.js', 'problems.js', 'reviews.js', 'review-data.js', 'admin.js', 'student.js', 'review.js']
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

  console.log('— 学生端 —');
  click($('#btnEnterStudent'));
  check('登录页打开', visible('studentLogin'));
  check('检测到考试配置', $('#loginNoData').classList.contains('hidden'));
  $('#loginName').value = '测试生';
  $('#loginId').value = 'GZ-001';
  $('#loginForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(50);
  check('进入考试桌面', visible('studentApp'));
  const iconCount = document.querySelectorAll('.s-icon').length;
  check('桌面图标数（4 题 + 4 工具）', iconCount === 8);

  // 双击第一题 zip → 压缩包窗口
  document.querySelectorAll('.s-icon')[0].dispatchEvent(new window.Event('dblclick', { bubbles: true }));
  check('zip 窗口打开', document.querySelectorAll('.s-win').length === 1 && document.querySelector('.s-win-title, .win-title').textContent.includes('.zip'));
  // 打开题面
  const pdfRow = document.querySelector('.zip-row');
  pdfRow.dispatchEvent(new window.Event('dblclick', { bubbles: true }));
  await sleep(20);
  check('题面窗口打开', document.querySelector('.pdf-name') !== null);
  check('题面含标题', document.querySelector('.prob-doc h2') !== null);

  // IDE 窗口
  const ideIcon = [...document.querySelectorAll('.s-icon')].find(i => i.textContent.includes('编辑器'));
  check('桌面图标已去 whetstone 化', ideIcon !== undefined && !ideIcon.textContent.includes('Whetstone'));
  ideIcon.dispatchEvent(new window.Event('dblclick', { bubbles: true }));
  await sleep(20);
  check('IDE 窗口打开（NOI Linux 风格标题）', [...document.querySelectorAll('.win-title')].some(t => t.textContent.includes('编辑器 — NOI Linux')));
  check('IDE 题目下拉有 4 题', document.querySelectorAll('.ide-bar select option').length === 4);
  // 模拟 IDE 上报代码
  const pid = document.querySelector('.ide-bar select option').value;
  window.postMessage({ type: 'ide:code', code: 'int main(){return 0;}' }, '*');
  await sleep(30);
  check('IDE 代码自动保存', (JSON.parse(window.localStorage.getItem('csp_sim:codes'))[pid] || '').includes('main'));

  // 终端
  const termIcon = [...document.querySelectorAll('.s-icon')].find(i => i.textContent.includes('终端'));
  termIcon.dispatchEvent(new window.Event('dblclick', { bubbles: true }));
  await sleep(20);
  const termInput = document.querySelector('.term-input-row input');
  check('终端打开', !!termInput);
  termInput.value = 'ls';
  termInput.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  check('终端 ls 输出', document.querySelector('.term').textContent.includes('.zip'));

  // 交卷
  const subIcon = [...document.querySelectorAll('.s-icon')].find(i => i.textContent.includes('提交试卷'));
  subIcon.dispatchEvent(new window.Event('dblclick', { bubbles: true }));
  await sleep(20);
  check('交卷窗口打开', document.querySelector('.submit-table') !== null);
  click([...document.querySelectorAll('.submit-pane .btn')].pop());
  await sleep(100);
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

  console.log('— 复习端 —');
  check('入口按钮存在', !!$('#btnEnterReview'));
  check('精讲数据 12 题齐全', window.REVIEWS && Object.keys(window.REVIEWS).length === 12);
  check('通用板块数据 4 个', window.REVIEW_SECTIONS && Object.keys(window.REVIEW_SECTIONS).length === 4);
  click($('#btnEnterReview'));
  check('复习端打开', visible('reviewApp'));
  check('左侧列出 12 题', document.querySelectorAll('#revList .rev-item').length === 12);
  // 顶部 5 个板块标签
  check('板块标签 5 个', document.querySelectorAll('#revTabs .rev-tab').length === 5);
  check('默认标签为精讲与练习', document.querySelector('#revTabs .rev-tab.active').textContent.includes('精讲与练习'));
  // 点第一题看精讲
  document.querySelector('#revList .rev-item').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(20);
  check('精讲面板含思路', !!document.querySelector('.rev-content .rev-block') && document.querySelector('.rev-content').textContent.includes('思路精讲'));
  check('精讲面板含知识点', document.querySelector('.rev-content').textContent.includes('知识点'));
  check('精讲面板含参考代码', !!document.getElementById('revRun'));
  check('精讲面板含自测练习', document.querySelector('.rev-content').textContent.includes('自测练习'));
  check('精讲面板含题面', document.querySelector('.rev-content').textContent.includes('题目描述') || document.querySelectorAll('.rev-content .rev-block').length >= 3);
  // 自测提示可展开
  const pracBtn = document.querySelector('.rev-prac-btn');
  if (pracBtn){ pracBtn.dispatchEvent(new window.Event('click', { bubbles: true })); await sleep(10); check('自测提示可展开', !document.querySelector('.rev-prac-hint').classList.contains('hidden')); }
  // 勾选加入清单
  const cb = document.querySelector('#revList .rev-item input');
  cb.checked = true; cb.dispatchEvent(new window.Event('change', { bubbles: true }));
  check('勾选加入复习清单', JSON.parse(window.localStorage.getItem('csp_sim:reviewlist')).length === 1);
  // 切到“清单”筛选
  click(document.querySelector('.rev-filter[data-f="list"]'));
  check('清单筛选只剩 1 题', document.querySelectorAll('#revList .rev-item').length === 1);
  click(document.querySelector('.rev-filter[data-f="all"]'));

  // 逐一切换 4 个通用板块，验证左栏与右栏都能渲染
  const tabs = [...document.querySelectorAll('#revTabs .rev-tab')];
  const want = ['方法与技巧', '算法教学', '考前注意事项', 'IDE 指南'];
  for (let i = 0; i < want.length; i++){
    const tab = tabs.find(t => t.textContent.includes(want[i]));
    tab.dispatchEvent(new window.Event('click', { bubbles: true }));
    await sleep(10);
    check('板块「' + want[i] + '」左栏有条目', document.querySelectorAll('#revList .rev-item').length > 0);
    check('板块「' + want[i] + '」右栏有内容', document.querySelectorAll('#revContent .rev-block').length > 0);
  }
  // 算法教学：点一个章节看多个子块
  const algoTab = tabs.find(t => t.textContent.includes('算法教学'));
  algoTab.dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(10);
  check('算法教学含 11 章', document.querySelectorAll('#revList .rev-item').length === 11);
  document.querySelector('#revList .rev-item').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(10);
  check('算法章节渲染多个子块', document.querySelectorAll('#revContent .rev-block').length >= 3);

  click($('#btnReviewExit'));
  check('复习端返回开始界面', visible('startScreen'));

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
