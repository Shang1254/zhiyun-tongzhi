/**
 * 知云同职 - 官方岗位采集 · 才立方 91wllm 高校就业联盟适配器
 *
 * 覆盖：武汉晴川学院（优先）等 7 所湖北民办高校 —— 全部共用才立方（91wllm）
 * 同一套系统，站点清单见 data/university-sites.json，改子域名即可扩展。
 *
 * 已实测（2026-11）页面形态：
 *   - 首页 SSR：「最新职位」ul.css-con4 与「招聘公告」ul.css-con1 直接含
 *     链接/标题/公司/日期 —— 用作增量发现
 *   - 详情页 SSR：标题/公司/薪资/地点/学历/职能类别/招聘人数/需求专业/工作地址
 *   - 列表分页与岗位正文为 AJAX 加载，本适配器不依赖（正文用结构化字段生成摘要）
 *   - 岗位库全省共享（同一 /job/view/id/{id} 跨校出现）→ 以全局 id 去重
 */
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { createSession } = require('./core');
const renderer = require('./renderer');

const SITES_PATH = path.join(__dirname, '..', '..', 'data', 'university-sites.json');
const dateStr = () => require('../utils/date').todayLocal();
const normDate = (s) => (s || '').trim().replace(/\./g, '-'); // 2026.11.06 -> 2026-11-06

/** "5000-7000" / "面议" / "150/天" → {min,max,type} */
function parseSalary(text) {
  const t = (text || '').replace(/\s+/g, '');
  if (!t || t.includes('面议')) return { salaryMin: 0, salaryMax: 0, salaryType: 'monthly' };
  const dm = t.match(/(\d+)\s*[-~]\s*(\d+)/);
  if (/天|日/.test(t)) {
    const dm2 = t.match(/(\d+)\s*[-~]?\s*(\d+)?/);
    return { salaryMin: Number(dm2[1]) || 0, salaryMax: Number(dm2[2] || dm2[1]) || 0, salaryType: 'daily' };
  }
  if (dm) return { salaryMin: Number(dm[1]), salaryMax: Number(dm[2]), salaryType: 'monthly' };
  const single = t.match(/(\d+)/);
  if (single) return { salaryMin: Number(single[1]), salaryMax: Number(single[1]), salaryType: 'monthly' };
  return { salaryMin: 0, salaryMax: 0, salaryType: 'monthly' };
}

/** 职能类别文本 → 知云同职类别（用于筛选与每日推荐匹配） */
const CATEGORY_RULES = [
  ['教师', '教育'], ['教务', '教育'], ['老师', '教育'], ['培训', '教育'],
  ['会计', '财务'], ['财务', '财务'], ['审计', '财务'], ['出纳', '财务'],
  ['运营', '运营'], ['新媒体', '运营'], ['编辑', '运营'], ['文案', '运营'], ['直播', '运营'],
  ['客服', '客服'],
  ['行政', '行政'], ['人事', '行政'], ['人力', '行政'], ['助理', '行政'], ['文员', '行政'],
  ['销售', '销售'], ['顾问', '销售'], ['客户经理', '销售'], ['市场', '销售'], ['推广', '销售'], ['商务', '销售'],
  ['设计', '设计'], ['美工', '设计'], ['视觉', '设计'],
  ['物流', '物流'], ['供应链', '物流'], ['采购', '物流'], ['仓', '物流'],
  ['工程', 'IT'], ['开发', 'IT'], ['软件', 'IT'], ['测试', 'IT'], ['运维', 'IT'], ['技术', 'IT'],
  ['前端', 'IT'], ['后端', 'IT'], ['数据', 'IT'], ['网络', 'IT'], ['算法', 'IT'], ['标注', 'IT'],
  ['电商', '电商'], ['跨境', '电商'], ['淘宝', '电商'],
];
function mapCategory(jobCategory, title) {
  const text = `${jobCategory || ''}${title || ''}`;
  for (const [kw, cat] of CATEGORY_RULES) if (text.includes(kw)) return cat;
  return '综合';
}

/** 详情页解析（SSR 结构化字段；正文 AJAX 不依赖） */
function parseJobDetail(html, detailUrl) {
  const $ = cheerio.load(html);
  const title = ($('.title-message h5 span.title').attr('title') || $('.title-message h5 span.title').text() || $('title').text() || '').trim();
  if (!title) return null;

  const company = ($('.unit-info .title a').first().text() || '').trim();
  const salaryText = ($('span.text-orange.salary').first().text() || '').trim();
  // education span: "| 湖北省武汉市 | 不限 | 大专"
  const eduParts = ($('span.education').first().text() || '').split('|').map((s) => s.trim()).filter(Boolean);
  const location = eduParts[0] || '';
  const experience = eduParts[1] || '不限';
  const education = eduParts[2] || '不限';

  let category = '', headcount = '', major = '';
  $('li').each((_, li) => {
    const t = $(li).text();
    if (t.includes('职能类别')) category = $(li).find('span').first().text().trim();
    else if (t.includes('招聘人数')) headcount = $(li).find('span').first().text().trim();
    else if (t.includes('需求专业')) major = ($(li).find('span[title]').attr('title') || $(li).find('span').first().text() || '').trim();
  });
  const address = ($('.address-container p').first().text() || '').trim();

  const salary = parseSalary(salaryText);
  // 正文不可见 —— 用结构化字段生成诚实摘要（不编造）
  const descParts = [`该岗位由高校就业网发布，完整描述请查看原文。`];
  if (major) descParts.push(`需求专业：${major}。`);
  if (headcount) descParts.push(`招聘人数：${headcount}。`);
  if (address) descParts.push(`工作地址：${address}。`);

  return {
    id: 'wllm_' + (detailUrl.match(/\/id\/(\d+)/) || [])[1],
    title,
    company: company || '见原文',
    city: (location.match(/(武汉|黄石|十堰|宜昌|襄阳|鄂州|荆门|孝感|荆州|黄冈|咸宁|随州|恩施|仙桃|潜江|天门)/) || ['武汉'])[0],
    district: '',
    category: mapCategory(category, title),
    ...salary,
    education: education.includes('学历') ? '不限' : (education || '不限'),
    experience: experience || '不限',
    description: descParts.join(' '),
    requirements: [],
    tags: ['高校就业网', '官方渠道'],
    postedAt: dateStr(),
    applyUrl: detailUrl,
    major: major || undefined,
    address: address || undefined,
  };
}

/** 校招公告详情页（标题+发布方+时间 SSR 可见） */
function parseCampusDetail(html, detailUrl) {
  const $ = cheerio.load(html);
  const title = ($('.details-title .title').first().attr('title') || $('.details-title .title').first().text() || $('title').text() || '').trim();
  if (!title) return null;
  const company = ($('.unit-info .title a').first().text() || '').trim();
  return {
    id: 'wllmc_' + (detailUrl.match(/\/id\/(\d+)/) || [])[1],
    title,
    company: company || '见原文',
    city: '武汉',
    district: '',
    category: '校招公告',
    salaryMin: 0, salaryMax: 0, salaryType: 'monthly',
    education: '不限', experience: '不限',
    description: '高校就业网发布的校园招聘公告，报名方式与详情请查看原文。',
    requirements: [],
    tags: ['校招公告', '高校就业网', '官方渠道'],
    postedAt: dateStr(),
    applyUrl: detailUrl,
  };
}

/** 首页 SSR 条目发现 */
function parseHomeLists(html) {
  const $ = cheerio.load(html);
  const jobs = [];
  // 最新职位 ul.css-con4
  $('ul.css-con4 a[href^="/job/view/id/"]').each((_, a) => {
    const href = $(a).attr('href');
    const spans = $(a).find('span');
    jobs.push({
      kind: 'job',
      id: (href.match(/\/id\/(\d+)/) || [])[1],
      title: (spans.eq(0).text() || '').trim(),
      company: (spans.eq(1).text() || '').trim(),
      date: normDate($(a).parent().find('time').first().text()),
      url: new URL(href, 'https://PLACEHOLDER').pathname,
    });
  });
  // 招聘公告 ul.css-con1
  $('ul.css-con1 a[href^="/campus/view/id/"]').each((_, a) => {
    const href = $(a).attr('href');
    jobs.push({
      kind: 'campus',
      id: (href.match(/\/id\/(\d+)/) || [])[1],
      title: ($(a).find('span').first().text() || '').trim(),
      company: '',
      date: normDate($(a).parent().find('time').first().text()),
      url: new URL(href, 'https://PLACEHOLDER').pathname,
    });
  });
  return jobs.filter((j) => j.id);
}

/**
 * 渲染模式列表页提取表达式（在页面上下文执行）：条目 + 分页链接
 */
const LIST_EXTRACT = `(() => {
  const items = [];
  document.querySelectorAll('a[href*="/campus/view/id/"]').forEach((a) => {
    const li = a.closest('li');
    const t = li && li.querySelector('time');
    items.push({ kind: 'campus', href: a.getAttribute('href'), title: a.textContent.trim().slice(0, 80),
      date: t ? t.textContent.trim() : ((li && (li.textContent.match(/\\d{4}[.-]\\d{2}[.-]\\d{2}/)) || [''])[0]) });
  });
  document.querySelectorAll('a[href*="/job/view/id/"]').forEach((a) => {
    const li = a.closest('li');
    const spans = a.querySelectorAll('span');
    const t = li && li.querySelector('time');
    items.push({ kind: 'job', href: a.getAttribute('href'),
      title: (spans[0] ? spans[0].textContent : a.textContent).trim().slice(0, 80),
      company: spans[1] ? spans[1].textContent.trim() : '',
      date: t ? t.textContent.trim() : ((li && (li.textContent.match(/\\d{4}[.-]\\d{2}[.-]\\d{2}/)) || [''])[0]) });
  });
  // 分页：页码/下一页链接（指向本频道且带 page 的）
  const pages = [...new Set([...document.querySelectorAll('a')]
    .map((a) => a.getAttribute('href'))
    .filter((h) => h && /\\/campus|\\/job\\/search/.test(h) && /page/.test(h)))];
  return { items, pages };
})()`;

/** 渲染模式详情页提取表达式：结构化字段 + AJAX 正文 */
const DETAIL_EXTRACT = `(() => {
  const sections = {};
  document.querySelectorAll('h5.mge-title').forEach((h) => {
    const box = h.nextElementSibling || h.parentElement;
    sections[h.textContent.trim()] = box ? box.textContent.trim().replace(/\\s+/g, ' ').slice(0, 2000) : '';
  });
  const eduEl = document.querySelector('span.education');
  const parts = eduEl ? eduEl.textContent.split('|').map((s) => s.trim()).filter(Boolean) : [];
  return {
    sections,
    location: parts[0] || '',
    experience: parts[1] || '',
    education: parts[2] || '',
  };
})()`;

/** 合并渲染详情：把真实正文写进 description（此前为结构化字段摘要） */
function mergeRenderedDetail(job, rendered) {
  if (!rendered) return job;
  const s = rendered.sections || {};
  const body = [s['职位详情'], s['招聘公告详情'], s['单位介绍']].filter(Boolean).join('\n\n');
  if (body) job.description = body.slice(0, 3000);
  if (rendered.education && rendered.education !== '不限') job.education = rendered.education;
  return job;
}

/**
 * 渲染模式采集（单校）：列表分页 → 详情渲染（含正文）
 * 诚实自动化：不隐藏 webdriver、UA 为引擎原生值、页面间 3-8 秒随机间隔。
 */
async function fetchSchoolRendered(site, base, opts, report) {
  const { chromium } = require('playwright');
  const { logLine } = require('./core');
  const schoolStat = { name: site.name, discovered: 0, fetched: 0, imported: 0, skipped: 0, failed: 0, breaker: false, mode: 'rendered' };
  const state = { requests: 0, breakerTripped: false, breakerReason: '', lastRequestAt: 0 };

  let browser;
  let launchErr = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      browser = await chromium.launch({ channel: 'chromium', headless: true });
      break;
    } catch (e) {
      launchErr = e;
      logLine(`wllm-${site.sub}`, `chromium 启动失败（第 ${attempt} 次）: ${e.message.slice(0, 80)}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  if (!browser) {
    try { browser = await chromium.launch({ headless: true }); } catch (e2) {
      throw new Error(`渲染引擎启动失败: ${(launchErr || e2).message.slice(0, 80)}`);
    }
  }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  const sleepMs = () => 3000 + Math.floor(Math.random() * 5000);
  // 单页渲染（含一次超时重试：等待后重试，避免网络抖动直接回退）
  async function gotoRender(url) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(2200);
        return true;
      } catch (e) {
        if (attempt < 2) {
          const backoff = sleepMs() + 5000;
          logLine(`wllm-${site.sub}`, `页面加载超时，${Math.round(backoff / 1000)}s 后重试: ${url.slice(0, 60)}`);
          await page.waitForTimeout(backoff);
        } else {
          state.consecutiveSevere = (state.consecutiveSevere || 0) + 1;
          if (state.consecutiveSevere >= 2) {
            state.breakerTripped = true;
            state.breakerReason = '页面连续加载失败，熔断停机（避免给站点压力）';
            logLine(`wllm-${site.sub}`, `[熔断] ${state.breakerReason}`);
          }
          throw e;
        }
      }
    }
    return false;
  }

  try {
    // 1) 渲染列表第一页
    await gotoRender(base + '/campus');
    let list = await page.evaluate(LIST_EXTRACT);
    schoolStat.discovered = list.items.length;
    report.renderPages = (report.renderPages || 0) + 1;

    // 2) 追加渲染 /job/search 职位列表第一页（岗位池更大）
    await page.waitForTimeout(sleepMs());
    try {
      await gotoRender(base + '/job/search/d_category/100');
      const jobList = await page.evaluate(LIST_EXTRACT);
      list = { items: [...list.items, ...jobList.items], pages: [...(list.pages || []), ...(jobList.pages || [])] };
      schoolStat.discovered += jobList.items.length;
      report.renderPages += 1;
    } catch (e) {
      report.errors.push(`${site.name} 职位列表渲染失败: ${e.message.slice(0, 80)}`);
    }

    // 3) 去重后逐条渲染详情（含正文）
    const seen = new Set();
    let fetched = 0;
    for (const item of list.items) {
      if (fetched >= opts.limit) break;
      const id = (item.href.match(/\/id\/(\d+)/) || [])[1];
      if (!id) continue;
      const key = item.kind + '_' + id;
      if (seen.has(key)) continue;
      seen.add(key);
      if (opts.dbExists && opts.dbExists(key)) { schoolStat.skipped += 1; report.skippedExisting += 1; continue; }

      try {
        await page.waitForTimeout(sleepMs()); // 页面间限速 3-8s 随机
        state.lastRequestAt = Date.now();
        state.requests += 1;
        await gotoRender(base + item.href);
        fetched += 1;
        schoolStat.fetched += 1;
        const rendered = await page.evaluate(DETAIL_EXTRACT);

        const detailUrl = base + item.href;
        const parsed = item.kind === 'job' ? parseJobDetail('', detailUrl) : parseCampusDetail('', detailUrl);
        // 渲染模式下以 DOM 数据为准重建解析（SSR 版解析器吃不到 HTML，改由渲染值填充）
        const job = parsed || {
          id: key,
          title: '',
          company: item.company || '见原文',
          city: '武汉', district: '',
          category: item.kind === 'job' ? '综合' : '校招公告',
          salaryMin: 0, salaryMax: 0, salaryType: 'monthly',
          education: '不限', experience: '不限',
          description: item.kind === 'job' ? '该岗位由高校就业网发布，完整描述请查看原文。' : '高校就业网发布的校园招聘公告，报名方式与详情请查看原文。',
          requirements: [],
        };
        job.id = key;
        job.title = item.title || job.title;
        if (item.kind === 'job') {
          job.company = item.company || job.company || '见原文';
          // 头部信息区在渲染 DOM 中重新取
          const head = await page.evaluate(`(() => {
            const salary = (document.querySelector('span.text-orange.salary') || {}).textContent || '';
            const edu = document.querySelector('span.education');
            const parts = edu ? edu.textContent.split('|').map(s => s.trim()).filter(Boolean) : [];
            const cat = ([...document.querySelectorAll('li')].find(li => li.textContent.includes('职能类别')) || {}).textContent || '';
            return { salary: salary.trim(), location: parts[0] || '', experience: parts[1] || '', education: parts[2] || '', category: cat.replace('职能类别：', '').trim() };
          })()`);
          const salary = parseSalary(head.salary);
          Object.assign(job, {
            salaryMin: salary.salaryMin, salaryMax: salary.salaryMax, salaryType: salary.salaryType,
            city: (head.location.match(/(武汉|黄石|十堰|宜昌|襄阳|鄂州|荆门|孝感|荆州|黄冈|咸宁|随州|恩施)/) || ['武汉'])[0],
            education: head.education || '不限',
            experience: head.experience || '不限',
            category: mapCategory(head.category, job.title),
          });
        }
        if (item.date) job.postedAt = item.date.replace(/\./g, '-');
        job.school = site.name;
        job.tags = [...new Set([...(job.tags || []), site.name, '官方渠道'])];
        job.applyUrl = detailUrl;
        mergeRenderedDetail(job, rendered);
        if (!job.title) { schoolStat.failed += 1; continue; }

        report.found += 1;
        if (opts.onJob) opts.onJob(job);
        schoolStat.imported += 1;
        report.newJobs += 1;
      } catch (e) {
        if (/连续渲染失败/.test(e.message)) { schoolStat.breaker = true; break; }
        schoolStat.failed += 1;
        report.errors.push(`${site.name} ${item.href}: ${e.message.slice(0, 80)}`);
      }
    }
    report.requests = (report.requests || 0) + state.requests;
    report.schools = report.schools || [];
    report.schools.push(schoolStat);
  } catch (e) {
    logLine(`wllm-${site.sub}`, `渲染采集失败: ${e.message.slice(0, 100)}`);
    report.errors.push(`${site.name} 渲染采集失败: ${e.message.slice(0, 100)}`);
    report.schools = report.schools || [];
    report.schools.push({ name: site.name, error: e.message.slice(0, 100), breaker: schoolStat.breaker });
  } finally {
    try { await browser.close(); } catch (e) { /* 忽略 */ }
  }
  return schoolStat;
}

/**
 * 采集入口
 * @param {{limit?:number, dbExists?: (id:string)=>boolean, onJob:(job:object)=>void, siteSub?:string, mode?:'auto'|'ssr'|'rendered'}} opts
 *   mode: auto（默认，渲染可用则渲染）/ ssr（仅首页SSR，无浏览器依赖）/ rendered（强制渲染）
 */
async function fetchWllm(opts = {}) {
  const limit = Math.min(opts.limit || 10, 60);
  const mode = opts.mode || 'auto';

  // 渲染模式：每个启用站点走完整浏览器采集（列表分页+正文）
  if (mode === 'rendered' || mode === 'auto') {
    const sites = JSON.parse(fs.readFileSync(SITES_PATH, 'utf-8')).sites.filter((s) => s.enabled);
    const target = opts.siteSub ? sites.filter((s) => s.sub === opts.siteSub) : sites;
    const report = { site: 'wllm(91wllm高校联盟·渲染模式)', schools: [], requests: 0, found: 0, newJobs: 0, skippedExisting: 0, errors: [], renderPages: 0 };
    let rendererBroken = false;
    for (const site of target) {
      if (rendererBroken) break;
      const base = `https://${site.sub}.91wllm.cn`;
      const before = report.errors.length;
      const stat = await fetchSchoolRendered(site, base, { ...opts, limit }, report);
      // 渲染引擎不可用（启动失败类错误）→ 整体回退 SSR 模式
      if (report.errors.length > before && report.errors.slice(before).some((x) => /渲染采集失败/.test(x)) && !stat.imported) {
        rendererBroken = true;
      }
    }
    if (!rendererBroken) return report;
    const fallbackReason = report.errors.filter((x) => /渲染采集失败/.test(x)).join('；');
    // 落入下方 SSR 路径（原因透传到 SSR 报告，保证可见）
    var ssrFallbackReason = `渲染模式回退 SSR（原因：${fallbackReason || '未知'}）`;
    report.errors.push(ssrFallbackReason);
  }

  // SSR 模式（原路径：首页发现 + 详情字段，无正文）
  const limitSSR = limit;
  const sites = JSON.parse(fs.readFileSync(SITES_PATH, 'utf-8')).sites.filter((s) => s.enabled);
  const target = opts.siteSub
    ? sites.filter((s) => s.sub === opts.siteSub)
    : sites;
  const report = { site: 'wllm(91wllm高校联盟)', schools: [], requests: 0, found: 0, newJobs: 0, skippedExisting: 0, errors: [] };
  if (typeof ssrFallbackReason !== 'undefined' && ssrFallbackReason) report.errors.push(ssrFallbackReason);

  for (const site of target) {
    const base = `https://${site.sub}.91wllm.cn`;
    const session = createSession(`wllm-${site.sub}`, base);
    try {
      await session.checkRobots();
      const schoolStat = { name: site.name, discovered: 0, fetched: 0, imported: 0, skipped: 0, failed: 0, breaker: false };

      // 1) 首页增量发现
      const home = await session.get(base + '/');
      const items = parseHomeLists(home);
      schoolStat.discovered = items.length;

      // 2) 去重（库内 + 本轮）后抓详情，最多 limit 条
      const seen = new Set();
      let fetched = 0;
      for (const item of items) {
        if (fetched >= limitSSR) break;
        const key = item.kind + '_' + item.id;
        if (seen.has(key)) continue;
        seen.add(key);
        if (opts.dbExists && opts.dbExists(key)) { schoolStat.skipped += 1; report.skippedExisting += 1; continue; }

        try {
          const html = await session.get(base + item.url);
          fetched += 1;
          schoolStat.fetched += 1;
          const parsed = item.kind === 'job'
            ? parseJobDetail(html, `${base}/job/view/id/${item.id}`)
            : parseCampusDetail(html, `${base}/campus/view/id/${item.id}`);
          if (!parsed) { schoolStat.failed += 1; continue; }
          if (item.date) parsed.postedAt = item.date;
          parsed.school = site.name;
          parsed.tags = [...(parsed.tags || []), site.name];
          parsed.id = key; // kind_id 全局唯一（联盟共享库跨校去重）
          report.found += 1;
          if (opts.onJob) opts.onJob(parsed);
          schoolStat.imported += 1;
          report.newJobs += 1;
        } catch (e) {
          if (e.breaker) { schoolStat.breaker = true; break; }
          schoolStat.failed += 1;
          report.errors.push(`${site.name} ${item.url}: ${e.message}`);
        }
      }
      report.requests += session.state.requests;
      report.retries = (report.retries || 0) + session.state.retries;
      report.schools.push(schoolStat);
      if (session.state.breakerTripped) { report.breaker = session.state.breakerReason; break; }
    } catch (e) {
      report.requests += session.state.requests;
      report.errors.push(`${site.name}: ${e.message}`);
      report.schools.push({ name: site.name, error: e.message, breaker: !!e.breaker });
      if (e.breaker) break;
    }
  }
  return report;
}

module.exports = { fetchWllm, parseJobDetail, parseCampusDetail, parseHomeLists, parseSalary, mapCategory };
