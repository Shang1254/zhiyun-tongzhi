/**
 * 知云同职 - 模块一：岗位库
 * 搜索 / 筛选 / 虚假岗对照（教育用途） / 详情抽屉 / 投递跳转
 */
(function () {
  const state = {
    keyword: '',
    province: '',
    city: '',
    category: '',
    education: '',
    show: 'real', // real | fake
    stats: null,
  };

  const CITIES = ['全部', '武汉', '长沙', '郑州', '合肥', '南昌', '成都', '杭州', '深圳'];
  const CATEGORIES = ['全部', 'IT', '运营', '电商', '客服', '行政', '销售', '财务', '教育', '物流', '设计'];
  const EDUS = ['全部', '不限', '大专', '本科'];

  const $ = (sel) => document.querySelector(sel);

  function salaryText(j) {
    const unit = j.salaryType === 'daily' ? '/天' : '';
    const k = (n) => (n >= 10000 ? (n / 10000).toFixed(n % 10000 === 0 ? 0 : 1) + '万' : n);
    return `${k(j.salaryMin)}-${k(j.salaryMax)}${unit}`;
  }

  function fmtDate(d) {
    if (!d) return '';
    return String(d).slice(5).replace('-', '/');
  }

  function jobCard(j) {
    const fake = state.show === 'fake';
    const tags = (j.tags || []).map((t) => `<span class="tag">${escapeHTML(t)}</span>`).join('');
    const expiredTag = j.expired ? '<span class="tag gray">可能已过期</span>' : '';
    const officialTag = /mohrss|wllm/.test(j.source || '') ? '<span class="tag">✔官方渠道</span>' : '';
    return `
      <div class="job-card ${fake ? 'fake' : ''}" data-id="${j.id}">
        <div class="job-top">
          <div class="job-title">${escapeHTML(j.title)}${fake ? '<span class="fake-badge">虚假岗</span>' : ''}</div>
          <div class="job-salary">${salaryText(j)}</div>
        </div>
        <div class="job-company">${escapeHTML(j.company || '未标注公司主体')} · ${escapeHTML(j.city)}${j.district ? ' ' + escapeHTML(j.district) : ''} · ${escapeHTML(j.education)}</div>
        <div class="job-meta">${officialTag}${tags}${expiredTag}</div>
        ${fake ? `<div class="fake-reasons"><b>判定理由（防骗教育）：</b>${(j.riskFlags || []).map((f) => escapeHTML(f.reason)).join('；')}</div>` : ''}
        <div class="job-time">${escapeHTML(fmtDate(j.postedAt))} 发布</div>
      </div>`;
  }

  function escapeHTML(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderChips(container, options, key) {
    $(container).innerHTML = options
      .map(
        (o) =>
          `<button class="chip ${state[key] === (o === '全部' ? '' : o) ? 'active' : ''}" data-v="${o === '全部' ? '' : o}">${o}</button>`
      )
      .join('');
  }

  function renderFilters() {
    renderChips('#filter-city', CITIES, 'city');
    renderChips('#filter-category', CATEGORIES, 'category');
    renderChips('#filter-edu', EDUS, 'education');
  }

  async function loadList() {
    const listEl = $('#job-list');
    listEl.innerHTML = '<div class="empty">加载中…</div>';
    const data = await window.ZYApi.jobs(state);

    // 虚假岗过滤横幅
    const banner = $('#fake-banner');
    const st = await window.ZYApi.stats();
    if (state.show === 'real') {
      banner.hidden = false;
      banner.innerHTML = `🛡 已自动过滤 <b>${st.fakeFiltered || 0}</b> 条虚假/高风险岗位（薪资虚标、押金会费、刷单返款等）<br>点击查看这些骗术样本，学会识别 →`;
      banner.onclick = () => {
        state.show = 'fake';
        loadList();
      };
    } else {
      banner.hidden = false;
      banner.innerHTML = `⚠ 以下是<b>已过滤的虚假岗样本</b>（骗术对照展示），投递前请远离此类岗位。<br>点击返回真实岗位 →`;
      banner.onclick = () => {
        state.show = 'real';
        loadList();
      };
    }

    if (!data.list.length) {
      listEl.innerHTML = '<div class="empty">没有符合条件的岗位，试试放宽筛选</div>';
    } else {
      listEl.innerHTML = data.list.map(jobCard).join('');
      listEl.querySelectorAll('.job-card').forEach((el) => {
        el.addEventListener('click', () => openDetail(el.dataset.id));
      });
    }
    $('#job-list-foot').textContent = `${data.total} 条岗位${data.online === false ? ' · 离线内置数据' : ''}`;
  }

  async function openDetail(id) {
    // 在线取详情（含风险判定），离线从列表缓存取
    let job = null;
    try {
      job = await window.ZYApi.jobs({}).then((d) => d.list.find((x) => x.id === id));
      if (!job) {
        const fk = await window.ZYApi.jobs({ show: 'fake' });
        job = fk.list.find((x) => x.id === id);
      }
    } catch (e) { /* 离线已覆盖 */ }
    if (!job) return window.ZYApp.toast('岗位详情加载失败');

    const reqHTML = (job.requirements || []).map((r) => `<li>${escapeHTML(r)}</li>`).join('');
    // 信息来源（官方采集岗位展示来源与原文入口）
    const SOURCE_NAMES = {
      mohrss: '人社部·中国公共招聘网',
      ncss: '国家大学生就业服务平台',
    };
    let sourceLabel = SOURCE_NAMES[job.source] || (/^wllm-(.+)$/.exec(job.source || '') ? RegExp.$1 + '（高校就业网）' : '');
    if (job.school && !sourceLabel.includes(job.school)) sourceLabel = job.school + '就业网';
    const sourceHTML = sourceLabel
      ? `<div class="sheet-sec"><h3>🏛 信息来源</h3><p>${escapeHTML(sourceLabel)} · 官方渠道采集<br>
         <a href="${escapeHTML(job.applyUrl)}" target="_blank" rel="noopener" style="color:#1e6fff">查看岗位原文 ↗</a></p></div>`
      : '';
    const fakeBlock =
      job.riskFlags && job.riskFlags.length
        ? `<div class="sheet-sec"><h3>⚠ 风险判定（评分 ${job.riskScore}/100，虚假岗）</h3>
           <div class="fake-reasons">${job.riskFlags.map((f) => '· ' + escapeHTML(f.reason)).join('<br>')}</div></div>`
        : job.riskScore > 0
          ? `<div class="sheet-sec"><h3>🛡 风险提示（评分 ${job.riskScore}/100）</h3><p>该岗位存在少量待核实信号，投递时请保持警惕。</p></div>`
          : '';

    const applyBtn = job.applyUrl
      ? `<button class="btn btn-primary apply-btn" id="apply-go">立即投递 ↗</button>`
      : `<button class="btn btn-primary apply-btn" id="apply-demo">立即投递</button>`;

    $('#job-sheet').innerHTML = `
      <button class="sheet-close" id="sheet-close">✕</button>
      <h2>${escapeHTML(job.title)}</h2>
      <div class="job-salary">${salaryText(job)}</div>
      <div class="job-company" style="margin-top:6px">${escapeHTML(job.company || '未标注公司主体')} · ${escapeHTML(job.city)}${job.district ? ' ' + escapeHTML(job.district) : ''} · ${escapeHTML(job.education)} · ${escapeHTML(job.experience || '经验不限')}</div>
      <div class="job-meta">${(job.tags || []).map((t) => `<span class="tag">${escapeHTML(t)}</span>`).join('')}</div>
      <div class="sheet-sec"><h3>职位描述</h3><p>${escapeHTML(job.description)}</p></div>
      <div class="sheet-sec"><h3>任职要求</h3><ul>${reqHTML}</ul></div>
      ${sourceHTML}
      ${fakeBlock}
      ${applyBtn}
      <div class="tip-mini" style="margin-top:10px">防骗提醒：凡是入职前收取押金、会费、培训费的岗位，一律不要转账。</div>`;

    $('#sheet-mask').hidden = false;
    $('#job-sheet').hidden = false;

    $('#sheet-close').onclick = closeDetail;
    const go = $('#apply-go');
    if (go)
      go.onclick = () => {
        // APK 内经原生桥接用系统浏览器打开投递页；浏览器环境直接新开标签
        if (window.AndroidBridge && window.AndroidBridge.openUrl) window.AndroidBridge.openUrl(job.applyUrl);
        else window.open(job.applyUrl, '_blank');
      };
    else
      $('#apply-demo').onclick = () =>
        window.ZYApp.toast('演示岗位未附投递链接 · 接入真实数据源后点击直达投递');
  }

  function closeDetail() {
    $('#sheet-mask').hidden = true;
    $('#job-sheet').hidden = true;
  }

  function bind() {
    $('#job-search-btn').addEventListener('click', () => {
      state.keyword = $('#job-keyword').value.trim();
      loadList();
    });
    $('#job-keyword').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        state.keyword = e.target.value.trim();
        loadList();
      }
    });
    // 省份下拉（在线时用服务端索引+库内并集；离线隐藏该行）
    (async () => {
      try {
        const data = await window.ZYApi.provinces();
        const list = (data.inDb && data.inDb.length ? data.inDb : data.fromIndex) || [];
        if (!list.length) { $('#filter-province').parentElement.style.display = 'none'; return; }
        const sel = $('#filter-province');
        sel.innerHTML = '<option value="">全部省份</option>' + list.map((p) => `<option value="${escapeHTML(p)}">${escapeHTML(p)}</option>`).join('');
        sel.addEventListener('change', () => {
          state.province = sel.value;
          loadList();
        });
      } catch (e) { /* 离线：保留默认 option */ }
    })();
    ['#filter-city', '#filter-category', '#filter-edu'].forEach((sel) => {
      $(sel).addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        const val = chip.dataset.v;
        const key = sel === '#filter-city' ? 'city' : sel === '#filter-category' ? 'category' : 'education';
        state[key] = val;
        renderFilters();
        loadList();
      });
    });
    $('#sheet-mask').addEventListener('click', closeDetail);
  }

  window.ZYJobs = { init() { renderFilters(); bind(); loadList(); }, reload: loadList };
})();
