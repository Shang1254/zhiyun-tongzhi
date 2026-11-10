/**
 * 知云同职 - 子Agent②「简历定制生成」落地实现
 *
 * 针对民办生求职画像的规则化简历模板：
 *   - 实践项目经历置顶突出（民办生最大的差异化优势是"做过的实事"）
 *   - 弱化"民办院校"标签焦虑：教育背景简洁呈现，不刻意标注办学性质
 *   - 技能证书结构化罗列，一句话亮点总结由规则拼接生成
 * 输出标准 A4 HTML，前端可用 html2pdf.js 一键导出 PDF。
 */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 根据画像生成一句话求职亮点（规则拼接，非 AI 生成，零成本） */
function buildHighlight(profile) {
  const parts = [];
  const dir = (profile.direction || '').trim();
  const projects = profile.projects || [];
  const skills = profile.skills || [];
  if (dir) parts.push(`求职方向为${dir}`);
  if (projects.length) parts.push(`拥有 ${projects.length} 段实践项目经历`);
  if (skills.length) parts.push(`掌握 ${(profile.skillList || skills).length} 项岗位技能`);
  if (!parts.length) return '踏实肯干，学习能力强，期待在实践中快速成长。';
  return `${parts.join('，')}，注重实操与结果，能快速融入团队并独立承担工作。`;
}

function renderResumeHTML(profile) {
  const p = profile || {};
  const projects = (p.projects || []).slice().sort((a, b) => (b.start || '').localeCompare(a.start || ''));
  const certs = p.certs || [];
  const skills = p.skills || [];

  const projectsHTML = projects.length
    ? projects
        .map(
          (pr) => `
      <div class="proj">
        <div class="proj-head">
          <span class="proj-name">${esc(pr.name || '实践项目')}</span>
          <span class="proj-time">${esc(pr.role || '参与者')}${pr.start ? ' · ' + esc(pr.start) + (pr.end ? ' ~ ' + esc(pr.end) : '') : ''}</span>
        </div>
        <div class="proj-desc">${esc(pr.detail || '')}</div>
      </div>`
        )
        .join('')
    : '<div class="empty">（建议补充 1-3 段实践/项目经历，这是应届生简历最有说服力的部分）</div>';

  const skillsHTML = skills.length
    ? `<ul class="skills">${skills.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`
    : '<div class="empty">（建议补充技能，如：Excel 数据透视表 / 剪映剪辑 / Python 基础）</div>';

  const certsHTML = certs.length
    ? `<ul class="certs">${certs.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`
    : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${esc(p.name || '个人简历')}-知云同职</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; color: #2b2f36; background: #fff; }
  .page { width: 210mm; min-height: 297mm; padding: 14mm 16mm; margin: 0 auto; }
  .hd { border-bottom: 3px solid #1e6fff; padding-bottom: 12px; margin-bottom: 14px; }
  .hd-name { font-size: 26px; font-weight: 700; color: #1450c8; letter-spacing: 2px; }
  .hd-sub { margin-top: 6px; font-size: 12.5px; color: #4a5568; }
  .hd-sub span { margin-right: 14px; }
  .highlight { margin-top: 10px; font-size: 12.5px; color: #1e6fff; background: #eaf2ff; border-left: 3px solid #1e6fff; padding: 7px 10px; border-radius: 0 6px 6px 0; }
  .sec { margin-bottom: 14px; }
  .sec-t { font-size: 15px; font-weight: 700; color: #1450c8; border-left: 4px solid #1e6fff; padding-left: 8px; margin-bottom: 8px; }
  .edu { display: flex; justify-content: space-between; font-size: 13px; line-height: 1.7; }
  .edu b { font-size: 13.5px; }
  .proj { margin-bottom: 10px; }
  .proj-head { display: flex; justify-content: space-between; font-size: 13px; }
  .proj-name { font-weight: 700; }
  .proj-time { color: #6b7280; font-size: 12px; }
  .proj-desc { font-size: 12.5px; color: #4a5568; line-height: 1.7; margin-top: 3px; white-space: pre-wrap; }
  .skills li, .certs li { font-size: 12.5px; line-height: 1.8; margin-left: 18px; }
  .empty { font-size: 12px; color: #9aa3b2; }
  .intent { font-size: 13px; line-height: 1.8; }
</style>
</head>
<body>
<div class="page" id="resume-page">
  <div class="hd">
    <div class="hd-name">${esc(p.name || '姓名')}</div>
    <div class="hd-sub">
      <span>${esc(p.school || '毕业院校')}</span>
      <span>${esc(p.major || '专业')}${p.degree ? ' · ' + esc(p.degree) : ''}</span>
      <span>${esc(p.gradYear ? p.gradYear + ' 届' : '')}</span>
      ${p.phone ? `<span>电话：${esc(p.phone)}</span>` : ''}
      ${p.email ? `<span>邮箱：${esc(p.email)}</span>` : ''}
    </div>
    <div class="highlight">亮点：${esc(buildHighlight(p))}</div>
  </div>

  <div class="sec">
    <div class="sec-t">求职意向</div>
    <div class="intent">目标岗位：${esc(p.direction || '待定')}　　意向城市：${esc(p.city || '不限')}</div>
  </div>

  <div class="sec">
    <div class="sec-t">实践项目经历</div>
    ${projectsHTML}
  </div>

  <div class="sec">
    <div class="sec-t">技能特长</div>
    ${skillsHTML}
  </div>

  ${certsHTML ? `<div class="sec"><div class="sec-t">证书资质</div>${certsHTML}</div>` : ''}

  <div class="sec">
    <div class="sec-t">教育背景</div>
    <div class="edu">
      <div><b>${esc(p.school || '毕业院校')}</b>　${esc(p.major || '')}${p.degree ? ' · ' + esc(p.degree) : ''}</div>
      <div>${esc(p.eduStart || '')}${p.eduStart ? ' ~ ' : ''}${esc(p.eduEnd || p.gradYear || '')}</div>
    </div>
  </div>
</div>
</body>
</html>`;
}

module.exports = { renderResumeHTML, buildHighlight };
