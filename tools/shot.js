/* 用 CDP 驱动真实 Chrome 截图：适合需要登录 / 异步加载 / 交互后的界面
 * 用法: node tools/shot.js <场景名> <输出png>
 * 场景定义在下面的 SCENES 里，每个场景是一段在页面里执行的 async 脚本。
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = path.resolve(__dirname, '..');
const PORT = 9333 + Math.floor(Math.random() * 200);
const URL = process.env.SHOT_URL || 'http://127.0.0.1:8899/index.html';

const sleep = ms => new Promise(r => setTimeout(r, ms));

const LOGIN = `
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // 等开始界面渲染（题库/隐藏测试点可能还在下载）
  for (let i = 0; i < 120; i++){
    const b = document.getElementById('btnEnterAdmin');
    const ld = document.getElementById('globalLoading');
    if (b && (!ld || ld.classList.contains('hidden'))) break;
    await sleep(150);
  }
  await sleep(200);
  document.getElementById('btnEnterAdmin').click();
  await sleep(700);
  document.getElementById('btnAdminExit').click();
  await sleep(200);
  document.getElementById('btnEnterStudent').click();
  await sleep(200);
  document.getElementById('loginName').value = '王小明';
  document.getElementById('loginId').value = 'GZ-2026-001';
  document.getElementById('loginForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  // 等桌面就绪（隐藏测试点下载完、图标渲染出来）
  for (let i = 0; i < 80; i++){
    const ld = document.getElementById('globalLoading');
    if (document.querySelectorAll('.s-icon').length && ld && ld.classList.contains('hidden')) break;
    await sleep(150);
  }
  await sleep(300);
`;

const STUDY = `
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 150; i++){
    if (document.querySelector('#revHome .rh-card')) break;
    await sleep(150);
  }
  await sleep(400);
`;

const APP = name => `
  // 从「显示应用程序」网格启动（桌面不再摆启动器）
  Desktop.openAppGrid();
  { const gi = document.getElementById('sGridInput');
    gi.value = ${JSON.stringify(name)};
    gi.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#sGridBody .ub-grid-app').click(); }
  await sleep(450);
`;

const SCENES = {
  desk: LOGIN,

  // 复习中心：模板速查板块
  tpl: STUDY + `
    document.querySelector('#revHome .rh-card[data-id="template"]').click();
    await sleep(400);
    const it = [...document.querySelectorAll('#revList .rev-item')].find(x => x.textContent.includes('并查集'));
    if (it) it.click();
    await sleep(350);
  `,

  // 复习中心：课程首页，滚到「模板速查」卡片
  revhome: STUDY + `
    const cards = document.querySelectorAll('#revHome .rh-card');
    const t = [...cards].find(c => c.textContent.includes('模板速查'));
    if (t) t.scrollIntoView({ block: 'center' });
    await sleep(350);
  `,

  // 尺寸探针：不关心截图，只量 DOM
  probe: LOGIN + `
    const r = el => { const b = el.getBoundingClientRect(); return Math.round(b.width) + 'x' + Math.round(b.height); };
    const out = {};
    out.viewport = window.innerWidth + 'x' + window.innerHeight;
    out.iconBox = r(document.querySelector('.s-icon'));
    out.icoSpan = r(document.querySelector('.s-icon .ico'));
    const svg = document.querySelector('.s-icon .ico svg');
    out.svgBox = r(svg);
    out.svgStyle = getComputedStyle(svg).width + '/' + getComputedStyle(svg).height;
    out.icoStyle = getComputedStyle(document.querySelector('.s-icon .ico')).width;
    out.lblBox = r(document.querySelector('.s-icon .lbl'));
    out.desktop = r(document.querySelector('.s-desktop'));
    out.colWidth = getComputedStyle(document.querySelector('.s-desktop')).columnWidth;
    out.dockItem = r(document.querySelector('.ub-dock-item'));
    out.dockSvg = r(document.querySelector('.ub-dock-item svg'));
    out.top = r(document.querySelector('.ub-top'));
    const ab = document.getElementById('sActBtn');
    const abg = getComputedStyle(ab);
    out.actBtn = r(ab) + ' bg=' + abg.backgroundColor + ' radius=' + abg.borderRadius;
    const tb = document.getElementById('sDock');
    out.dockBg = getComputedStyle(tb).backgroundColor;
    out.iconCount = document.querySelectorAll('.s-icon').length;
    return JSON.stringify(out, null, 1);
  `,

  // 窗口标题栏探针
  winprobe: LOGIN + APP('终端') + `
    const h = document.querySelector('.s-win-head');
    const t = h && h.querySelector('.win-title');
    if (!t) return 'no .win-title; head=' + (h ? h.innerHTML.slice(0, 300) : 'null');
    const cs = getComputedStyle(t), hb = h.getBoundingClientRect(), tb = t.getBoundingClientRect();
    return JSON.stringify({
      headHTML: h.innerHTML.slice(0, 200),
      head: Math.round(hb.left) + '..' + Math.round(hb.right) + ' w=' + Math.round(hb.width),
      title: Math.round(tb.left) + '..' + Math.round(tb.right),
      pos: cs.position, left: cs.left, transform: cs.transform, cls: t.className
    }, null, 1);
  `,

  // 应用网格（GNOME：点「活动」）
  grid: LOGIN + `
    document.getElementById('sActBtn').click();
    await sleep(320);
    const g = document.getElementById('sGrid');
    const inn = document.querySelector('.ub-grid-inner');
    const gb = g.getBoundingClientRect(), ib = inn.getBoundingClientRect();
    return JSON.stringify({
      grid: Math.round(gb.top)+'..'+Math.round(gb.bottom)+' h='+Math.round(gb.height),
      inner: Math.round(ib.top)+'..'+Math.round(ib.bottom)+' h='+Math.round(ib.height),
      gridCenter: Math.round((gb.top+gb.bottom)/2),
      innerCenter: Math.round((ib.top+ib.bottom)/2),
      display: getComputedStyle(g).display + '/' + getComputedStyle(inn).marginTop
    }, null, 1);
  `,

  // 程序回收系统：登录页
  rclogin: LOGIN + `
    Desktop.launch('recovery');
    await sleep(700);
  `,

  // 程序回收系统：登录后切到「答题」
  recovery: LOGIN + `
    Desktop.launch('recovery');
    await sleep(700);
    document.querySelector('#rcPwd').value = 'demo1234';
    document.querySelector('#rcLoginBtn').click();
    await sleep(500);
    [...document.querySelectorAll('.rc-nav a')].find(a => a.dataset.tab === 'answer').click();
    await sleep(400);
  `,

  // 顶栏系统菜单
  menu: LOGIN + `
    document.getElementById('sSysBtn').click();
    await sleep(220);
  `,

  terminal: LOGIN + APP('终端') + `
    const inp = document.querySelector('.term-input-row input');
    async function sh(cmd){
      inp.value = cmd;
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await sleep(320);
    }
    await sh('pwd');
    await sh('ls');
    await sh('cd queue');
    await sh('ls -l');
    await sh('cat queue1.in');
    await sh('tree ..');
    document.querySelector('.term').scrollTop = 0;
    await sleep(200);
  `,

  arbiter: LOGIN + APP('Arbiter_local') + `
    await sleep(300);
  `,

  files: LOGIN + `
    const ic = [...document.querySelectorAll('.s-icon')].find(i => i.textContent.includes('GZ-2026-001'));
    ic.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await sleep(400);
    document.querySelector('.fman-row').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await sleep(300);
  `,

  ide: LOGIN + APP('Code::Blocks') + `
    await sleep(2200);
  `,

  vim: LOGIN + `
    Desktop.launch('vim');
    await sleep(600);
  `,

  gdb: LOGIN + `
    Desktop.launch('gdb');
    await sleep(400);
    const inp = document.querySelector('.term-input-row input');
    async function sh(cmd){
      inp.value = cmd;
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await sleep(300);
    }
    await sh('list');
    await sh('break 8');
    await sh('run');
  `,

  firefox: LOGIN + `
    Desktop.launch('firefox');
    await sleep(500);
  `,
};

function connect(wsUrl){
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let seq = 0;
    ws.onopen = () => resolve({
      send(method, params){
        return new Promise((res, rej) => {
          const id = ++seq;
          pending.set(id, { res, rej });
          ws.send(JSON.stringify({ id, method, params: params || {} }));
        });
      },
      close(){ try { ws.close(); } catch (e) {} },
    });
    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (!msg.id) return;
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.error) p.rej(new Error(msg.error.message));
      else p.res(msg.result);
    };
    ws.onerror = e => reject(new Error('ws error'));
  });
}

(async function main(){
  const scene = process.argv[2] || 'desk';
  const out = process.argv[3] || ('/tmp/shot-' + scene + '.png');
  const script = SCENES[scene];
  if (!script){ console.error('未知场景:', scene, '可用:', Object.keys(SCENES).join(', ')); process.exit(1); }

  const profile = '/tmp/cdp-prof-' + process.pid;
  const proc = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--disable-crash-reporter', '--hide-scrollbars', '--mute-audio',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
    '--window-size=1440,900', 'about:blank',
  ], { stdio: 'ignore' });

  try{
    let list = null;
    for (let i = 0; i < 40; i++){
      await sleep(250);
      try {
        const r = await fetch('http://127.0.0.1:' + PORT + '/json/list');
        list = await r.json();
        if (list && list.find(t => t.type === 'page')) break;
      } catch (e) {}
    }
    if (!list) throw new Error('无法连接 Chrome');
    const page = list.find(t => t.type === 'page');
    const cdp = await connect(page.webSocketDebuggerUrl);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
    });
    await cdp.send('Page.navigate', { url: URL });
    await sleep(2000);

    const r = await cdp.send('Runtime.evaluate', {
      expression: '(async () => {' + script + '})()',
      awaitPromise: true,
      returnByValue: true,
      timeout: 90000,
    });
    if (r.exceptionDetails){
      console.error('页面脚本异常:', JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
    }
    // SHOT_LOG=1 时打印场景脚本的返回值（用于量尺寸 / 取文本，不必看图猜）
    if (process.env.SHOT_LOG && r.result && r.result.value !== undefined){
      console.log(typeof r.result.value === 'string' ? r.result.value : JSON.stringify(r.result.value, null, 1));
    }
    await sleep(400);

    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
    console.log(out, fs.statSync(out).size, 'bytes');
    cdp.close();
  } finally {
    try { proc.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  }
})();
