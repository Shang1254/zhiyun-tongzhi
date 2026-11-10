/**
 * 知云同职 - 官方岗位采集 · 中国公共招聘网适配器（人社部 job.mohrss.gov.cn）
 *
 * 已实测（2026-11）页面形态：
 *   - 列表页（http，服务端渲染骨架）：岗位数据以 JSON 数组内嵌于
 *     <input id="findjoblist"> 的 value 属性（HTML 实体编码），人社部标准字段码
 *   - 详情页 /cjobs/htmls/cb21gwPages/{acb200}.html：SSR 可见薪资/学历/工作地点
 *
 * 隐私红线：列表 JSON 内含联系人姓名/电话（aae004/aae005），属个人信息，
 * 本适配器一律剔除不存储、不展示；投递引导用户查看岗位原文页。
 * 增量策略：默认每次最多抓 detailLimit 条详情（限速 3s/请求）。
 */
const cheerio = require('cheerio');
const { createSession } = require('./core');
const { mapCategory } = require('./wllm');

const BASE = 'http://job.mohrss.gov.cn';
const LIST_URL = BASE + '/cjobs/jobinfolist/listJobinfolist';
const detailUrl = (jobId) => `${BASE}/cjobs/htmls/cb21gwPages/${jobId}.html`;

/** 解码列表页内嵌 JSON（HTML 实体） */
function extractListJson(html) {
  const decoded = html
    .replace(/&#034;/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
  const m = decoded.match(/id="findjoblist"\s+name="findjoblist"\s+value="(\[.*?\])"/s);
  if (!m) return [];
  try {
    return JSON.parse(m[1]);
  } catch (e) {
    return [];
  }
}

/** 详情页薪资解析："2000元以上/月" / "2000-4000元/月" / "面议" */
function parseMoney(text) {
  const t = (text || '').replace(/\s+/g, '');
  if (!t || t.includes('面议')) return { salaryMin: 0, salaryMax: 0, salaryType: 'monthly' };
  const range = t.match(/(\d+)\s*[-~至到]\s*(\d+)/);
  if (range) return { salaryMin: Number(range[1]), salaryMax: Number(range[2]), salaryType: 'monthly' };
  const above = t.match(/(\d+)元以上/);
  if (above) return { salaryMin: Number(above[1]), salaryMax: 0, salaryType: 'monthly' };
  if (/元\/月|元\/个月/.test(t)) {
    const n = t.match(/(\d+)/);
    if (n) return { salaryMin: Number(n[1]), salaryMax: Number(n[1]), salaryType: 'monthly' };
  }
  if (/元\/天|元\/日/.test(t)) {
    const n = t.match(/(\d+)/);
    if (n) return { salaryMin: Number(n[1]), salaryMax: Number(n[1]), salaryType: 'daily' };
  }
  return { salaryMin: 0, salaryMax: 0, salaryType: 'monthly' };
}

/** 详情页解析（SSR 字段） */
function parseDetail(html, jobId) {
  const $ = cheerio.load(html);
  // 面包屑（span.weizhi 所在行）：网名 > 栏目 > 公司 > 岗位名
  const crumbs = $('span.weizhi').parent().find('a[title]');
  const title = (crumbs.last().attr('title') || '').trim();
  const company = (crumbs.length >= 2 ? $(crumbs[crumbs.length - 2]).attr('title') : '') || '';
  const money = ($('span.money').first().text() || '').trim();
  const salary = parseMoney(money);

  // 标签字段：学历要求 / 工作地点 / 招聘人数 / 岗位职责等成对 span
  const field = {};
  $('span').each((_, el) => {
    const t = $(el).text().trim();
    const m = t.match(/^(学历要求|工作地点|招聘人数|岗位职责|专业要求|发布日期|更新时间|单位性质)：$/);
    if (m) {
      const next = $(el).next('span').text().trim();
      field[m[1]] = next;
    }
  });

  const addr = field['工作地点'] || '';
  let cityMatch = addr.match(/(?:省|自治区)([\u4e00-\u9fa5]{1,4}市)/) || addr.match(/^(北京市|上海市|天津市|重庆市)/);
  let city = cityMatch ? cityMatch[1].replace(/市$/, '') : '';
  // 自治州地名（如"恩施土家族苗族自治州"）取前两字作为城市简称
  const prefecture = addr.match(/(?:省|自治区)([\u4e00-\u9fa5]{2,3}自治州)/);
  if (!city && prefecture) city = prefecture[1].slice(0, 2);
  const eduRaw = field['学历要求'] || '不限';
  const education = ['不限', '其他', '无要求'].includes(eduRaw) ? '不限' : eduRaw;

  if (!title) return null;
  const descParts = [];
  if (field['岗位职责']) descParts.push(field['岗位职责']);
  if (field['专业要求']) descParts.push(`专业要求：${field['专业要求']}。`);
  if (field['工作地点']) descParts.push(`工作地点：${field['工作地点']}。`);
  descParts.push('信息来源：人社部中国公共招聘网（官方渠道），报名与联系方式请查看原文。');

  return {
    id: 'mohrss_' + jobId,
    title,
    company: company || '见原文',
    city,
    district: '',
    category: mapCategory(field['岗位职责'] || '', title),
    ...salary,
    education,
    experience: '不限',
    description: descParts.join(' '),
    requirements: [],
    tags: ['公共招聘网', '官方渠道'],
    postedAt: '', // 由列表 JSON 的发布日期填充
    applyUrl: detailUrl(jobId),
    org: '', // 由列表 JSON 的经办机构填充
  };
}

/**
 * 采集入口
 * @param {{limit?:number, dbExists?:(id:string)=>boolean, onJob?:(job:object)=>void}} opts
 */
async function fetchMohrss(opts = {}) {
  const limit = Math.min(opts.limit || 20, 60); // 单次详情上限（3s/请求，60条约3分钟）
  const session = createSession('mohrss', BASE);
  const report = { site: 'mohrss(中国公共招聘网·人社部)', discovered: 0, fetched: 0, imported: 0, skipped: 0, failed: 0, breaker: false, errors: [] };

  try {
    await session.checkRobots();
    // 1) 列表页：默认按发布时间倒序（增量友好）
    const listHtml = await session.get(LIST_URL);
    const rows = extractListJson(listHtml);
    report.discovered = rows.length;

    let fetched = 0;
    for (const row of rows) {
      if (fetched >= limit) break;
      const jobId = String(row.acb200 || '');
      if (!jobId) continue; // 列表 JSON 不含岗位名（aac112 缺失），岗位名以详情页解析为准
      const key = 'mohrss_' + jobId;
      if (opts.dbExists && opts.dbExists(key)) { report.skipped += 1; continue; }

      try {
        const html = await session.get(detailUrl(jobId));
        fetched += 1;
        report.fetched += 1;
        const job = parseDetail(html, jobId);
        if (!job) { report.failed += 1; continue; }
        // 列表 JSON 补充字段
        job.postedAt = row.s_aae395 || '';
        job.org = row.org_ || '';
        if (row.aab302) job.district = row.aab302;
        if (!job.city && row.area_) job.city = row.area_; // 省级兜底（详情页解析到市则用市）
        // 隐私：列表 JSON 的联系人字段（aae004/aae005/aae006）一律不落库
        if (opts.onJob) opts.onJob(job);
        report.imported += 1;
      } catch (e) {
        if (e.breaker) { report.breaker = true; break; }
        report.failed += 1;
        report.errors.push(`${jobId}: ${e.message}`);
      }
    }
    report.requests = session.state.requests;
    report.retries = session.state.retries;
    if (session.state.breakerTripped) report.breaker = session.state.breakerReason;
  } catch (e) {
    report.requests = session.state.requests;
    report.errors.push(e.message);
    if (e.breaker) report.breaker = e.breaker;
  }
  return report;
}

module.exports = { fetchMohrss, extractListJson, parseDetail, parseMoney };
