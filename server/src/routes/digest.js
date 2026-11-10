const express = require('express');
const dailyDigest = require('../services/dailyDigest');

const router = express.Router();

// 今日推荐（按 deviceId 画像个性化；设备画像未注册时用 query 画像兜底；每日 9:00 cron 预生成）
router.get('/api/digest/today', (req, res) => {
  const fallback = {
    direction: req.query.direction || '',
    city: req.query.city || '',
    education: req.query.education || '',
  };
  const today = dailyDigest.getToday(req.query.deviceId, fallback);
  if (!today.items || !today.items.length) {
    return res.json({ date: today.date, items: [], note: '暂无可推荐岗位' });
  }
  res.json(today);
});

// 按传入画像即时试算推荐（不落库，供前端保存画像后立刻反馈效果）
router.get('/api/digest/preview', (req, res) => {
  const { direction = '', city = '', education = '' } = req.query;
  const items = dailyDigest.generateFor({ direction, city, education });
  res.json({ date: require('../utils/date').todayLocal(), items, preview: true });
});

module.exports = router;
