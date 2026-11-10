/**
 * 知云同职 - 官方岗位采集 · 礼貌爬取核心
 *
 * 合规原则（与 docs/官方岗位采集Agent提示词.md 一致）：
 *   1. 只采集政府公共就业服务平台与高校就业网的公开页面，不登录、不破解验证码
 *   2. 可识别 UA（不伪装浏览器），让对方站点能识别并联系我们
 *   3. 并发 1，请求间隔 >= 3000ms，不干扰站点正常服务
 *   4. 每次运行先获取并遵守 robots.txt；被 Disallow 的路径直接跳过
 *   5. 失败重试 3 次（指数退避）；403/429/连续 5xx 触发熔断，当日停止该站点
 *   6. 日志仅本地留存（server/data/logs/），绝不上传
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const LOG_DIR = path.join(require('../config').dataDir, 'logs');
const UA = 'ZhiyunTongzhi-PublicJobBot/1.0 (+public-service job aggregator for college students; polite crawler, 3-8s interval; local-only logs)';
const INTERVAL_MIN_MS = 3000; // 单站点请求间隔下限
const INTERVAL_MAX_MS = 8000; // 上限：区间随机，避免固定节奏被误判为机器流量，也绝不高频轰炸
const MAX_RETRIES = 3;
const BREAKER_THRESHOLD = 3; // 连续 N 次严重错误（403/429/5xx）熔断

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

/** 本次请求应等待的间隔（3-8 秒随机） */
function nextIntervalMs() {
  return INTERVAL_MIN_MS + Math.floor(Math.random() * (INTERVAL_MAX_MS - INTERVAL_MIN_MS));
}

function logLine(site, msg) {
  const date = require('../utils/date').todayLocal(); // 日志按本地日期归档（00:00 采集不会落到前一天）
  const line = `[${new Date().toISOString()}] [${site}] ${msg}`;
  fs.appendFileSync(path.join(LOG_DIR, `fetch-${date}.log`), line + '\n');
  return line;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodeBody(buf, contentType = '') {
  const encoding = (contentType.match(/charset=([\w-]+)/i) || [])[1] || 'utf-8';
  try {
    return new TextDecoder(encoding).decode(buf);
  } catch (e) {
    return new TextDecoder('utf-8').decode(buf);
  }
}

/**
 * 创建一个站点采集会话：串行请求 + 限速 + robots 检查 + 熔断 + 重试 + 日志
 */
function createSession(siteKey, baseUrl) {
  const state = {
    requests: 0,
    retries: 0,
    breakerTripped: false,
    breakerReason: '',
    consecutiveSevere: 0,
    robotsAllowed: null, // null=未检查
    lastRequestAt: 0,
  };

  const origin = new URL(baseUrl).origin;

  async function checkRobots() {
    try {
      const res = await fetch(origin + '/robots.txt', {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(15000),
      });
      const text = await res.text();
      if (res.ok && /user-agent\s*:/i.test(text)) {
        // 解析适用于 * 的 Disallow 规则
        const disallows = [];
        let inStar = false;
        for (const raw of text.split(/\r?\n/)) {
          const line = raw.trim();
          if (/^user-agent\s*:/i.test(line)) inStar = /\*\s*$/.test(line.split(':')[1] || '');
          else if (inStar && /^disallow\s*:/i.test(line)) {
            const v = (line.split(':').slice(1).join(':') || '').trim();
            if (v) disallows.push(v);
          }
        }
        state.robotsAllowed = disallows;
        logLine(siteKey, `robots.txt: ${disallows.length} 条 Disallow 规则`);
      } else {
        state.robotsAllowed = [];
        logLine(siteKey, `robots.txt: 无有效规则（HTTP ${res.status} 或空），按允许处理`);
      }
    } catch (e) {
      state.robotsAllowed = [];
      logLine(siteKey, `robots.txt 获取失败（${e.message}），按允许处理并继续限速`);
    }
  }

  function robotsDisallows(urlPath) {
    if (!state.robotsAllowed) return false;
    return state.robotsAllowed.some((d) => urlPath.startsWith(d));
  }

  async function get(url, { timeoutMs = 20000 } = {}) {
    if (state.breakerTripped) {
      const err = new Error(`[熔断] ${siteKey} 今日已停止采集：${state.breakerReason}`);
      err.breaker = true;
      throw err;
    }
    const urlPath = new URL(url).pathname + (new URL(url).search || '');
    if (robotsDisallows(urlPath)) {
      const err = new Error(`[robots] ${urlPath} 被 robots.txt Disallow，已跳过`);
      err.robots = true;
      throw err;
    }

    // 限速：与上次请求间隔 3-8 秒随机
    const interval = nextIntervalMs();
    const wait = state.lastRequestAt + interval - Date.now();
    if (wait > 0) {
      await sleep(wait);
      state.lastIntervalMs = interval;
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        state.requests += 1;
        state.lastRequestAt = Date.now();
        const res = await fetch(url, {
          headers: {
            'User-Agent': UA,
            'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
            'Accept-Language': 'zh-CN,zh;q=0.9',
          },
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (res.status === 403 || res.status === 429) {
          state.consecutiveSevere += 1;
          logLine(siteKey, `HTTP ${res.status}（${url}），第 ${state.consecutiveSevere} 次严重信号`);
          if (state.consecutiveSevere >= BREAKER_THRESHOLD) {
            state.breakerTripped = true;
            state.breakerReason = `连续 ${state.consecutiveSevere} 次 HTTP ${res.status}，为不给站点造成压力已熔断`;
            logLine(siteKey, `[熔断] ${state.breakerReason}`);
          }
          throw new Error(`HTTP ${res.status}`);
        }
        if (res.status >= 500) throw new Error(`HTTP ${res.status}`);

        state.consecutiveSevere = 0;
        const buf = Buffer.from(await res.arrayBuffer());
        return decodeBody(buf, res.headers.get('content-type') || '');
      } catch (e) {
        if (e.robots || e.breaker) throw e;
        if (e.name === 'TimeoutError') logLine(siteKey, `超时（${url}）`);
        if (attempt < MAX_RETRIES) {
          const backoff = 3000 * Math.pow(3, attempt - 1); // 3s / 9s / 27s
          state.retries += 1;
          logLine(siteKey, `重试 ${attempt}/${MAX_RETRIES - 1}（${e.message}），${backoff / 1000}s 后再试`);
          await sleep(backoff);
        } else {
          state.consecutiveSevere += 1;
          if (state.consecutiveSevere >= BREAKER_THRESHOLD) {
            state.breakerTripped = true;
            state.breakerReason = `连续 ${state.consecutiveSevere} 次请求失败，已熔断`;
            logLine(siteKey, `[熔断] ${state.breakerReason}`);
          }
          throw new Error(`重试 ${MAX_RETRIES} 次仍失败: ${e.message}`);
        }
      }
    }
  }

  return { get, checkRobots, state, siteKey };
}

module.exports = { createSession, logLine, UA, nextIntervalMs, sleep };
