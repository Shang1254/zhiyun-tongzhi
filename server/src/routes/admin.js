const express = require('express');
const cron = require('../cron');
const { requireAdmin } = require('../utils/adminAuth');

const router = express.Router();

/**
 * 手动触发定时任务（仅限本机直连，或携带 ZY_ADMIN_TOKEN；用于验收与运维）。
 *   POST /api/admin/run-now?task=refresh|digest|fetch|all
 * fetch 为限速采集（约 1-3 分钟），请求会等待其完成后返回报告路径。
 * 公网部署必须设置 ZY_ADMIN_TOKEN，否则一律拒绝非本机请求。
 */
router.post('/api/admin/run-now', requireAdmin, async (req, res) => {
  try {
    const result = await cron.runNow(req.query.task || 'all');
    res.json({ ok: true, result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
