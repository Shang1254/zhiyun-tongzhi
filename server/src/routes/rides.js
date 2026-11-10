/**
 * 知云同职 - 拼车同行 API（公益信息公告板）
 *
 * 隐私与安全设计：
 *   - 联系方式为用户主动公开内容；列表接口一律打码，完整联系方式需点击查看
 *   - 删除令牌：发布时一次性返回明文，库中仅存 sha256；凭令牌方可删除
 *   - 反诈关键词过滤拒绝发布；举报即时下架
 *   - 过期数据（出发日 7 天后）由每日 03:00 任务物理清理
 */
const express = require('express');
const { db } = require('../db');
const guard = require('../services/rideGuard');
const { todayLocal } = require('../utils/date');

const router = express.Router();
const today = () => todayLocal();

// 发布
router.post('/api/rides', (req, res) => {
  const v = guard.validateRide(req.body);
  if (!v.ok) return res.status(400).json({ error: v.error, disclaimer: guard.DISCLAIMER });

  const token = guard.newToken();
  const r = v.value;
  const info = db.prepare(
    `INSERT INTO rides (type, from_city, to_city, ride_date, ride_time, seats, contact_type, contact, note, delete_token_hash)
     VALUES (@type, @from_city, @to_city, @ride_date, @ride_time, @seats, @contact_type, @contact, @note, @hash)`
  ).run({ ...r, hash: guard.hashToken(token) });

  res.json({
    ok: true,
    id: info.lastInsertRowid,
    deleteToken: token, // 仅此一次返回，请用户妥善保存（前端会加密存入本机保险库）
    disclaimer: guard.DISCLAIMER,
    note: '发布即视为同意联系方式对其他同学可见；平台仅提供信息展示，不参与组织拼车。',
  });
});

// 列表（打码；仅未过期有效信息）
router.get('/api/rides', (req, res) => {
  const { from = '', to = '', date = '' } = req.query;
  const where = [`status = 'active'`, `ride_date >= ?`];
  const args = [today()];
  if (from) { where.push('from_city LIKE ?'); args.push(`%${from}%`); }
  if (to) { where.push('to_city LIKE ?'); args.push(`%${to}%`); }
  if (date) { where.push('ride_date = ?'); args.push(date); }

  const rows = db.prepare(
    `SELECT id, type, from_city, to_city, ride_date, ride_time, seats, contact_type, contact, note, created_at
     FROM rides WHERE ${where.join(' AND ')} ORDER BY ride_date ASC, created_at DESC LIMIT 100`
  ).all(...args);

  res.json({
    total: rows.length,
    disclaimer: guard.DISCLAIMER,
    list: rows.map((r) => ({
      ...r,
      contact: guard.maskContact(r.contact_type, r.contact),
      contactMasked: true,
    })),
  });
});

// 详情（完整联系方式；前端点击查看时调用）。注意：绝不返回 delete_token_hash
router.get('/api/rides/:id', (req, res) => {
  const row = db.prepare(
    `SELECT id, type, from_city, to_city, ride_date, ride_time, seats, contact_type, contact, note, created_at
     FROM rides WHERE id = ? AND status = 'active' AND ride_date >= ?`
  ).get(req.params.id, today());
  if (!row) return res.status(404).json({ error: '信息不存在或已过期/下架' });
  res.json({ ...row, disclaimer: guard.DISCLAIMER, contactMasked: false });
});

// 删除（凭发布时返回的删除令牌）
router.delete('/api/rides/:id', (req, res) => {
  const token = String((req.body && req.body.token) || '');
  if (!token) return res.status(400).json({ error: '缺少删除令牌' });
  const row = db.prepare('SELECT delete_token_hash FROM rides WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '信息不存在' });
  if (guard.hashToken(token) !== row.delete_token_hash) return res.status(403).json({ error: '删除令牌不正确' });
  db.prepare('DELETE FROM rides WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// 举报（即时下架待处理）
router.post('/api/rides/:id/report', (req, res) => {
  const reason = String((req.body && req.body.reason) || '').slice(0, 200);
  const info = db.prepare(`UPDATE rides SET status = 'hidden' WHERE id = ? AND status = 'active'`).run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: '信息不存在或已下架' });
  res.json({ ok: true, note: '已下架待处理。涉及人身财产安全的问题请直接报警。' });
});

// 统计
router.get('/api/rides/meta/stats', (req, res) => {
  const active = db.prepare(`SELECT COUNT(*) AS n FROM rides WHERE status = 'active' AND ride_date >= ?`).get(today()).n;
  const week = db.prepare(`SELECT COUNT(*) AS n FROM rides WHERE status = 'active' AND ride_date >= ? AND ride_date <= ?`)
    .get(today(), require('../utils/date').addDaysLocal(7)).n;
  res.json({ active, within7days: week });
});

module.exports = router;
