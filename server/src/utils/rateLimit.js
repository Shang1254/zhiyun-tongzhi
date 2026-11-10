/**
 * 极简滑动窗口限流（零依赖）
 * 公网开放后必须防止单 IP 刷接口，公益站点不做账号体系，限流是唯一的滥用防线。
 */
function createRateLimiter({ windowMs = 60000, max = 120, keyPrefix = '' } = {}) {
  const buckets = new Map(); // key -> { count, resetAt }

  // 定期清理过期桶，避免内存无限增长
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }, windowMs);
  if (sweeper.unref) sweeper.unref();

  return function rateLimit(req, res, next) {
    const ip = (req.ip || req.socket?.remoteAddress || 'unknown');
    const key = keyPrefix + ip;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }
    b.count += 1;
    const remaining = Math.max(0, max - b.count);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    if (b.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((b.resetAt - now) / 1000)));
      return res.status(429).json({
        error: '请求太频繁，请稍后再试（公益服务限流保护）',
        retryAfterSec: Math.ceil((b.resetAt - now) / 1000),
      });
    }
    next();
  };
}

module.exports = { createRateLimiter };
