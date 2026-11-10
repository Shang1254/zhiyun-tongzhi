/**
 * 日期工具：一律按服务器本地时区取「今天」。
 * 原实现用 toISOString().slice(0,10)（UTC），在东八区 00:00-08:00 之间会取到昨天，
 * 导致刚过期一天的拼车仍出现在列表、清理任务晚一天执行。
 */
function pad(n) {
  return String(n).padStart(2, '0');
}

function todayLocal(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function addDaysLocal(days, from = new Date()) {
  const d = new Date(from.getTime() + days * 86400000);
  return todayLocal(d);
}

module.exports = { todayLocal, addDaysLocal };
