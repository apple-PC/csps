#!/usr/bin/env node
/**
 * 走 GitHub Git Data API 推送当前 HEAD 到 apple-PC/csps。
 *
 * 为什么不用 git push：本机直连 github.com 会报
 *   `Error in the HTTP2 framing layer` / `CONNECT tunnel failed, response 502`。
 *
 * 用法：
 *   node tools/push_api.js            # 自动从 macOS 钥匙串取 token
 *   node tools/push_api.js <token>    # 手动给 token
 *
 * 原理：把本地 `git ls-tree -r HEAD` 的每个文件和远端树比 blob sha，
 * 只上传有变化的，然后用「完整文件列表」建一棵新树（不带 base_tree，
 * 这样远端多出来的文件会被自然删掉），建提交、移分支。
 *
 * 前提：改动必须**先 commit**，脚本推的是 HEAD，不是工作区。
 * 注意：新增目录要先 `git add`，否则 `git ls-tree` 里没有它。
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OWNER = 'apple-PC';
const REPO = 'csps';
const BRANCH = 'main';
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;

function token(){
  if (process.argv[2]) return process.argv[2];
  try {
    const out = execSync("printf 'protocol=https\\nhost=github.com\\n\\n' | git credential fill", {
      cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'],
    });
    const m = out.match(/^password=(.+)$/m);
    if (m) return m[1].trim();
  } catch (e) {}
  throw new Error('取不到 token：请手动传参 node tools/push_api.js <token>');
}

async function api(p, opts = {}, tok){
  const res = await fetch(API + p, {
    ...opts,
    headers: {
      Authorization: `Bearer ${tok}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'csps-push',
      ...(opts.headers || {}),
    },
  });
  const txt = await res.text();
  let json = null;
  try { json = JSON.parse(txt); } catch (e) {}
  if (!res.ok) throw new Error(`${p} → ${res.status} ${txt.slice(0, 400)}`);
  return json;
}

(async () => {
  const tok = token();
  const ref = await api(`/git/ref/heads/${BRANCH}`, {}, tok);
  const parent = ref.object.sha;
  console.log('远端', BRANCH, '=', parent);

  const remoteTree = await api(`/git/trees/${parent}?recursive=1`, {}, tok);
  const remote = new Map((remoteTree.tree || []).map(n => [n.path, n]));

  const entries = execSync('git ls-tree -r HEAD', { cwd: ROOT, encoding: 'utf8' })
    .trim().split('\n').map(line => {
      const m = line.match(/^(\d+) (\w+) ([0-9a-f]{40})\t(.+)$/);
      return { mode: m[1], sha: m[3], path: m[4] };
    });
  const msg = execSync('git log -1 --pretty=%B', { cwd: ROOT, encoding: 'utf8' }).trim();

  const tree = [];
  let up = 0, reuse = 0;
  for (const e of entries){
    const r = remote.get(e.path);
    if (r && r.type === 'blob' && r.sha === e.sha){
      tree.push({ path: e.path, mode: e.mode, type: 'blob', sha: e.sha });
      reuse++;
      continue;
    }
    const buf = fs.readFileSync(path.join(ROOT, e.path));
    const blob = await api('/git/blobs', {
      method: 'POST',
      body: JSON.stringify({ content: buf.toString('base64'), encoding: 'base64' }),
    }, tok);
    tree.push({ path: e.path, mode: e.mode, type: 'blob', sha: blob.sha });
    up++;
    console.log('  ↑', e.path, (buf.length / 1024).toFixed(0) + 'KB');
  }
  console.log(`改动 ${up} 个，复用 ${reuse} 个`);

  const t = await api('/git/trees', { method: 'POST', body: JSON.stringify({ tree }) }, tok);
  const c = await api('/git/commits', {
    method: 'POST',
    body: JSON.stringify({ message: msg, tree: t.sha, parents: [parent] }),
  }, tok);
  await api(`/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: c.sha, force: true }),
  }, tok);
  console.log('✓ 推送完成:', c.sha);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
