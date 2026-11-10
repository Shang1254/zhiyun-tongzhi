const express = require('express');
const { db } = require('../db');

const router = express.Router();

/**
 * 保存「岗位匹配画像」。
 * 隐私边界：仅接收并存储用于岗位推荐的非敏感字段（求职方向/城市/学历），
 * 与匿名 deviceId 关联；姓名、电话、简历正文等敏感信息一律不上传到服务端，
 * 只保存在用户设备本地并加密存储。
 */
router.post('/api/profile', (req, res) => {
  const { deviceId, direction = '', city = '', education = '' } = req.body || {};
  if (!deviceId) return res.status(400).json({ error: '缺少 deviceId（匿名设备标识）' });
  db.prepare(
    `INSERT INTO profiles (device_id, direction, city, education, updated_at)
     VALUES (?, ?, ?, ?, datetime('now','localtime'))
     ON CONFLICT(device_id) DO UPDATE SET
       direction=excluded.direction, city=excluded.city, education=excluded.education,
       updated_at=datetime('now','localtime')`
  ).run(String(deviceId).slice(0, 64), String(direction).slice(0, 40), String(city).slice(0, 20), String(education).slice(0, 10));
  res.json({ ok: true, saved: { direction, city, education }, sensitiveUploaded: false });
});

router.get('/api/profile/:deviceId', (req, res) => {
  const row = db.prepare('SELECT * FROM profiles WHERE device_id = ?').get(req.params.deviceId);
  res.json(row ? { deviceId: row.device_id, direction: row.direction, city: row.city, education: row.education } : null);
});

module.exports = router;
