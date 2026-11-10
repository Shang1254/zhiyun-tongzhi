/**
 * 知云同职 - 拼车信息内容安全
 *
 * 定位：公益信息公告板。平台不参与组织拼车、不收费、不担保出行安全。
 * 联系方式为用户主动公开内容，发布页/详情页均需展示免责与防骗提示。
 */

const RIDE_BANNED_WORDS = [
  // 反诈词（与岗位反诈同源思路）：拼车板常见滥用场景
  '刷单', '贷款', '借贷', '代购', '烟', '槟榔', '代考', '代写', '办证',
  '赌', '博彩', '充值优惠', '收学生证', '租车押金', '先付款', '定金',
];

const DISCLAIMER = [
  '本板块仅为信息公告板，不参与组织拼车、不收取任何费用、不担保出行安全与费用分担。',
  '出行前请核实对方身份（建议同校学生证），费用与责任由同行人自行协商自理。',
  '谨防以拼车为名的收费、代购、借贷等诈骗：凡是先要钱的，一律不信。',
].join('\n');

/**
 * 发布校验与过滤
 * @returns {{ok:boolean, error?:string, value?:object}}
 */
function validateRide(body) {
  const b = body || {};
  const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max || 200);

  const type = b.type === '带人' ? '带人' : b.type === '找车' ? '找车' : null;
  if (!type) return { ok: false, error: '类型必须为「找车」或「带人」' };

  const from_city = str(b.from_city, 20);
  const to_city = str(b.to_city, 20);
  if (!from_city || !to_city) return { ok: false, error: '请填写出发地和目的地' };
  if (from_city === to_city) return { ok: false, error: '出发地和目的地不能相同' };

  const ride_date = str(b.ride_date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ride_date)) return { ok: false, error: '日期格式应为 YYYY-MM-DD' };
  const d = require('../utils/date');
  const today = d.todayLocal();
  if (ride_date < today) return { ok: false, error: '出发日期不能早于今天' };
  const maxDate = d.addDaysLocal(60);
  if (ride_date > maxDate) return { ok: false, error: '出发日期最多提前 60 天' };

  const ride_time = str(b.ride_time, 20); // 如 08:00-12:00 或 上午
  const seats = Math.min(6, Math.max(1, parseInt(b.seats) || 1));

  const contact_type = b.contact_type === '电话' ? '电话' : '微信';
  const contact = str(b.contact, 50);
  if (!contact) return { ok: false, error: '请填写联系方式（同学将通过它联系你）' };
  if (contact_type === '电话' && !/^1\d{10}$/.test(contact.replace(/[\s-]/g, ''))) {
    return { ok: false, error: '电话格式不正确（11 位手机号）' };
  }
  if (contact_type === '微信' && !/^[a-zA-Z][a-zA-Z0-9_-]{5,19}$/.test(contact) && !/^1\d{10}$/.test(contact)) {
    return { ok: false, error: '微信号格式不正确（字母开头 6-20 位）' };
  }

  const note = str(b.note, 200);
  const haystack = [from_city, to_city, note, contact].join(' ');
  const hit = RIDE_BANNED_WORDS.find((w) => haystack.includes(w));
  if (hit) return { ok: false, error: `内容包含不允许发布的词（${hit}），拼车板块禁止任何收费、代购、借贷类信息` };

  return { ok: true, value: { type, from_city, to_city, ride_date, ride_time, seats, contact_type, contact, note } };
}

/** 联系方式打码：电话 138****1234；微信 wx***5678（保留前2后4） */
function maskContact(contactType, contact) {
  if (contactType === '电话' && /^1\d{10}$/.test(contact)) {
    return contact.slice(0, 3) + '****' + contact.slice(7);
  }
  if (contact.length <= 6) return contact.slice(0, 2) + '***';
  return contact.slice(0, 2) + '***' + contact.slice(-4);
}

const crypto = require('crypto');
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}
function newToken() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = { validateRide, maskContact, hashToken, newToken, DISCLAIMER, RIDE_BANNED_WORDS };
