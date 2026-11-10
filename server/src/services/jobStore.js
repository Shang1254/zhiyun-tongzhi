/**
 * 知云同职 - 岗位库存取与生命周期管理
 *  - loadSeed: 首次启动导入内置演示岗位库（自动过一遍虚假岗评分引擎）
 *  - refreshAll: 每日凌晨复检（重新评分 + 超 30 天标记可能过期）
 *  - importJobs: 合规数据接入入口（JSON 数组 / CSV 文本）
 */
const fs = require('fs');
const path = require('path');
const { db, meta } = require('../db');
const { assess } = require('./jobFilter');
const { normalizeRegion } = require('./geo');

const SEED_PATH = path.join(__dirname, '..', '..', 'data', 'seed-jobs.json');

function upsertJob(job) {
  const r = assess(job);
  // 省-市-区县规范化（依赖工作区根目录 national_city_index.csv，未生成时 province 为空）
  let region = { province: '', city: job.city, district: job.district };
  try {
    region = normalizeRegion(job);
  } catch (e) { /* 地理规范化失败不阻断入库 */ }

  db.prepare(
    `INSERT INTO jobs (id, title, company, province, city, district, category, salary_min, salary_max, salary_type,
       education, experience, description, requirements, tags, source, posted_at, apply_url,
       risk_score, risk_flags, is_fake, expired, updated_at)
     VALUES (@id, @title, @company, @province, @city, @district, @category, @salaryMin, @salaryMax, @salaryType,
       @education, @experience, @description, @requirements, @tags, @source, @postedAt, @applyUrl,
       @riskScore, @riskFlags, @isFake, 0, datetime('now','localtime'))
     ON CONFLICT(id) DO UPDATE SET
       title=excluded.title, company=excluded.company, province=excluded.province, city=excluded.city, district=excluded.district,
       category=excluded.category, salary_min=excluded.salary_min, salary_max=excluded.salary_max,
       salary_type=excluded.salary_type, education=excluded.education, experience=excluded.experience,
       description=excluded.description, requirements=excluded.requirements, tags=excluded.tags,
       source=excluded.source, posted_at=excluded.posted_at, apply_url=excluded.apply_url,
       risk_score=excluded.risk_score, risk_flags=excluded.risk_flags, is_fake=excluded.is_fake,
       expired=excluded.expired, updated_at=datetime('now','localtime')`
  ).run({
    company: '', city: '', district: '', category: '', salaryType: 'monthly',
    education: '不限', experience: '不限', description: '', tags: [], postedAt: '', applyUrl: '',
    ...job,
    province: region.province,
    city: region.city,
    district: region.district,
    requirements: JSON.stringify(job.requirements || []),
    tags: JSON.stringify(job.tags || []),
    riskScore: r.score,
    riskFlags: JSON.stringify(r.flags),
    isFake: r.isFake ? 1 : 0,
    source: job.source || 'demo',
  });
  return r;
}

function loadSeed() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n;
  if (count > 0) return { skipped: true, count };
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf-8'));
  let fake = 0;
  seed.jobs.forEach((j) => {
    const r = upsertJob({ ...j, source: j.id.startsWith('fake_') ? 'demo-fake' : 'demo' });
    if (r.isFake) fake += 1;
  });
  meta.set('seed_loaded_at', new Date().toISOString());
  return { skipped: false, total: seed.jobs.length, fakeDetected: fake };
}

/** 每日凌晨任务：全量复检 + 过期标记（发布超 30 天） */
function refreshAll() {
  const rows = db.prepare('SELECT * FROM jobs').all();
  let reflagged = 0;
  let expired = 0;
  const cutoff = Date.now() - 30 * 86400000;

  for (const row of rows) {
    const job = {
      id: row.id, title: row.title, company: row.company, city: row.city, district: row.district,
      category: row.category, salaryMin: row.salary_min, salaryMax: row.salary_max,
      salaryType: row.salary_type, education: row.education, experience: row.experience,
      description: row.description, requirements: JSON.parse(row.requirements || '[]'),
      tags: JSON.parse(row.tags || '[]'), postedAt: row.posted_at, applyUrl: row.apply_url,
    };
    const r = assess(job);
    const isExpired = row.posted_at && new Date(row.posted_at) < cutoff ? 1 : 0;
    if (r.score !== row.risk_score || (r.isFake ? 1 : 0) !== row.is_fake) reflagged += 1;
    if (isExpired !== row.expired) expired += 1;
    db.prepare('UPDATE jobs SET risk_score=?, risk_flags=?, is_fake=?, expired=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
      .run(r.score, JSON.stringify(r.flags), r.isFake ? 1 : 0, isExpired, row.id);
  }
  meta.set('last_refresh_at', new Date().toISOString());
  return { total: rows.length, reflagged, newlyExpired: expired, at: meta.get('last_refresh_at') };
}

/** CSV 简易解析（首行表头，逗号分隔；适合从公开渠道人工整理的数据导入） */
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const head = lines[0].split(',').map((h) => h.trim());
  const map = {
    id: 'id', title: 'title', 职位: 'title', company: 'company', 公司: 'company',
    city: 'city', 城市: 'city', category: 'category', 类别: 'category',
    salary_min: 'salaryMin', 薪资下限: 'salaryMin', salary_max: 'salaryMax', 薪资上限: 'salaryMax',
    salary_type: 'salaryType', 薪资类型: 'salaryType', education: 'education', 学历: 'education',
    description: 'description', 描述: 'description', posted_at: 'postedAt', 发布日期: 'postedAt',
  };
  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim());
    const obj = {};
    head.forEach((h, i) => { const k = map[h]; if (k && cols[i] != null) obj[k] = cols[i]; });
    if (obj.salaryMin != null) obj.salaryMin = Number(obj.salaryMin) || 0;
    if (obj.salaryMax != null) obj.salaryMax = Number(obj.salaryMax) || 0;
    return obj;
  }).filter((o) => o.title);
}

/** 导入外部岗位（JSON 数组或 CSV 文本），全部经虚假岗评分引擎后入库 */
function importJobs({ json, csv }) {
  let list = [];
  if (Array.isArray(json)) list = json;
  else if (typeof csv === 'string' && csv.trim()) list = parseCSV(csv);
  if (!list.length) return { imported: 0, fakeDetected: 0 };

  let fake = 0;
  const ids = [];
  list.forEach((j, i) => {
    if (!j.title) return;
    const id = j.id || `imp_${Date.now()}_${i}`;
    const r = upsertJob({ ...j, id, source: j.source || 'import' });
    ids.push(id);
    if (r.isFake) fake += 1;
  });
  return { imported: ids.length, fakeDetected: fake };
}

function stats() {
  const total = db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n;
  const fake = db.prepare('SELECT COUNT(*) AS n FROM jobs WHERE is_fake = 1').get().n;
  const expired = db.prepare('SELECT COUNT(*) AS n FROM jobs WHERE expired = 1 AND is_fake = 0').get().n;
  return {
    total,
    fakeFiltered: fake,
    expired,
    available: total - fake,
    lastRefreshAt: meta.get('last_refresh_at'),
    lastDigestAt: meta.get('last_digest_at'),
  };
}

module.exports = { loadSeed, refreshAll, importJobs, stats, upsertJob };
