/**
 * 知云同职 - 民办生公益求职助手 · 轻后端入口（公网部署版 v1.5）
 *
 * 公益承诺：
 *   - 永久免费、非盈利，无广告、无付费入口
 *   - 全部功能基于本地规则引擎实现，零 AI API 密钥、零第三方付费依赖
 *   - 不上传任何用户敏感求职信息（简历正文仅存用户设备本地，服务端
 *     仅保存匿名化的岗位匹配画像：方向/城市/学历）
 *
 * 上线相关：监听地址、端口、数据目录、限流均可由环境变量控制，详见 src/config.js
 */
const os = require('os');
const path = require('path');
const express = require('express');

const config = require('./config');
const jobStore = require('./services/jobStore');
const cron = require('./cron');
const { createRateLimiter } = require('./utils/rateLimit');

const app = express();
const startedAt = Date.now();

app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', 1); // 云平台/反代后面取真实 IP 用于限流

app.use(express.json({ limit: '2mb' }));

// 基础安全响应头（不引入额外依赖，也不上严格 CSP，避免影响 PDF 导出 iframe）
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

// CORS：允许 APK WebView（file:// 源）与任意设备直连本服务（只读+匿名画像，无敏感数据）
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// 限流：读接口宽松，写接口更严（发布拼车、导入岗位、举报属于写）
app.use('/api', createRateLimiter({ ...config.rateLimit, keyPrefix: 'r:' }));
const writeLimiter = createRateLimiter({ ...config.writeLimit, keyPrefix: 'w:' });
app.use('/api', (req, res, next) => (req.method === 'GET' ? next() : writeLimiter(req, res, next)));

// 静态托管前端（APK WebView 与浏览器共用同一份前端源码）
app.use(express.static(config.webDir, {
  setHeaders(res, filePath) {
    if (/\.(html|webmanifest|json)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache'); // 页面与数据始终取最新，避免公网缓存陈旧
    } else if (/\.(css|js|svg|png|woff2?)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  },
}));

app.use(require('./routes/jobs'));
app.use(require('./routes/resume'));
app.use(require('./routes/user'));
app.use(require('./routes/digest'));
app.use(require('./routes/rides'));
app.use(require('./routes/antifraud'));
app.use(require('./routes/fetcher'));
app.use(require('./routes/admin'));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    app: '知云同职',
    version: config.version,
    slogan: '民办生公益求职助手 · 永久免费',
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    time: new Date().toISOString(),
  });
});

// API 未命中：统一 JSON 404（前端按 HTTP 状态回退离线数据，不会显示 HTML 报错页）
app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }));

// 单页应用回退：非 API 的 GET 一律返回首页（公网部署后深链不会 404）
app.get('*', (req, res, next) => {
  if (req.path.includes('.')) return next();
  res.sendFile(path.join(config.webDir, 'index.html'));
});
app.use((req, res) => res.status(404).send('Not Found'));

app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  res.status(err.status || 500).json({ error: '服务内部错误' });
});

// 初始化：导入演示岗位库（已内置虚假岗对照）→ 启动定时任务
const seedResult = jobStore.loadSeed();
if (!seedResult.skipped) {
  console.log(`[seed] 演示岗位库已导入：${seedResult.total} 条，其中虚假岗 ${seedResult.fakeDetected} 条已自动标记过滤`);
}
if (config.cronEnabled) cron.start();

const server = app.listen(config.port, config.host, () => {
  const nets = os.networkInterfaces();
  const lan = Object.values(nets).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n.address);
  console.log(`\n  知云同职 v${config.version} 服务已启动`);
  console.log(`  本机: http://localhost:${config.port}`);
  lan.forEach((ip) => console.log(`  局域网: http://${ip}:${config.port}`));
  if (config.publicBaseUrl) console.log(`  公网: ${config.publicBaseUrl}`);
  console.log(`  数据目录: ${config.dataDir} · 定时任务: ${config.cronEnabled ? '开启' : '关闭'}\n`);
});

// 优雅退出：云平台滚动发布时会发 SIGTERM，先停止接新请求，再落盘关闭数据库
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] 收到 ${signal}，正在优雅退出…`);
  server.close(() => {
    try { require('./db').db.close(); } catch (e) { /* 已关闭 */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 8000).unref();
}
['SIGTERM', 'SIGINT'].forEach((s) => process.on(s, () => shutdown(s)));

module.exports = { app, server };
