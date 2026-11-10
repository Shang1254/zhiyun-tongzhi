/**
 * 知云同职 - 模块三：个人中心
 * 求职画像（匿名三元组） / 今日推荐 / 隐私与数据管理 / 服务连接
 */
(function () {
  const PROFILE_KEY_ID = 'zy_device_id';
  const SERVER_KEY = 'zy_server_url';

  const $ = (sel) => document.querySelector(sel);

  function deviceId() {
    let id = localStorage.getItem(PROFILE_KEY_ID);
    if (!id) {
      id = 'dev_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem(PROFILE_KEY_ID, id);
    }
    return id;
  }

  function readProfileInputs() {
    return {
      direction: $('#pf-direction').value.trim(),
      city: $('#pf-city').value.trim(),
      education: $('#pf-education').value,
    };
  }

  async function saveProfile() {
    const profile = readProfileInputs();
    // 本地：与其他数据一起加密保存
    const vault = (await window.ZYVault.load()) || {};
    await window.ZYVault.save({ ...vault, profile });
    // 服务端：仅上传匿名匹配字段（离线时静默失败，仍可离线推荐）
    const onlineSaved = await window.ZYApi.saveProfile(deviceId(), profile);
    $('#pf-save-state').textContent = onlineSaved ? '已保存 ✓（服务端仅存匿名匹配字段）' : '已保存本地 ✓（离线模式）';
    $('#crypto-state').textContent = '加密状态：' + window.ZYVault.modeLabel() + ' · 已启用';
    setTimeout(() => { $('#pf-save-state').textContent = ''; }, 4000);
    loadDigest();
  }

  async function loadDigest() {
    const vault = (await window.ZYVault.load()) || {};
    const profile = vault.profile || readProfileInputs();
    const wrap = $('#digest-list');
    wrap.innerHTML = '<div class="empty">加载中…</div>';
    const d = await window.ZYApi.digest(profile, deviceId());
    $('#digest-date').textContent = d.date + (d.online ? ' · 每日 9:00 更新' : ' · 离线模式');
    if (!d.items || !d.items.length) {
      wrap.innerHTML = '<div class="empty">暂无推荐，保存画像后试试刷新</div>';
      return;
    }
    wrap.innerHTML = d.items
      .map(
        (j) => `<div class="digest-item" data-id="${j.id}">
          <div><div class="digest-title">${escapeHTML(j.title)} · ${escapeHTML(j.company || '')}</div>
          <div class="digest-reason">${escapeHTML(j.reason || '')}</div></div>
          <div class="digest-salary">${salary(j)}</div></div>`
      )
      .join('');
    wrap.querySelectorAll('.digest-item').forEach((el) => {
      el.addEventListener('click', () => {
        window.ZYApp.go('jobs');
        setTimeout(() => window.ZYJobs.reload(), 60);
      });
    });
  }

  function salary(j) {
    const k = (n) => (n >= 10000 ? (n / 10000).toFixed(n % 10000 === 0 ? 0 : 1) + '万' : n);
    const unit = j.salaryType === 'daily' ? '/天' : '';
    return `${k(j.salaryMin)}-${k(j.salaryMax)}${unit}`;
  }

  function escapeHTML(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function exportData() {
    const vault = (await window.ZYVault.load()) || {};
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), note: '知云同职本地数据导出（明文，请妥善保管）', data: vault }, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '知云同职-本地数据备份.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    window.ZYApp.toast('已导出（含简历信息，请勿外传）');
  }

  async function clearData() {
    if (!confirm('确定清空本机保存的简历、画像等全部数据？此操作不可恢复。')) return;
    window.ZYVault.clear();
    window.ZYApp.toast('本地数据已清空');
    setTimeout(() => location.reload(), 800);
  }

  async function testServer() {
    const url = $('#srv-url').value.trim();
    if (url) window.ZYApi.setBaseUrl(url);
    else window.ZYApi.setBaseUrl('');
    $('#srv-state').textContent = '测试中…';
    try {
      const h = await window.ZYApi.health();
      $('#srv-state').textContent = `已连接 ✓ ${h.app || ''}`;
      window.ZYJobs.reload();
      loadDigest();
    } catch (e) {
      $('#srv-state').textContent = '连接失败（将使用内置离线数据）';
    }
    setTimeout(() => { $('#srv-state').textContent = ''; }, 5000);
  }

  async function init() {
    // 回填画像与服务地址
    const vault = (await window.ZYVault.load()) || {};
    const p = vault.profile || {};
    $('#pf-direction').value = p.direction || '';
    $('#pf-city').value = p.city || '';
    $('#pf-education').value = p.education || '大专';
    $('#srv-url').value = localStorage.getItem(SERVER_KEY) || (location.protocol === 'file:' ? '' : location.origin);

    $('#crypto-state').textContent = '加密状态：' + window.ZYVault.modeLabel() + (window.ZYVault.hasData() ? ' · 已启用' : ' · 待首次保存后启用');

    $('#pf-save').addEventListener('click', saveProfile);
    $('#btn-export-data').addEventListener('click', exportData);
    $('#btn-clear-data').addEventListener('click', clearData);
    $('#srv-test').addEventListener('click', testServer);
    $('#af-check').addEventListener('click', antiFraudCheck);

    loadDigest();
  }

  /** 防骗检测（13 类诈骗规则库）：优先走服务端研判，断网/静态版用同一份规则库本地研判 */
  async function antiFraudCheck() {
    const text = $('#af-text').value.trim();
    if (!text) return window.ZYApp.toast('请先粘贴要检测的文本');
    $('#af-state').textContent = '研判中…';
    const box = $('#af-result');

    let r = null;
    const cfg = window.ZY_CONFIG || {};
    // 纯静态部署没有后端：直接本地研判，免去一次注定 404/501 的请求
    const serverAvailable = cfg.mode !== 'static' || !!cfg.apiBase;
    if (serverAvailable) try {
      const resp = await fetch((cfg.apiBase || '') + '/api/antifraud/check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
      });
      if (resp.ok) r = await resp.json();
    } catch (e) { /* 无后端时走本地规则引擎 */ }

    if (!r && window.ZYFraudGuard) {
      // 与服务端同一份规则库（server/src/services/fraudGuard.js 同步而来），结果口径一致
      const local = window.ZYFraudGuard.buildReport(text.slice(0, 2000));
      r = {
        ok: true,
        ...local,
        hotline: '96110（反诈专线）/ 110 / 国家反诈中心 App',
        reminder: '检测结果仅供风险提示与教育，不构成法律意见；最终以公安机关认定为准。',
        offline: true,
      };
    }

    if (!r) {
      $('#af-state').textContent = '';
      return window.ZYApp.toast('检测服务暂不可用，请稍后再试');
    }

    const levelColor = r.level === '高危' ? 'var(--danger)' : r.level === '中危' ? '#b45309' : '#16a34a';
    box.hidden = false;
    box.innerHTML = `
        <div style="margin-top:12px;border-top:1px dashed var(--line);padding-top:10px">
          <div style="font-size:14px;font-weight:700">研判：<span style="color:${levelColor}">${esc(r.level)}</span>
            <span style="font-size:11px;color:var(--sub)">（${esc(r.verdict)}${r.offline ? ' · 本地研判' : ''}）</span></div>
          <div style="font-size:12.5px;line-height:1.7;margin:6px 0">${esc(r.summary)}</div>
          ${(r.matches || []).map((m) => `
            <div class="fake-reasons" style="margin-bottom:6px">
              <b>${esc(m.name)}</b>（${esc(m.risk)}，得分 ${m.score}）<br>命中特征：${esc(m.hits.join('、'))}<br>
              处置建议：${esc(m.dispose)}
            </div>`).join('')}
          <div style="font-size:11.5px;color:var(--sub);line-height:1.7">
            黄金三步：${(r.goldenSteps || []).map((s, i) => (i + 1) + ') ' + esc(s)).join(' ')}<br>
            举报：${esc(r.hotline || '96110')}
          </div>
        </div>`;
    $('#af-state').textContent = '';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.ZYProfile = { init, reloadDigest: loadDigest };
})();
