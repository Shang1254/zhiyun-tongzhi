const express = require('express');
const { renderResumeHTML } = require('../services/resumeBuilder');

const router = express.Router();

/**
 * 服务端简历渲染演示（返回 A4 排版 HTML）。
 * 注意：本接口不保存任何简历数据——用户简历仅存于本人设备本地（前端加密），
 * 符合「绝不上传敏感求职信息」的隐私规则。前端本地渲染优先，此接口用于
 * 服务端模板能力的演示与无前端逻辑场景。
 */
router.post('/api/resume/render', (req, res) => {
  const profile = req.body || {};
  if (!profile.name) return res.status(400).json({ error: '缺少姓名字段' });
  const html = renderResumeHTML(profile);
  res.json({ ok: true, html });
});

module.exports = router;
