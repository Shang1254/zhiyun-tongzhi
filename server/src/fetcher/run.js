/**
 * 知云同职 - 官方岗位采集编排入口
 *
 * 用法：
 *   node src/fetcher/run.js                      # 全部站点（mohrss + wllm + ncss）
 *   node src/fetcher/run.js --site=wllm          # 仅高校联盟（晴川优先）
 *   node src/fetcher/run.js --site=mohrss        # 仅中国公共招聘网
 *   node src/fetcher/run.js --site=ncss          # 仅登录墙探测（不做绕过）
 *   node src/fetcher/run.js --limit=5            # 限制单站点详情抓取条数（默认见各适配器）
 *
 * 数据流：适配器（限速抓取+解析）→ 虚假岗评分引擎复检 → jobStore 入库 → 生成当日报告
 * 报告：server/data/reports/YYYY-MM-DD.md（本地留存，不上传）
 */
const fs = require('fs');
const path = require('path');
const { db } = require('../db');
const jobStore = require('../services/jobStore');
const { fetchMohrss } = require('./mohrss');
const { fetchWllm } = require('./wllm');
const { fetchNcss } = require('./ncss');
const { logLine } = require('./core');

const REPORT_DIR = path.join(require('../config').dataDir, 'reports');
if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const m = args.find((a) => a.startsWith('--' + name + '='));
  return m ? m.split('=').slice(1).join('=') : dflt;
};

/** 岗位库 id 存在性检查（增量跳过，避免重复抓详情） */
function dbExists(id) {
  return !!db.prepare('SELECT 1 FROM jobs WHERE id = ?').get(id);
}

async function main() {
  const site = getArg('site', 'all');
  const limit = parseInt(getArg('limit', '0')) || undefined;
  const startedAt = new Date();

  // 低峰时段守卫：0-4 点为站点低峰（与 cron 0 点自动任务一致）；其余时段仅提示不阻止
  const hour = startedAt.getHours();
  if (hour >= 8 && hour < 22) {
    const hint = `当前为白天时段（${String(hour).padStart(2, '0')} 点），非站点低峰。建议小规模运行（--limit 控制条数），或等待每日 0 点自动任务。`;
    console.log('[提示] ' + hint);
    logLine('runner', hint);
  }

  logLine('runner', `=== 采集启动 site=${site} limit=${limit || 'default'} ===`);

  const collected = []; // {job, source}
  const wantMohrss = site === 'all' || site === 'mohrss';
  const wantWllm = site === 'all' || site === 'wllm';
  const wantNcss = site === 'all' || site === 'ncss';

  const reports = [];
  if (wantMohrss) {
    const r = await fetchMohrss({
      limit,
      dbExists,
      onJob: (j) => { j.source = 'mohrss'; collected.push(j); },
    });
    reports.push(r);
  }
  if (wantWllm) {
    const r = await fetchWllm({
      limit,
      dbExists,
      onJob: (j) => { j.source = 'wllm-' + (j.school || ''); collected.push(j); },
    });
    reports.push(r);
  }
  if (wantNcss) {
    reports.push(await fetchNcss());
  }

  // 虚假岗评分复检后入库（复用 jobStore，评分引擎自动标记）
  let importResult = null;
  if (collected.length) {
    importResult = jobStore.importJobs({ json: collected });
  }

  // 生成当日 Markdown 报告（追加到同日报告，便于多次运行留痕）
  const date = require('../utils/date').todayLocal();
  const finishedAt = new Date();
  const lines = [];
  lines.push(`\n## 采集运行 ${startedAt.toTimeString().slice(0, 8)}（site=${site}${limit ? ', limit=' + limit : ''}）`);
  lines.push('');

  // 全国城市岗位分布统计 + 覆盖度校验（本地数据运算，零网络请求）
  try {
    const provinces = db.prepare(
      `SELECT province, COUNT(*) AS total FROM jobs WHERE is_fake = 0 AND province != '' GROUP BY province ORDER BY total DESC`
    ).all();
    const unclassified = db.prepare(`SELECT COUNT(*) AS n FROM jobs WHERE is_fake = 0 AND (province = '' OR province IS NULL)`).get().n;
    let idxSummary = { provinceCount: 0 };
    try {
      idxSummary = require('../services/geo').indexSummary();
    } catch (e) { /* 索引未生成 */ }
    const covered = provinces.length;
    lines.push(`### 全国城市岗位分布统计`);
    lines.push(provinces.length
      ? provinces.map((p) => `- ${p.province}：${p.total} 条`).join('\n')
      : '-（暂无带省份归属的有效岗位）');
    if (unclassified) lines.push(`- 未归类（city 不在索引中）：${unclassified} 条`);
    lines.push(`\n### 城市覆盖度校验`);
    lines.push(`- 城市索引省级覆盖：${idxSummary.provinceCount}/31`);
    lines.push(`- 岗位已覆盖省份：${covered}/${idxSummary.provinceCount || 31}`);
    if (idxSummary.provinces && provinces.length) {
      const blanks = idxSummary.provinces.map((p) => p.name).filter((name) => !provinces.some((p) => p.province === name));
      if (blanks.length) lines.push(`- 暂无岗位省份（${blanks.length} 个）：${blanks.join('、')}`);
      else lines.push('- 全部索引省份均有岗位 ✓');
    }
    lines.push('');
  } catch (e) { /* 统计失败不影响主流程 */ }

  for (const r of reports) {
    lines.push(`### ${r.site}`);
    lines.push(`- 发现 ${r.discovered ?? '-'} 条，抓取详情 ${r.fetched ?? 0} 条，入库 ${r.imported ?? 0} 条，库内跳过 ${r.skipped ?? 0} 条，失败 ${r.failed ?? 0} 条`);
    if (r.requests != null) lines.push(`- 请求 ${r.requests} 次（间隔 3-8 秒随机），重试 ${r.retries || 0} 次`);
    if (r.schools) {
      for (const s of r.schools) {
        lines.push(`  - ${s.name}：发现 ${s.discovered}，抓取 ${s.fetched}，入库 ${s.imported}，跳过 ${s.skipped}${s.error ? '，错误：' + s.error : ''}`);
      }
    }
    if (r.breaker) lines.push(`- ⚠ 熔断：${r.breaker}`);
    if (r.conclusion) lines.push(`- 探测结论：${r.conclusion}`);
    if (r.reachable === false) lines.push('- 站点不可达');
    if (r.errors && r.errors.length) lines.push(`- 错误明细：${r.errors.slice(0, 5).join('；')}`);
    lines.push('');
  }
  if (importResult) {
    lines.push(`### 入库结果`);
    lines.push(`- 共入库 ${importResult.imported} 条，其中虚假岗过滤 ${importResult.fakeDetected} 条（评分引擎自动标记）`);
    lines.push('');
  }
  lines.push(`_耗时 ${(finishedAt - startedAt) / 1000}s · 日志本地留存于 server/data/logs/ · 未上传任何数据_`);

  const reportPath = path.join(REPORT_DIR, `fetch-${date}.md`);
  fs.appendFileSync(reportPath, lines.join('\n') + '\n');
  logLine('runner', `=== 采集完成，报告已写入 ${reportPath} ===`);

  console.log(lines.join('\n'));
  return { reportPath, importResult };
}

if (require.main === module) {
  main().catch((e) => {
    console.error('采集失败:', e);
    process.exit(1);
  });
}

module.exports = { main };
