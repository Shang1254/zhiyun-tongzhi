/**
 * 运行环境自检（部署前必看）
 *   node src/selfcheck.js
 * 用于云平台控制台手工排查：打印版本、路径、数据库状态与关键接口可用性。
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');

function main() {
  const lines = [];
  lines.push(`知云同职 v${config.version} 运行自检`);
  lines.push(`- Node 版本: ${process.version}`);
  lines.push(`- 运行模式: ${process.env.NODE_ENV || 'development'}`);
  lines.push(`- 监听规划: ${config.host}:${config.port}`);
  lines.push(`- 数据目录: ${config.dataDir} (存在: ${fs.existsSync(config.dataDir)})`);
  lines.push(`- 前端目录: ${config.webDir} (存在: ${fs.existsSync(config.webDir)})`);
  lines.push(`- 定时任务: ${config.cronEnabled ? '开启' : '关闭'}`);
  lines.push(`- 限流: API ${config.rateLimit.max}/分钟，写接口 ${config.writeLimit.max}/分钟`);

  try {
    const { db } = require('./db');
    const jobs = db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n;
    const fake = db.prepare('SELECT COUNT(*) AS n FROM jobs WHERE is_fake = 1').get().n;
    const rides = db.prepare('SELECT COUNT(*) AS n FROM rides').get().n;
    lines.push(`- 数据库: 岗位 ${jobs} 条（虚假岗 ${fake} 条），拼车 ${rides} 条`);
  } catch (e) {
    lines.push(`- 数据库: 打开失败 ${e.message}`);
  }

  const webIndex = path.join(config.webDir, 'index.html');
  lines.push(`- 前端入口: ${fs.existsSync(webIndex) ? 'OK' : '缺失 index.html'}`);
  console.log(lines.join('\n'));
}

main();
