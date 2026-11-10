/**
 * 管理接口鉴权（公网部署必需）
 *
 * 规则：
 *   1. 配置了 ZY_ADMIN_TOKEN → 请求头 x-admin-token 或 ?adminToken= 必须匹配
 *   2. 未配置令牌 → 只允许「直连本机」调用（req.ip 为回环地址）
 *
 * 为什么不能用 req.socket.remoteAddress 判断本机：经过 Cloudflare/Nginx/Render
 * 反代后，socket 对端永远是 127.0.0.1，公网请求也会被当成"本机"，等于没有防护。
 */
function isLoopback(ip) {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function requireAdmin(req, res, next) {
  const configured = String(process.env.ZY_ADMIN_TOKEN || '');
  if (configured) {
    const provided = String(req.get('x-admin-token') || req.query.adminToken || '');
    if (provided && provided === configured) return next();
    return res.status(403).json({ error: '需要有效的管理令牌（x-admin-token）' });
  }
  if (isLoopback(req.ip)) return next();
  return res.status(403).json({
    error: '该操作仅限本机直连；公网部署请设置 ZY_ADMIN_TOKEN 并在请求头带 x-admin-token',
  });
}

module.exports = { requireAdmin, isLoopback };
