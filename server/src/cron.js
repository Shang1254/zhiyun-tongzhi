/**
 * 知云同职 - 定时任务（对应主Agent规则「每日凌晨自动更新数据」与子Agent③「每天9点推送」）
 *   03:00  岗位库复检：全量重新评分虚假岗 + 标记过期岗位
 *   09:00  按用户画像生成当日 3 条推荐岗位
 * 附带 runNow(task) 供管理接口手动触发，便于验收测试。
 */
const cron = require('node-cron');
const { refreshAll } = require('./services/jobStore');
const dailyDigest = require('./services/dailyDigest');
const { db, meta } = require('./db');

/** 拼车信息过期清理：出发日超过 7 天的物理删除（更近的由查询过滤） */
function cleanExpiredRides() {
  const cutoff = require('./utils/date').addDaysLocal(-7);
  const info = db.prepare('DELETE FROM rides WHERE ride_date < ?').run(cutoff);
  if (info.changes) console.log(`[cron] 拼车过期清理：删除 ${info.changes} 条`);
  return info.changes;
}

let fetcherRunning = false;
async function runFetch() {
  if (fetcherRunning) return { skipped: true, reason: '上一轮采集尚未结束' };
  fetcherRunning = true;
  try {
    const fetcher = require('./fetcher/run');
    const r = await fetcher.main();
    meta.set('last_fetch_at', new Date().toISOString());
    return r;
  } finally {
    fetcherRunning = false;
  }
}

function runRefresh() {
  const r = refreshAll();
  const ridesCleaned = cleanExpiredRides();
  console.log(`[cron 03:00] 岗位库复检完成：${r.total} 条，重新标记 ${r.reflagged} 条，新过期 ${r.newlyExpired} 条；拼车过期清理 ${ridesCleaned} 条`);
  return r;
}

function runDigest() {
  const r = dailyDigest.generateAll();
  meta.set('last_digest_at', new Date().toISOString());
  console.log(`[cron 09:00] 今日推荐已生成：${r.date}，覆盖 ${r.saved.length} 个画像`);
  return r;
}

function start() {
  cron.schedule('0 0 * * *', () => runFetch().catch((e) => console.error('[cron 00:00] 采集失败:', e.message)));
  cron.schedule('0 3 * * *', runRefresh);
  cron.schedule('0 9 * * *', runDigest);
  // 启动时若今日推荐缺失则先生成一份，保证 APP 打开就有内容
  const today = dailyDigest.getToday();
  if (!today.items || !today.items.length) runDigest();
  console.log('[cron] 定时任务已启动：00:00 官方岗位采集 / 03:00 岗位复检 / 09:00 每日推荐');
}

function runNow(task) {
  if (task === 'refresh') return runRefresh();
  if (task === 'digest') return runDigest();
  if (task === 'fetch') return runFetch();
  if (task === 'all') return { refresh: runRefresh(), digest: runDigest() };
  throw new Error('unknown task: ' + task);
}

module.exports = { start, runNow };
