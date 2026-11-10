/**
 * 知云同职 - 防骗检测 API
 * 学生粘贴可疑短信/聊天/招聘/链接文案，返回结构化风险报告。
 * 规则库来源与评分修正说明见 services/fraudGuard.js 文件头。
 */
const express = require('express');
const { buildReport } = require('../services/fraudGuard');

const router = express.Router();

router.post('/api/antifraud/check', (req, res) => {
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ error: '请粘贴要检测的文本' });
  if (text.length > 2000) return res.status(400).json({ error: '文本过长（≤2000 字）' });
  const report = buildReport(text);
  res.json({
    ok: true,
    ...report,
    hotline: '96110（反诈专线）/ 110 / 国家反诈中心 App',
    reminder: '检测结果仅供风险提示与教育，不构成法律意见；最终以公安机关认定为准。',
  });
});

module.exports = router;
