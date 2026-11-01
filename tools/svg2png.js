/* 把 SVG 光栅化成透明背景 PNG（没有 rsvg/imagemagick，用本机 Chrome 渲染）
 * 用法: node tools/svg2png.js <in.svg> <out.png> [size=256]
 * 用在从 ISO 抽出的图标上（如 gvim.svg 带 <defs>/clipPath，塞进 noi/ 会因为
 * <base> 让 url(#id) 失效，必须先转成位图）。
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9600 + Math.floor(Math.random() * 200);
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
    ws.onerror = () => reject(new Error('ws error'));
  });
}

(async function main(){
  const src = process.argv[2];
  const out = process.argv[3] || '/tmp/out.png';
  const size = Number(process.argv[4] || 256);
  if (!src || !fs.existsSync(src)){
    console.error('用法: node tools/svg2png.js <in.svg> <out.png> [size]');
    process.exit(1);
  }

  const svg = fs.readFileSync(src, 'utf8');
  const html = '<!doctype html><meta charset="utf-8">' +
    '<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}' +
    'svg{width:' + size + 'px;height:' + size + 'px;display:block}</style>' + svg;
  const url = 'data:text/html;base64,' + Buffer.from(html).toString('base64');

  const profile = '/tmp/cdp-svg-' + process.pid;
  const proc = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--hide-scrollbars', '--mute-audio', '--disable-crash-reporter',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
    '--window-size=' + size + ',' + size, 'about:blank',
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
    const cdp = await connect(list.find(t => t.type === 'page').webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: size, height: size, deviceScaleFactor: 1, mobile: false,
    });
    await cdp.send('Page.navigate', { url });
    await sleep(1200);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
    console.log(out, fs.statSync(out).size, 'bytes');
    cdp.close();
  } finally {
    try { proc.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  }
})();
