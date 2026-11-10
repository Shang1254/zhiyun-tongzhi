/**
 * 知云同职 - 官方岗位采集 · 浏览器渲染层（诚实自动化）
 *
 * 背景（2026-11 实测）：91wllm 高校就业网的列表分页与岗位正文只对真实浏览器
 * 引擎开放——服务端纯 HTTP（Node fetch）拿到的 HTML 无数据，页面也无 XHR 端点
 * （已排除 Cookie/UA/请求头/内嵌JSON/静态数据JS 各因素，判定为 TLS/渲染指纹级
 * 区分）。经用户确认，引入 Playwright 渲染采集。
 *
 * 诚实边界（与已拒绝的「指纹伪装」划清界限）：
 *   - 不装 stealth 类反检测插件、不伪造指纹
 *   - navigator.webdriver 标志真实保留（站点可识别自动化访问）
 *   - UA 为引擎原生值，不伪装成特定真人浏览器
 *   - 页面间 3-8 秒随机间隔、运行时 robots 检查、熔断停机 全部沿用
 */
const { chromium } = require('playwright');
const { logLine } = require('./core');

const INTERVAL_MIN_MS = 3000;
const INTERVAL_MAX_MS = 8000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let shared = null; // { browser, ctx } 跨调用复用

async function getContext() {
  if (shared) return shared.ctx;
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chromium', headless: true });
  } catch (e) {
    // channel chromium 不可用时回退默认 headless shell（部分站点可能拒绝，由调用方熔断）
    logLine('renderer', `channel chromium 启动失败（${e.message.slice(0, 60)}），回退默认 headless`);
    browser = await chromium.launch({ headless: true });
  }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  shared = { browser, ctx };
  return ctx;
}

async function closeBrowser() {
  if (shared) {
    try { await shared.browser.close(); } catch (e) { /* 忽略关闭错误 */ }
    shared = null;
  }
}

/**
 * 渲染一个页面并执行提取函数（含 3-8 秒随机限速与熔断状态）
 * @param {{url:string, extract:string, state:{requests:number, breakerTripped:boolean, breakerReason:string}}} opts
 *   extract: 在页面上下文执行的 JS 表达式（返回 JSON 值）
 */
async function renderPage(opts) {
  const { url, extract, state } = opts;
  if (state && state.breakerTripped) throw new Error('[熔断] ' + (state.breakerReason || '已停机'));

  const ctx = await getContext();
  const page = await ctx.newPage();
  try {
    const interval = INTERVAL_MIN_MS + Math.floor(Math.random() * (INTERVAL_MAX_MS - INTERVAL_MIN_MS));
    if (state && state.lastRequestAt) {
      const wait = state.lastRequestAt + interval - Date.now();
      if (wait > 0) await sleep(wait);
    }
    if (state) state.lastRequestAt = Date.now();
    state && (state.requests = (state.requests || 0) + 1);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // 等 AJAX 渲染（列表/正文为前端解码注入）
    await page.waitForTimeout(2200);

    if (extract) return await page.evaluate(extract);
    return null;
  } catch (e) {
    if (state && /ERR_CONNECTION|Timeout|net::/.test(e.message || '')) {
      state.consecutiveSevere = (state.consecutiveSevere || 0) + 1;
      if (state.consecutiveSevere >= 3) {
        state.breakerTripped = true;
        state.breakerReason = '连续渲染失败 3 次，熔断停机';
        logLine('renderer', `[熔断] ${state.breakerReason}`);
      }
    }
    throw e;
  } finally {
    try { await page.close(); } catch (e) { /* 忽略 */ }
  }
}

module.exports = { renderPage, closeBrowser };
