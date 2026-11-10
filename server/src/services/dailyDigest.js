/**
 * 知云同职 - 子Agent③「每日更新推送」落地实现
 *
 * 每天按用户画像（求职方向/城市/学历）从已过滤的岗位库中挑选 3 条优质岗位：
 *   1. 排除虚假岗与过期岗位
 *   2. 按画像匹配度 + 新鲜度 + 薪资水平综合打分
 *   3. 每台设备生成独立推荐，写入 digests 表，APP「今日推荐」展示
 * 注：厂商级推送通知（FCM/厂商通道）需要开发者资质，本公益版以应用内
 * 消息中心形式呈现，详见 docs/使用与部署说明.md。
 */
const { db } = require('../db');

const EDU_RANK = { 不限: 0, 大专: 1, 本科: 2, 硕士: 3 };

/**
 * 为一份用户画像生成当日推荐（3 条）
 * @param {{direction?:string, city?:string, education?:string}} profile 非敏感匹配画像
 */
function generateFor(profile) {
  profile = profile || {};
  const jobs = db
    .prepare('SELECT * FROM jobs WHERE is_fake = 0 AND expired = 0')
    .all()
    .map((row) => ({ ...row, requirements: JSON.parse(row.requirements || '[]'), tags: JSON.parse(row.tags || '[]') }));

  if (!jobs.length) return [];

  const today = new Date();
  const scored = jobs.map((j) => {
    let s = 0;
    // 方向匹配（类别或标题含画像方向关键词）
    const dir = (profile.direction || '').trim();
    if (dir && (j.category.includes(dir) || j.title.includes(dir))) s += 50;
    // 城市匹配
    const city = (profile.city || '').trim();
    if (city && (j.city === city || j.city === '全国')) s += 30;
    // 学历可达性：岗位要求不高于用户学历加分；要求高于用户学历则排除
    const userEdu = EDU_RANK[profile.education] ?? 1;
    const jobEdu = EDU_RANK[j.education] ?? 0;
    if (jobEdu > userEdu) s -= 1000;
    else if (jobEdu === userEdu) s += 10;
    // 新鲜度：7 天内发布加分
    const days = (today - new Date(j.posted_at || j.postedAt || today)) / 86400000;
    if (days <= 7) s += 20;
    // 薪资水平温和加分（月薪中位数）
    if (j.salary_type === 'monthly') s += Math.min(10, ((j.salary_min + j.salary_max) / 2) / 1000);
    return { job: j, score: s };
  });

  return scored
    .filter((x) => x.score > -100)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ job, score }) => ({
      id: job.id,
      title: job.title,
      company: job.company,
      city: job.city,
      district: job.district,
      category: job.category,
      salaryMin: job.salary_min,
      salaryMax: job.salary_max,
      salaryType: job.salary_type,
      education: job.education,
      tags: job.tags,
      postedAt: job.posted_at,
      recommendScore: Math.round(score),
      reason: buildReason(profile, job),
    }));
}

function buildReason(profile, job) {
  const why = [];
  const dir = (profile.direction || '').trim();
  if (dir && (job.category.includes(dir) || job.title.includes(dir))) why.push(`与你的「${dir}」方向匹配`);
  const city = (profile.city || '').trim();
  if (city && job.city === city) why.push(`位于你意向的 ${city}`);
  if ((EDU_RANK[job.education] ?? 0) <= (EDU_RANK[profile.education] ?? 1)) why.push('学历要求匹配');
  const days = (Date.now() - new Date(job.posted_at)) / 86400000;
  if (days <= 7) why.push('近 7 天新发布');
  return why.length ? why.join('，') : '经过虚假岗过滤后的优质岗位';
}

/** 生成并保存所有画像的当日推荐（cron 09:00 调用；无画像设备用默认画像兜底） */
function generateAll() {
  const date = require('../utils/date').todayLocal();
  const profiles = db.prepare('SELECT * FROM profiles').all();
  const saved = [];

  const save = (deviceId, profile) => {
    const items = generateFor(profile);
    if (!items.length) return;
    saveFor(deviceId, date, items);
    saved.push({ deviceId, count: items.length });
  };

  profiles.forEach((p) => save(p.device_id, p));
  if (!saved.length) {
    // 没有任何画像时生成一份通用推荐，保证「今日推荐」不空
    save('default', { direction: '', city: '', education: '大专' });
  }

  return { date, saved };
}

function saveFor(deviceId, date, items) {
  db.prepare(
    `INSERT INTO digests (date, device_id, items) VALUES (?, ?, ?)
     ON CONFLICT(date, device_id) DO UPDATE SET items = excluded.items`
  ).run(date, deviceId, JSON.stringify(items));
}

/**
 * 读取某设备当日推荐；若该画像当日尚未生成（如刚保存画像），即时生成一份。
 * 服务端 profiles 表无该设备记录时，使用调用方传入的匿名匹配画像兜底。
 * 推荐内容只含岗位公开信息与匿名匹配字段，不含个人敏感信息。
 */
function getToday(deviceId, fallbackProfile) {
  const date = require('../utils/date').todayLocal();
  const id = deviceId || 'default';
  let row = db.prepare('SELECT * FROM digests WHERE date = ? AND device_id = ?').get(date, id);
  if (!row) {
    let profile = db.prepare('SELECT * FROM profiles WHERE device_id = ?').get(id);
    if (!profile && fallbackProfile) profile = fallbackProfile;
    const items = generateFor(profile || { direction: '', city: '', education: '大专' });
    if (items.length) saveFor(id, date, items);
    return { date, items, generatedNow: true };
  }
  return { date, items: JSON.parse(row.items) };
}

module.exports = { generateFor, generateAll, getToday };
