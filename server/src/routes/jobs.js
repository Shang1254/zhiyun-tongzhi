const express = require('express');
const { db } = require('../db');
const jobStore = require('../services/jobStore');
const { requireAdmin } = require('../utils/adminAuth');

const router = express.Router();

function rowToJob(row, { withFlags = false } = {}) {
  const j = {
    id: row.id,
    title: row.title,
    company: row.company,
    province: row.province || '',
    city: row.city,
    district: row.district,
    category: row.category,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    salaryType: row.salary_type,
    education: row.education,
    experience: row.experience,
    description: row.description,
    requirements: JSON.parse(row.requirements || '[]'),
    tags: JSON.parse(row.tags || '[]'),
    source: row.source,
    postedAt: row.posted_at,
    applyUrl: row.apply_url,
    expired: !!row.expired,
    riskScore: row.risk_score,
  };
  if (withFlags) j.riskFlags = JSON.parse(row.risk_flags || '[]');
  return j;
}

// 岗位列表：默认过滤虚假岗；keyword/province/city/category/education 筛选 + 分页
router.get('/api/jobs', (req, res) => {
  const { keyword = '', province = '', city = '', category = '', education = '', show = 'real' } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(50, parseInt(req.query.pageSize) || 20);

  const where = [];
  const args = [];
  if (show === 'real') where.push('is_fake = 0');
  else if (show === 'fake') where.push('is_fake = 1');
  if (province) { where.push('province = ?'); args.push(province); }
  if (city) {
    // 城市规范化后库里是「武汉市」这类全称，前端筛选按钮给的是「武汉」，需要前缀容忍
    where.push('(city = ? OR city LIKE ?)');
    args.push(city, `${city}%`);
  }
  if (category) { where.push('category = ?'); args.push(category); }
  if (education) { where.push('(education = ? OR education = ?)'); args.push(education, '不限'); }
  if (keyword) {
    where.push('(title LIKE ? OR company LIKE ? OR description LIKE ?)');
    args.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const total = db.prepare(`SELECT COUNT(*) AS n FROM jobs ${w}`).get(...args).n;
  const rows = db
    .prepare(`SELECT * FROM jobs ${w} ORDER BY is_fake ASC, posted_at DESC, id ASC LIMIT ? OFFSET ?`)
    .all(...args, pageSize, (page - 1) * pageSize);

  res.json({
    total,
    page,
    pageSize,
    // 虚假岗样本视图需要携带判定理由（防骗教育展示）
    list: rows.map((r) => rowToJob(r, { withFlags: show === 'fake' })),
  });
});

// 岗位详情（含虚假岗判定原因）
router.get('/api/jobs/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '岗位不存在' });
  res.json(rowToJob(row, { withFlags: true }));
});

// 合规数据导入入口（JSON 数组或 CSV 文本），导入前全部经过虚假岗评分引擎
// 管理操作：需本机直连或携带 ZY_ADMIN_TOKEN，避免公网被灌入垃圾岗位
router.post('/api/jobs/import', requireAdmin, (req, res) => {
  const { json, csv } = req.body || {};
  const r = jobStore.importJobs({ json, csv });
  res.json({ ok: true, ...r, note: '所有导入岗位均已通过虚假岗评分引擎复检' });
});

// 库存统计
router.get('/api/jobs/meta/stats', (req, res) => {
  res.json(jobStore.stats());
});

// 全国城市岗位分布统计（省-市两级，仅计有效岗位）
router.get('/api/stats/by-province', (req, res) => {
  const provinces = db.prepare(
    `SELECT province, COUNT(*) AS total FROM jobs WHERE is_fake = 0 AND province != '' GROUP BY province ORDER BY total DESC`
  ).all();
  const cities = db.prepare(
    `SELECT province, city, COUNT(*) AS total FROM jobs WHERE is_fake = 0 AND province != '' AND city != '' GROUP BY province, city ORDER BY total DESC LIMIT 100`
  ).all();
  const noProvince = db.prepare(`SELECT COUNT(*) AS n FROM jobs WHERE is_fake = 0 AND (province = '' OR province IS NULL)`).get().n;
  res.json({ provinces, cities, unclassified: noProvince });
});

// 省份列表（供前端筛选，来自岗位库实际数据 ∪ 城市索引）
router.get('/api/meta/provinces', (req, res) => {
  let fromIndex = [];
  try {
    const { indexSummary } = require('../services/geo');
    fromIndex = indexSummary().provinces.map((p) => p.name);
  } catch (e) { /* 索引未生成时退化为库内数据 */ }
  const inDb = db.prepare(`SELECT DISTINCT province FROM jobs WHERE is_fake = 0 AND province != '' ORDER BY province`).all().map((r) => r.province);
  res.json({ fromIndex, inDb });
});

module.exports = router;
