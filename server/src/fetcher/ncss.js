/**
 * 知云同职 - 官方岗位采集 · 国家大学生就业服务平台探测适配器（教育部 www.ncss.cn）
 *
 * 如实结论（2026-11 实测）：该平台岗位数据位于登录态之后——首页/职位列表页
 * 未登录可见条目为 0。本适配器不登录、不破解、不绕过任何访问控制，
 * 仅做公开可见性探测，并在报告中给出合规对接路径：
 *   平台面向高校就业部门提供「标准化职位接口」申请通道（机构级），
 *   公益项目可通过挂靠学校就业指导中心申请接口对接获得授权数据。
 *   指南：https://www.ncss.cn/ncss/jydt/yw/202410/20241024/2293344400.html
 */
const { createSession } = require('./core');

const BASE = 'https://www.ncss.cn';
const INTERFACE_GUIDE_URL = 'https://www.ncss.cn/ncss/jydt/yw/202410/20241024/2293344400.html';

async function fetchNcss() {
  const session = createSession('ncss', BASE);
  const report = {
    site: 'ncss(国家大学生就业服务平台·教育部)',
    discovered: 0,
    fetched: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    conclusion: '',
    reachable: false,
  };

  try {
    await session.checkRobots();

    // 探测 1：职位列表页（公开入口）
    let html = '';
    let denied = false;
    try {
      html = await session.get(BASE + '/student/jobs/index.html');
      report.reachable = true;
    } catch (e) {
      denied = /HTTP 403|HTTP 429/.test(e.message);
      report.errors.push('列表页访问失败: ' + e.message);
    }

    if (report.reachable) {
      // 未登录判定：页面是否含岗位条目数据
      const hasEntries = /\/job\/view\/|position|jobid/i.test(html) && !/暂时没有查询到|职位总数--|login/i.test(html);
      // 探测 2：首页（推荐职位区块由 JS 异步加载且数据在登录态后）
      report.discovered = 0;
      report.conclusion = hasEntries
        ? '检测到公开岗位条目（平台页面结构可能已调整），请人工复核后接入解析。'
        : '实测未登录状态下公开岗位条目为 0：平台岗位数据位于学生登录态之后。'
          + '本助手不做任何登录绕过。合规数据路径：① 通过学校就业指导中心申请平台「标准化职位接口」'
          + '（机构级对接，指南见 ' + INTERFACE_GUIDE_URL + '）；'
          + '② 引导学生直接使用官方平台（本 APP 内展示对接指引）。';
    } else if (denied) {
      report.conclusion = '站点对自动化访问返回 403/429（平台侧限制）。已按礼貌原则停止重试，'
        + '本助手不做任何反限制规避。岗位数据应通过官方「标准化职位接口」申请对接获取（指南：' + INTERFACE_GUIDE_URL + '）。';
    } else {
      report.conclusion = '当前网络环境无法访问平台，请从校园网/境内网络重试。';
    }

    report.requests = session.state.requests;
    report.retries = session.state.retries;
  } catch (e) {
    report.errors.push(e.message);
  }
  return report;
}

module.exports = { fetchNcss, INTERFACE_GUIDE_URL };
