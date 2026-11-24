#!/usr/bin/env node
/**
 * Jump-Top-Down-Tab 回归测试
 * ------------------------------------------------------------
 * 模拟 Tampermonkey @grant none 的真实注入方式，验证脚本功能在改动后不回退。
 * 覆盖：metadata 合规、按钮显隐三态、明暗配色、动态主题、系统偏好回退、
 *       CSS 对抗、iframe 隔离、重复注入、快捷键边界、按钮交互、无障碍属性。
 *
 * 零第三方依赖：仅用 Node.js 内置模块 + 全局 WebSocket（Node 22+），
 * 通过 Chrome DevTools Protocol 驱动无头浏览器。
 *
 * 用法：
 *   node tests/regression.test.js
 *   JTD_BROWSER=/path/to/chrome JTD_PORT=9400 node tests/regression.test.js
 *
 * 退出码：0 = 全部通过；1 = 存在失败；2 = 环境/运行错误
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

/* ============================ 路径与配置 ============================ */
const ROOT = path.resolve(__dirname, '..');
const USERSCRIPT = path.join(ROOT, 'Jump-Top-Down-Tab.user.js');
const REPORT = path.join(__dirname, 'regression-report.json');
const PORT = Number(process.env.JTD_PORT || 9400);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jtd-test-'));   // 测试页面临时目录
const PROFILE = path.join(TMP, 'browser-profile');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 浏览器探测：优先环境变量，其次常见安装路径
function findBrowser() {
  if (process.env.JTD_BROWSER) return process.env.JTD_BROWSER;
  const candidates = process.platform === 'darwin'
    ? [
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
      ]
    : process.platform === 'win32'
    ? [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      ]
    : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return candidates.find(p => fs.existsSync(p)) || null;
}

/* ============================ 测试页面 ============================ */
function makePage(bg, fg, extraStyle = '', extraBody = '') {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;${bg ? `background:${bg};` : ''}${fg ? `color:${fg};` : ''}font:16px/1.6 -apple-system,sans-serif;}
    section{min-height:320px;padding:24px 40px;border-bottom:1px solid rgba(128,128,128,.3);}
    h1{font-size:22px;margin:0 0 12px;}
    ${extraStyle}
  </style></head><body>
    <section><h1>区域 1 — 顶部</h1><p>第一段文本，用于撑高页面。</p><p>滚动测试区域。</p></section>
    <section><h1>区域 2 — 中部</h1><p>第二段文本，验证按钮在页面中部的显隐状态。</p></section>
    <section><h1>区域 3 — 中下部</h1><p>第三段文本。</p></section>
    <section><h1>区域 4 — 底部</h1><p>最后一段文本，底部表单用于快捷键边界测试。</p>
      <input id="ti" type="text" value="在输入框里按 End" style="display:block;margin:10px 0;padding:8px;width:320px;">
      <textarea id="ta" style="display:block;margin:10px 0;padding:8px;width:320px;height:60px;">在文本域里按 End</textarea>
      <div id="ce" contenteditable="true" style="display:inline-block;margin:10px 0;padding:8px;border:1px solid #888;min-width:200px;">在可编辑区里按 End</div>
      ${extraBody}
    </section>
  </body></html>`;
}
const PAGES = {
  light: makePage('#ffffff', '#222222'),
  dark: makePage('#121212', '#eeeeee'),
  rgba: makePage('rgba(18,18,18,0.96)', '#eeeeee'),
  short: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;background:#fff;color:#222;font:16px sans-serif;padding:20px;}</style></head><body><h1>短页面</h1><p>内容不足一屏，两个按钮都应隐藏，End 不应异常跳转。</p></body></html>`,
  transparent: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;color:#ccc;font:16px sans-serif;padding:20px;}section{min-height:320px;}</style></head><body><section>透明背景，回退系统主题偏好</section><section>第二屏</section><section>第三屏</section><section>第四屏</section></body></html>`,
  aggressive: makePage('#ffffff', '#222222', `*{border-radius:0 !important;color:lime !important;box-shadow:0 0 8px red !important;}`),
  toggle: makePage('#ffffff', '#222222', '', `<button id="tog" onclick="document.body.style.background='#121212';document.body.style.color='#eee';document.body.dataset.theme='dark'">切换深色</button>`),
  iframe: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;background:#fff;font:16px sans-serif;padding:20px;}iframe{width:600px;height:400px;border:1px solid #999;}</style></head><body><h1>顶层页面（应有按钮）</h1><p>下方 iframe 内不应出现按钮。</p><iframe id="f" srcdoc="<style>body{background:#121212;color:#eee;font:16px sans-serif;}section{min-height:200px;}</style><section>iframe 内容</section><section>第二屏</section><section>第三屏</section><section>第四屏</section>"></iframe></body></html>`,
};
Object.entries(PAGES).forEach(([name, html]) => fs.writeFileSync(path.join(TMP, `${name}.html`), html));

/* ============================ 脚本解析 ============================ */
function parseMeta(src) {
  // 注意：结束标记是 // ==/UserScript==，斜杠必须转义
  const m = src.match(/\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/);
  if (!m) return null;
  const tags = {};
  m[1].split('\n').map(l => l.trim()).filter(l => l.startsWith('// @')).forEach(l => {
    const mm = l.match(/^\/\/\s+@([\w:.-]+)\s+(.*)$/);
    if (mm) (tags[mm[1]] ||= []).push(mm[2].trim());
  });
  return tags;
}
const SRC = fs.readFileSync(USERSCRIPT, 'utf8');
const META = parseMeta(SRC);
const SCRIPT_BODY = SRC.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');
// 模拟油猴 @grant none：函数作用域 + call(window)，脚本自身 IIFE 正常运行
const MONKEY_INJECT = `(function(){ ${SCRIPT_BODY} }).call(window);`;
const VERSION = META && META.version && META.version[0];

/* ============================ CDP 客户端 ============================ */
function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
async function makeClient() {
  let targets;
  for (let i = 0; i < 80; i++) {
    try { targets = await getJSON(`http://127.0.0.1:${PORT}/json/list`); break; }
    catch (e) { await sleep(250); }
  }
  if (!targets) throw new Error('DevTools 端口未就绪，浏览器可能未启动');
  const page = targets.find(t => t.type === 'page');
  if (!page) throw new Error('未找到可用的 page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const events = [];
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) events.push(msg.method);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id; pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception));
    return r.result.value;
  };
  return { send, evaluate, events, ws };
}

/* ============================ 断言收集 ============================ */
const checks = [];
function ck(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
}

/* ============================ 主测试流程 ============================ */
async function run(c) {
  await c.send('Page.enable');
  await c.send('Runtime.enable');
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  /* --- A. metadata 合规（版本只做存在性校验，不写死值，便于跨版本回归） --- */
  ck('metadata: 存在 UserScript 块', !!META);
  ck('metadata: @name 存在', !!(META && META.name && META.name[0]));
  ck('metadata: @version 存在且非空', !!(META && META.version && META.version[0]), VERSION);
  ck('metadata: @include *', !!(META && META.include && META.include.includes('*')));
  ck('metadata: @grant none', !!(META && META.grant && META.grant.includes('none')));
  ck('metadata: @run-at document-idle（油猴合法值）', !!(META && META['run-at'] && META['run-at'][0] === 'document-idle'), META && META['run-at']);
  ck('grant none 兼容: 脚本无 GM_ API 调用', !/\bGM_[a-zA-Z]/.test(SCRIPT_BODY));

  const visit = async name => {
    await c.send('Page.navigate', { url: `file://${path.join(TMP, `${name}.html`)}` });
    for (let i = 0; i < 50 && !c.events.includes('Page.loadEventFired'); i++) await sleep(200);
    c.events.length = 0; await sleep(200); c.events.length = 0;
  };
  const inject = async () => { await c.evaluate(MONKEY_INJECT); await sleep(500); };
  const snap = () => c.evaluate(`(() => {
    const pick = id => {
      const el = document.getElementById(id);
      if (!el) return { exists:false };
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      return { exists:true, display:cs.display, visibility:cs.visibility, bg:cs.backgroundColor,
        color:cs.color, radius:cs.borderRadius, border:cs.borderStyle+' '+cs.borderWidth,
        shadow:cs.boxShadow, w:Math.round(r.width), h:Math.round(r.height),
        role:el.getAttribute('role'), tabindex:el.tabIndex, ariaLabel:el.getAttribute('aria-label'),
        ariaHidden:el.getAttribute('aria-hidden') };
    };
    return { scrollY:Math.round(window.scrollY), maxScroll:Math.max(0,document.documentElement.scrollHeight-window.innerHeight),
      count:document.querySelectorAll('#top-jump-button,#bottom-jump-button').length,
      top:pick('top-jump-button'), bottom:pick('bottom-jump-button') };
  })()`);
  const scrollTo = async y => { await c.evaluate(`window.scrollTo(0,${y})`); await sleep(1000); };
  const key = async (k, code, vk, mods = 0) => {
    // 空格键必须带 text:' ' 才能被 CDP 正确投递为 e.key === ' '
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods, text: k === ' ' ? ' ' : undefined });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
    await sleep(1200);
  };

  /* --- B. 浅色页三态 + 无障碍 --- */
  await visit('light'); await inject();
  let s = await snap();
  ck('浅色页: 注入后恰好 2 个按钮', s.count === 2, s.count);
  ck('浅色页: 顶部显示 ↓ 隐藏 ↑', s.top.display === 'none' && s.bottom.display === 'flex', `${s.top.display}/${s.bottom.display}`);
  ck('浅色页: 深青配色 rgb(15,110,86)', s.bottom.bg === 'rgb(15, 110, 86)', s.bottom.bg);
  ck('浅色页: 白字', s.bottom.color === 'rgb(255, 255, 255)', s.bottom.color);
  ck('样式: 38×38 圆角10px 无边框无阴影', s.bottom.w === 38 && s.bottom.h === 38 && s.bottom.radius === '10px' && s.bottom.border.indexOf('none') === 0 && s.bottom.shadow === 'none', `${s.bottom.w}x${s.bottom.h} r=${s.bottom.radius}`);
  ck('无障碍: role/tabindex/aria-label/aria-hidden', s.bottom.role === 'button' && s.bottom.tabindex === 0 && /跳转到底部/.test(s.bottom.ariaLabel) && s.bottom.ariaHidden === 'false', `${s.bottom.role}/${s.bottom.tabindex}`);
  await scrollTo(Math.round(s.maxScroll / 2)); s = await snap();
  ck('浅色页: 中部两个按钮同时显示', s.top.display === 'flex' && s.bottom.display === 'flex', `${s.top.display}/${s.bottom.display}`);
  ck('浅色页: 中部 aria-hidden 均为 false', s.top.ariaHidden === 'false' && s.bottom.ariaHidden === 'false');
  await scrollTo(s.maxScroll); s = await snap();
  ck('浅色页: 底部显示 ↑ 隐藏 ↓', s.top.display === 'flex' && s.bottom.display === 'none', `${s.top.display}/${s.bottom.display}`);
  ck('浅色页: 底部 ↑ 的 aria-hidden=false、↓ 的 true', s.top.ariaHidden === 'false' && s.bottom.ariaHidden === 'true', `${s.top.ariaHidden}/${s.bottom.ariaHidden}`);

  /* --- C. 快捷键边界 --- */
  await key('Home', 'Home', 36); ck('快捷键: Home 回顶', (await snap()).scrollY === 0, (await snap()).scrollY);
  await key('End', 'End', 35); const afterEnd = (await snap()).scrollY; ck('快捷键: End 到底', afterEnd > 0, afterEnd);
  // 可编辑元素在视口外时，focus/按键会触发浏览器原生「把焦点元素滚回视口」（无脚本同样如此）。
  // 正确测法：把元素临时移到页顶并 focus，scrollY≈0；按 End 若被劫持会跳到 maxScroll。
  async function editableEndTest(id, label) {
    await c.evaluate(`(() => {
      const el = document.getElementById('${id}');
      el.__origParent = el.parentNode; el.__origNext = el.nextSibling;
      document.body.insertBefore(el, document.body.firstChild);
      el.focus(); window.scrollTo(0,0);
    })()`);
    await sleep(500);
    const before = (await snap()).scrollY;
    await key('End', 'End', 35);
    const after = (await snap()).scrollY;
    const maxScroll = (await snap()).maxScroll;
    ck(`${label}: End 未被劫持到页尾`, before === 0 && after < maxScroll / 2, `${before}→${after}, max=${maxScroll}`);
    await c.evaluate(`(() => { const el=document.getElementById('${id}'); if(el.__origNext) el.__origParent.insertBefore(el,el.__origNext); else el.__origParent.appendChild(el); el.blur(); })()`);
    await sleep(300);
  }
  await editableEndTest('ti', '输入框聚焦');
  await editableEndTest('ta', '文本域聚焦');
  await editableEndTest('ce', '可编辑区聚焦');
  await c.evaluate(`document.activeElement.blur();window.scrollTo(0,300);`); await sleep(300);
  await key('Home', 'Home', 36, 1); ck('修饰键: Alt+Home 不触发脚本回滚', (await snap()).scrollY === 300, (await snap()).scrollY);
  await key('End', 'End', 35, 2); ck('修饰键: Ctrl+End 不触发脚本滚底', (await snap()).scrollY === 300, (await snap()).scrollY);

  /* --- D. 按钮交互 --- */
  await c.evaluate(`document.getElementById('bottom-jump-button').click()`); await sleep(1200); ck('点击 ↓ 滚到底部', (await snap()).scrollY > 0, (await snap()).scrollY);
  await c.evaluate(`document.getElementById('top-jump-button').click()`); await sleep(1200); ck('点击 ↑ 回到顶部', (await snap()).scrollY === 0, (await snap()).scrollY);
  await c.evaluate(`document.getElementById('bottom-jump-button').focus()`); await sleep(200);
  await key('Enter', 'Enter', 13); ck('键盘: 聚焦按钮按 Enter 滚到底部', (await snap()).scrollY > 0, (await snap()).scrollY);
  await c.evaluate(`document.getElementById('top-jump-button').click();window.scrollTo(0,0);document.getElementById('bottom-jump-button').focus()`); await sleep(1200);
  await key(' ', 'Space', 32); ck('键盘: 聚焦按钮按空格滚到底部', (await snap()).scrollY > 0, (await snap()).scrollY);

  /* --- E. 重复注入防护 --- */
  await inject(); s = await snap();
  ck('重复注入: 二次注入后仍为 2 个按钮', s.count === 2, s.count);

  /* --- F. 深色页与 rgba --- */
  await visit('dark'); await inject(); s = await snap();
  ck('深色页: 柔和青配色 rgb(78,205,196)', s.bottom.bg === 'rgb(78, 205, 196)', s.bottom.bg);
  ck('深色页: 深字 rgb(8,46,43)', s.bottom.color === 'rgb(8, 46, 43)', s.bottom.color);
  await visit('rgba'); await inject(); s = await snap();
  ck('rgba 半透明深色背景: 正确识别为深色', s.bottom.bg === 'rgb(78, 205, 196)', s.bottom.bg);

  /* --- G. 动态主题切换（MutationObserver） --- */
  await visit('toggle'); await inject(); s = await snap();
  ck('动态主题: 初始浅色深青', s.bottom.bg === 'rgb(15, 110, 86)', s.bottom.bg);
  await c.evaluate(`document.getElementById('tog').click()`); await sleep(600); s = await snap();
  ck('动态主题: 切换深色后自动变柔和青', s.bottom.bg === 'rgb(78, 205, 196)', s.bottom.bg);

  /* --- H. 系统偏好回退 --- */
  await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await visit('transparent'); await inject(); s = await snap();
  ck('透明背景 + 系统深色偏好: 回退为柔和青', s.bottom.bg === 'rgb(78, 205, 196)', s.bottom.bg);
  await c.send('Emulation.setEmulatedMedia', { features: [] });

  /* --- I. CSS 对抗 --- */
  await visit('aggressive'); await inject(); s = await snap();
  ck('CSS对抗: 页面强制圆角0下按钮仍为10px', s.bottom.radius === '10px', s.bottom.radius);
  ck('CSS对抗: 按钮配色未被 color!important 覆盖', s.bottom.color === 'rgb(255, 255, 255)', s.bottom.color);
  ck('CSS对抗: 按钮 display:flex 未被破坏', s.bottom.display === 'flex', s.bottom.display);

  /* --- J. 短页面 --- */
  await visit('short'); await inject(); s = await snap();
  ck('短页面: maxScroll=0', s.maxScroll === 0, s.maxScroll);
  ck('短页面: 两个按钮都隐藏', s.top.display === 'none' && s.bottom.display === 'none', `${s.top.display}/${s.bottom.display}`);
  await key('End', 'End', 35); ck('短页面: End 不乱跳（scrollY=0）', (await snap()).scrollY === 0, (await snap()).scrollY);

  /* --- K. iframe 隔离 --- */
  await visit('iframe'); await inject(); s = await snap();
  ck('iframe: 顶层页面有 2 个按钮', s.count === 2, s.count);
  const iframeCount = await c.evaluate(`(() => { const f=document.getElementById('f'); try { return f.contentDocument.querySelectorAll('#top-jump-button,#bottom-jump-button').length; } catch(e){ return -1; } })()`);
  ck('iframe: 内部无按钮（顶层判断生效）', iframeCount === 0, iframeCount);
  await c.evaluate(`(() => { const f=document.getElementById('f'); const s=${JSON.stringify(MONKEY_INJECT)}; try{ f.contentWindow.eval(s); return 'ok'; }catch(e){ return 'err:'+e.message; } })()`);
  await sleep(400);
  const iframeCount2 = await c.evaluate(`(() => document.getElementById('f').contentDocument.querySelectorAll('#top-jump-button,#bottom-jump-button').length)()`);
  ck('iframe: 显式在 iframe 内注入后仍无按钮', iframeCount2 === 0, iframeCount2);
}

/* ============================ 入口：启动浏览器 → 测试 → 清理 ============================ */
(async () => {
  if (typeof WebSocket === 'undefined') {
    throw new Error('当前 Node.js 无全局 WebSocket，请使用 Node 22+');
  }
  const browser = findBrowser();
  if (!browser) throw new Error('未找到浏览器，请设置 JTD_BROWSER 环境变量指向 Chrome/Edge/Chromium 可执行文件');

  const proc = spawn(browser, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-crash-reporter',
    '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--window-size=1280,900', 'about:blank',
  ], { stdio: 'ignore' });

  let client;
  try {
    client = await makeClient();
    await run(client);
  } finally {
    if (client) client.ws.close();
    try { proc.kill('SIGTERM'); } catch (e) { /* 已退出 */ }
  }

  const passed = checks.filter(x => x.ok).length;
  const failed = checks.filter(x => !x.ok);
  const report = {
    script: path.relative(ROOT, USERSCRIPT),
    version: VERSION,
    browser: path.basename(browser),
    runAt: new Date().toISOString(),
    total: checks.length,
    passed,
    failed: failed.length,
    checks,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));

  console.log('\n========== Jump-Top-Down-Tab 回归测试 ==========');
  console.log(`版本 ${VERSION} | 浏览器 ${path.basename(browser)}`);
  console.log(`总计 ${checks.length} 项，通过 ${passed}，失败 ${failed.length}`);
  if (failed.length) {
    console.log('\n--- 失败项 ---');
    failed.forEach(f => console.log(`FAIL [${f.name}] 实际值: ${f.detail}`));
  }
  console.log(`\n报告已写入: ${path.relative(ROOT, REPORT)}`);
  console.log(`临时文件: ${TMP}`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => {
  console.error('运行错误:', e.message);
  // 尽力清理临时目录
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (ignore) {}
  process.exit(2);
});
