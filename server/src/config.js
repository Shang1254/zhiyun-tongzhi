/**
 * 知云同职 - 运行时配置（公网部署用）
 * 所有可调项均可用环境变量覆盖，不写死任何地址、端口或密钥。
 *
 * 常用环境变量：
 *   PORT              监听端口（默认 3000，云平台会自动注入）
 *   HOST              监听地址（默认 0.0.0.0，容器/云主机必须如此）
 *   ZY_DATA_DIR       SQLite 与日志目录（默认 server/data；云上挂卷时指向持久盘）
 *   PUBLIC_BASE_URL   对外访问地址，用于生成绝对链接（可留空）
 *   ZY_RATE_LIMIT     每 IP 每分钟 API 请求上限（默认 120）
 *   ZY_WRITE_LIMIT    每 IP 每分钟写接口请求上限（默认 20）
 *   TRUST_PROXY       置 0 表示不信任 X-Forwarded-*（默认信任，云平台反代需要）
 *   ZY_DISABLE_CRON   置 1 关闭定时任务（如部署到不支持长驻的免费实例）
 */
const path = require('path');

const rootDir = path.join(__dirname, '..', '..'); // 项目根目录

module.exports = {
  version: '1.5.1',
  rootDir,
  webDir: path.join(rootDir, 'web'),
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
  dataDir: process.env.ZY_DATA_DIR || path.join(__dirname, '..', 'data'),
  publicBaseUrl: String(process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
  trustProxy: String(process.env.TRUST_PROXY ?? '1') !== '0',
  cronEnabled: String(process.env.ZY_DISABLE_CRON || '') !== '1',
  rateLimit: {
    windowMs: 60 * 1000,
    max: Number(process.env.ZY_RATE_LIMIT) || 120,
  },
  writeLimit: {
    windowMs: 60 * 1000,
    max: Number(process.env.ZY_WRITE_LIMIT) || 20,
  },
};
