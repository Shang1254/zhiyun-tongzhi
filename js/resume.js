/**
 * 知云同职 - 模块二：简历生成
 * 表单 → 本地模板渲染（实践项目置顶）→ A4 预览 → 一键导出 PDF
 * （浏览器：html2pdf 直接下载；APK WebView：经 JSBridge 存入下载目录）
 */
(function () {
  const FORM_KEY = 'zy_resume_form';
  let projectSeq = 0;

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function addProjectRow(p = {}) {
    projectSeq += 1;
    const div = document.createElement('div');
    div.className = 'proj-item';
    div.innerHTML = `
      <div class="grid2">
        <label>项目/经历名称<input name="p_name" value="${esc(p.name || '')}" placeholder="校园二手书交易平台"></label>
        <label>担任角色<input name="p_role" value="${esc(p.role || '')}" placeholder="发起人 / 核心成员"></label>
        <label>开始时间<input name="p_start" value="${esc(p.start || '')}" placeholder="2025-03"></label>
        <label>结束时间<input name="p_end" value="${esc(p.end || '')}" placeholder="2025-06（可写 至今）"></label>
        <label class="full">做了什么、结果如何（建议用数字说话）
          <textarea name="p_detail" placeholder="例：搭建校园二手书小程序并组织 3 场地推，3 个月注册 800+ 用户，交易 1200 单，被校媒报道。"></textarea></label>
      </div>
      <button type="button" class="btn btn-danger-ghost btn-sm proj-del">删除这段</button>`;
    div.querySelector('.proj-del').onclick = () => div.remove();
    $('#project-list').appendChild(div);
  }

  function collect() {
    const f = $('#resume-form');
    const val = (n) => f.querySelector(`[name="${n}"]`).value.trim();
    const skills = val('skills').split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
    const certs = val('certs').split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
    const projects = [...document.querySelectorAll('.proj-item')]
      .map((el) => ({
        name: el.querySelector('[name="p_name"]').value.trim(),
        role: el.querySelector('[name="p_role"]').value.trim(),
        start: el.querySelector('[name="p_start"]').value.trim(),
        end: el.querySelector('[name="p_end"]').value.trim(),
        detail: el.querySelector('[name="p_detail"]').value.trim(),
      }))
      .filter((p) => p.name || p.detail);
    return {
      name: val('name'), phone: val('phone'), email: val('email'), gradYear: val('gradYear'),
      school: val('school'), major: val('major'), degree: val('degree'), eduRange: val('eduRange'),
      direction: val('direction'), city: val('city'),
      projects, skills, certs,
    };
  }

  /** 前端版简历模板（与后端 resumeBuilder.js 同一设计语言） */
  function renderHTML(p) {
    const projects = (p.projects || []).slice().sort((a, b) => (b.start || '').localeCompare(a.start || ''));
    const projectsHTML = projects.length
      ? projects
          .map(
            (pr) => `<div class="proj">
          <div class="proj-head"><span class="proj-name">${esc(pr.name)}</span>
          <span class="proj-time">${esc(pr.role || '参与者')}${pr.start ? ' · ' + esc(pr.start) + (pr.end ? ' ~ ' + esc(pr.end) : '') : ''}</span></div>
          <div class="proj-desc">${esc(pr.detail)}</div></div>`
          )
          .join('')
      : '<div class="empty">（建议补充 1-3 段实践/项目经历，这是应届生简历最有说服力的部分）</div>';

    const [eduStart = '', eduEnd = ''] = (p.eduRange || '').split('~').map((s) => s.trim());
    const skillsHTML = (p.skills || []).length ? `<ul class="skills">${p.skills.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : '';
    const certsHTML = (p.certs || []).length ? `<ul class="certs">${p.certs.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : '';
    const hlParts = [];
    if (p.direction) hlParts.push(`求职方向为${p.direction}`);
    if (projects.length) hlParts.push(`拥有 ${projects.length} 段实践项目经历`);
    if ((p.skills || []).length) hlParts.push(`掌握 ${p.skills.length} 项岗位技能`);

    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:"Microsoft YaHei","PingFang SC",sans-serif; color:#2b2f36; }
      .page { width:210mm; min-height:297mm; padding:14mm 16mm; }
      .hd { border-bottom:3px solid #1e6fff; padding-bottom:12px; margin-bottom:14px; }
      .hd-name { font-size:26px; font-weight:700; color:#1450c8; letter-spacing:2px; }
      .hd-sub { margin-top:6px; font-size:12.5px; color:#4a5568; }
      .hd-sub span { margin-right:14px; }
      .highlight { margin-top:10px; font-size:12.5px; color:#1e6fff; background:#eaf2ff; border-left:3px solid #1e6fff; padding:7px 10px; border-radius:0 6px 6px 0; }
      .sec { margin-bottom:14px; }
      .sec-t { font-size:15px; font-weight:700; color:#1450c8; border-left:4px solid #1e6fff; padding-left:8px; margin-bottom:8px; }
      .edu { display:flex; justify-content:space-between; font-size:13px; line-height:1.7; }
      .edu b { font-size:13.5px; }
      .proj { margin-bottom:10px; }
      .proj-head { display:flex; justify-content:space-between; font-size:13px; }
      .proj-name { font-weight:700; }
      .proj-time { color:#6b7280; font-size:12px; }
      .proj-desc { font-size:12.5px; color:#4a5568; line-height:1.7; margin-top:3px; white-space:pre-wrap; }
      .skills li, .certs li { font-size:12.5px; line-height:1.8; margin-left:18px; }
      .intent { font-size:13px; line-height:1.8; }
    </style></head><body><div class="page">
      <div class="hd">
        <div class="hd-name">${esc(p.name || '姓名')}</div>
        <div class="hd-sub"><span>${esc(p.school)}</span><span>${esc(p.major)}${p.degree ? ' · ' + esc(p.degree) : ''}</span><span>${esc(p.gradYear ? p.gradYear + ' 届' : '')}</span>${p.phone ? `<span>电话：${esc(p.phone)}</span>` : ''}${p.email ? `<span>邮箱：${esc(p.email)}</span>` : ''}</div>
        <div class="highlight">亮点：${hlParts.length ? hlParts.join('，') : '踏实肯干，学习能力强'}，注重实操与结果，能快速融入团队并独立承担工作。</div>
      </div>
      <div class="sec"><div class="sec-t">求职意向</div><div class="intent">目标岗位：${esc(p.direction || '待定')}　　意向城市：${esc(p.city || '不限')}</div></div>
      <div class="sec"><div class="sec-t">实践项目经历</div>${projectsHTML}</div>
      ${skillsHTML ? `<div class="sec"><div class="sec-t">技能特长</div>${skillsHTML}</div>` : ''}
      ${certsHTML ? `<div class="sec"><div class="sec-t">证书资质</div>${certsHTML}</div>` : ''}
      <div class="sec"><div class="sec-t">教育背景</div><div class="edu"><div><b>${esc(p.school)}</b>　${esc(p.major)}${p.degree ? ' · ' + esc(p.degree) : ''}</div><div>${esc(eduStart)}${eduStart ? ' ~ ' : ''}${esc(eduEnd || p.gradYear || '')}</div></div></div>
    </div></body></html>`;
  }

  async function exportPDF() {
    const iframe = $('#pv-frame');
    const doc = iframe.contentDocument;
    const pageEl = doc.querySelector('.page');
    if (!pageEl) return window.ZYApp.toast('请先生成预览');
    const profile = collect();
    const filename = `${profile.name || '我的'}-知云同职简历.pdf`;
    window.ZYApp.toast('正在生成 PDF…');

    try {
      // html2pdf：克隆页面元素到当前文档渲染（iframe 内样式已含）
      const worker = html2pdf().set({
        margin: 0,
        filename,
        image: { type: 'jpeg', quality: 0.96 },
        html2canvas: { scale: 2, useCORS: true, windowWidth: 794 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      });

      // 在 iframe 内执行导出（样式上下文正确），再取 blob
      const blob = await new Promise((resolve, reject) => {
        const w = iframe.contentWindow;
        w.html2pdf = html2pdf; // 共享库
        const inner = w.document.createElement('div');
        inner.appendChild(pageEl.cloneNode(true));
        w.document.body.appendChild(inner);
        html2pdf()
          .set({ margin: 0, image: { type: 'jpeg', quality: 0.96 }, html2canvas: { scale: 2, windowWidth: 794 }, jsPDF: { unit: 'mm', format: 'a4' } })
          .from(inner)
          .outputPdf('blob')
          .then((b) => { inner.remove(); resolve(b); })
          .catch((e) => reject(e));
      });

      const b64 = await blobToBase64(blob);

      // APK WebView：交给原生保存到下载目录
      if (window.AndroidBridge && window.AndroidBridge.savePdf) {
        window.AndroidBridge.savePdf(b64, filename);
        return;
      }
      // 浏览器：直接下载
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      window.ZYApp.toast('PDF 已生成 ✓');
    } catch (e) {
      console.error(e);
      window.ZYApp.toast('PDF 生成失败，请重试');
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.readAsDataURL(blob);
    });
  }

  function openPreview() {
    const profile = collect();
    if (!profile.name) return window.ZYApp.toast('请先填写姓名');
    const html = renderHTML(profile);
    const frame = $('#pv-frame');
    frame.srcdoc = html;
    $('#preview-mask').hidden = false;
    persist();
  }

  function persist() {
    // 表单草稿也进入加密保险库（与正式数据一起加密保存）
    clearTimeout(persist._t);
    persist._t = setTimeout(async () => {
      const vault = await window.ZYVault.load();
      await window.ZYVault.save({ ...(vault || {}), resumeForm: collect() });
    }, 600);
  }

  async function restore() {
    const vault = await window.ZYVault.load();
    const d = vault && vault.resumeForm;
    if (!d) return;
    const f = $('#resume-form');
    const set = (n, v) => { const el = f.querySelector(`[name="${n}"]`); if (el && v) el.value = v; };
    ['name', 'phone', 'email', 'gradYear', 'school', 'major', 'degree', 'eduRange', 'direction', 'city', 'skills', 'certs'].forEach((k) => set(k, d[k]));
    if (d.projects && d.projects.length) d.projects.forEach((p) => addProjectRow(p));
  }

  function bind() {
    $('#add-project').addEventListener('click', () => addProjectRow());
    $('#btn-preview').addEventListener('click', openPreview);
    $('#pv-close').addEventListener('click', () => { $('#preview-mask').hidden = true; });
    $('#pv-export').addEventListener('click', exportPDF);
    $('#resume-form').addEventListener('input', persist);
    addProjectRow(); // 默认给一段
  }

  window.ZYResume = { init() { bind(); restore(); } };
})();
