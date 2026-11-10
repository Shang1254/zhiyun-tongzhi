const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const REPORT_DIR = path.join(require('../config').dataDir, 'reports');

// 最近一次采集报告（本地生成的 Markdown）
router.get('/api/fetcher/last-report', (req, res) => {
  if (!fs.existsSync(REPORT_DIR)) return res.json({ exists: false });
  const files = fs.readdirSync(REPORT_DIR).filter((f) => f.startsWith('fetch-') && f.endsWith('.md')).sort();
  if (!files.length) return res.json({ exists: false });
  const file = files[files.length - 1];
  const content = fs.readFileSync(path.join(REPORT_DIR, file), 'utf-8');
  // 只取最后一次运行块（## 采集运行 ... 到文末）
  const runs = content.split(/\n(?=## 采集运行)/);
  res.json({ exists: true, file, lastRun: runs[runs.length - 1], updatedAt: fs.statSync(path.join(REPORT_DIR, file)).mtime });
});

module.exports = router;
