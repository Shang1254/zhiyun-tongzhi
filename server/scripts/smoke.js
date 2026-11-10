/**
 * 知云同职 - 上线冒烟检查（npm run smoke -- <url>）
 *
 * 用本机已有的 Edge/Chrome 打开目标地址，检查：
 *   1. 首页可渲染、岗位列表有数据（联网走 API，断网回退内置库）
 *   2. 四个 Tab 可切换、防骗检测能出结果
 *   3. 控制台无严重报错、PWA manifest 可读
 * 结果打印到控制台并输出截图 dist/smoke-<时间>.png
 */
const fs = require('fs');
const path = require('path');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.error('未安装 playwright，请先 cd server && npm install');
  process.exit(1);
}

const target = process.argv[2] || 'http://127.0.0.1:3000';
const outShot = path.join(__dirname, '..', '..', 'dist', `smoke-${Date.now()}.png`);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  const report = { target, checks: [] };
  const add = (name, ok, detail = '') => {
    report.checks.push({ name, ok, detail });
    console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
  };

  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(1200);

  const title = await page.title();
  add('页面标题', /知云同职/.test(title), title);

  await page.waitForSelector('.job-card', { timeout: 8000 }).catch(() => {});
  const jobCount = await page.locator('.job-card').count();
  add('岗位列表渲染', jobCount > 0, `${jobCount} 张岗位卡`);

  // Tab 切换
  for (const tab of ['resume', 'ride', 'me', 'jobs']) {
    await page.click(`.tabbar .tab[data-tab="${tab}"]`).catch(() => {});
    await page.waitForTimeout(150);
  }
  const activeTab = await page.locator('.tabbar .tab.active').getAttribute('data-tab');
  add('Tab 切换', activeTab === 'jobs', `当前 ${activeTab}`);

  // 防骗检测（纯前端规则，静态站也应可用）
  await page.click('.tabbar .tab[data-tab="me"]');
  await page.fill('#af-text', '我是XX学院老师，你的课程要退费，加群领取补贴，先交99元保证金');
  await page.click('#af-check');
  // 公网/隧道下接口有往返延迟，固定 600ms 会误判；等到结果区真正可见
  await page.waitForFunction(() => {
    const el = document.querySelector('#af-result');
    return el && !el.hidden && el.textContent.trim().length > 0;
  }, { timeout: 8000 }).catch(() => {});
  const afVisible = await page.locator('#af-result').isVisible().catch(() => false);
  add('防骗检测可用', afVisible, afVisible ? '返回了研判结果' : '无结果');

  // PWA manifest
  const manifestOk = await page.evaluate(async () => {
    try {
      const r = await fetch('manifest.webmanifest');
      if (!r.ok) return 'HTTP ' + r.status;
      const m = await r.json();
      return m.name ? 'ok:' + m.name : '缺少 name';
    } catch (e) { return e.message; }
  });
  add('PWA manifest', String(manifestOk).startsWith('ok'), manifestOk);

  const fatal = errors.filter((e) => !/favicon|sw\.js|Failed to load resource: the server responded with a status of 404/.test(e));
  add('控制台无严重报错', fatal.length === 0, fatal.slice(0, 3).join(' | '));

  fs.mkdirSync(path.dirname(outShot), { recursive: true });
  await page.screenshot({ path: outShot, fullPage: false });
  console.log(`\n截图：${outShot}`);
  console.log(`结果：${report.checks.filter((c) => c.ok).length}/${report.checks.length} 项通过`);

  await browser.close();
  process.exit(report.checks.every((c) => c.ok) ? 0 : 2);
})().catch((e) => {
  console.error('冒烟检查失败：', e.message);
  process.exit(3);
});
