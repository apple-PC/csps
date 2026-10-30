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

const SCENES = {
  desk: LOGIN,

  menu: LOGIN + `
    document.getElementById('sAppBtn').click();
    await sleep(200);
  `,

  terminal: LOGIN + `
    document.getElementById('sAppBtn').click();
    await sleep(150);
    [...document.querySelectorAll('#sPop .gp-item')].find(b => b.textContent.includes('终端')).click();
    await sleep(400);
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

  arbiter: LOGIN + `
    [...document.querySelectorAll('.s-icon')].find(i => i.textContent.includes('Arbiter')).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await sleep(400);
  `,

  files: LOGIN + `
    const ic = [...document.querySelectorAll('.s-icon')].find(i => i.textContent.includes('GZ-2026-001'));
    ic.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await sleep(400);
    document.querySelector('.fman-row').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await sleep(300);
  `,

  ide: LOGIN + `
    [...document.querySelectorAll('.s-icon')].find(i => i.textContent.includes('Code::Blocks')).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await sleep(2500);
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
      timeout: 90000,
    });
    if (r.exceptionDetails){
      console.error('页面脚本异常:', JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
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
