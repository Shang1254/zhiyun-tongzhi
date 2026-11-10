/**
 * 知云同职 - 模块四：拼车同行（公益信息公告板）
 * 发布（反诈过滤+删除令牌）/ 列表（联系方式打码+点击查看）/ 我的发布（本机令牌）/ 举报
 */
(function () {
  let rideType = '找车';

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // ---- 本机令牌库（与简历同入加密保险库） ----
  async function myTokens() {
    const vault = (await window.ZYVault.load()) || {};
    return vault.rides || []; // [{id, type, route, date, token}]
  }
  async function saveMyToken(entry) {
    const vault = (await window.ZYVault.load()) || {};
    const rides = vault.rides || [];
    rides.push(entry);
    await window.ZYVault.save({ ...vault, rides });
  }
  async function removeMyToken(id) {
    const vault = (await window.ZYVault.load()) || {};
    await window.ZYVault.save({ ...vault, rides: (vault.rides || []).filter((r) => r.id !== id) });
  }

  // ---- 发布 ----
  async function publish() {
    if (!$('#ride-agree').checked) return window.ZYApp.toast('请先勾选同意免责声明');
    const body = {
      type: rideType,
      from_city: $('#ride-from').value.trim(),
      to_city: $('#ride-to').value.trim(),
      ride_date: $('#ride-date').value,
      ride_time: $('#ride-time').value.trim(),
      seats: $('#ride-seats').value,
      contact_type: $('#ride-contact-type').value,
      contact: $('#ride-contact').value.trim(),
      note: $('#ride-note').value.trim(),
    };
    if (!body.ride_date) return window.ZYApp.toast('请选择出发日期');
    $('#ride-pub-state').textContent = '发布中…';
    try {
      const r = await fetch('/api/rides', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error || '发布失败');
      await saveMyToken({ id: r.id, type: body.type, route: body.from_city + '→' + body.to_city, date: body.ride_date, token: r.deleteToken });
      $('#ride-pub-state').textContent = '已发布 ✓ 删除令牌已存本机';
      ['#ride-from', '#ride-to', '#ride-time', '#ride-contact', '#ride-note'].forEach((s) => { $(s).value = ''; });
      renderMine();
      loadRides();
    } catch (e) {
      $('#ride-pub-state').textContent = '';
      window.ZYApp.toast(e.message);
    }
    setTimeout(() => { $('#ride-pub-state').textContent = ''; }, 5000);
  }

  // ---- 列表 ----
  async function loadRides() {
    const wrap = $('#ride-list');
    wrap.innerHTML = '<div class="empty">加载中…</div>';
    const params = new URLSearchParams();
    if ($('#ride-filter-from').value.trim()) params.set('from', $('#ride-filter-from').value.trim());
    if ($('#ride-filter-to').value.trim()) params.set('to', $('#ride-filter-to').value.trim());
    try {
      const d = await fetch('/api/rides?' + params.toString()).then((x) => x.json());
      if (!d.list.length) { wrap.innerHTML = '<div class="empty">暂无拼车信息，发布第一条吧</div>'; return; }
      wrap.innerHTML = d.list.map((r) => `
        <div class="card ride-card" data-id="${r.id}">
          <div class="ride-route"><span class="ride-city">${esc(r.from_city)}</span><span class="ride-arrow">→</span><span class="ride-city">${esc(r.to_city)}</span>
            <span class="tag ${r.type === '带人' ? '' : 'warn'}" style="margin-left:auto">${r.type === '带人' ? '🚙 带人 · ' + r.seats + '座' : '🧍 找车'}</span></div>
          <div class="ride-meta">📅 ${esc(r.ride_date)} ${esc(r.ride_time || '')} · ${esc(r.contact_type)}联系：<b class="ride-contact-masked">${esc(r.contact)}</b></div>
          ${r.note ? `<div class="ride-note">${esc(r.note)}</div>` : ''}
          <div class="row-btns">
            <button class="btn btn-ghost btn-sm ride-show-contact">查看完整${esc(r.contact_type)}</button>
            <button class="btn btn-danger-ghost btn-sm ride-report">举报</button>
          </div>
        </div>`).join('');

      wrap.querySelectorAll('.ride-card').forEach((card) => {
        const id = card.dataset.id;
        card.querySelector('.ride-show-contact').addEventListener('click', async () => {
          try {
            const full = await fetch('/api/rides/' + id).then((x) => x.json());
            const el = card.querySelector('.ride-contact-masked');
            el.textContent = full.contact || full.error;
            el.classList.add('revealed');
            card.querySelector('.ride-show-contact').remove();
          } catch (e) { window.ZYApp.toast('获取失败'); }
        });
        card.querySelector('.ride-report').addEventListener('click', async () => {
          if (!confirm('举报该条信息？举报后将立即下架待处理。')) return;
          await fetch('/api/rides/' + id + '/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'user-report' }) });
          window.ZYApp.toast('已下架待处理，感谢反馈');
          loadRides();
        });
      });
    } catch (e) {
      wrap.innerHTML = '<div class="empty">加载失败，请稍后重试</div>';
    }
  }

  // ---- 我的发布 ----
  async function renderMine() {
    const mine = await myTokens();
    const card = $('#ride-mine-card');
    if (!mine.length) { card.hidden = true; return; }
    card.hidden = false;
    $('#ride-mine-list').innerHTML = mine.map((m) => `
      <div class="digest-item" data-id="${m.id}">
        <div><div class="digest-title">${esc(m.route)} · ${esc(m.date)} · ${esc(m.type)}</div></div>
        <button class="btn btn-danger-ghost btn-sm ride-del">下架</button>
      </div>`).join('');
    $('#ride-mine-list').querySelectorAll('.ride-del').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.closest('.digest-item').dataset.id;
        const entry = mine.find((m) => String(m.id) === String(id));
        if (!confirm('下架该条拼车信息？')) return;
        const r = await fetch('/api/rides/' + id, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: entry.token }) }).then((x) => x.json());
        if (r.ok) {
          await removeMyToken(String(id));
          window.ZYApp.toast('已下架');
          renderMine();
          loadRides();
        } else {
          window.ZYApp.toast(r.error || '下架失败');
        }
      });
    });
  }

  function bind() {
    document.querySelectorAll('[data-ride-type]').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('[data-ride-type]').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        rideType = chip.dataset.rideType;
      });
    });
    // 默认填明天（按本地时区，避免凌晨时被 UTC 日期算成今天）
    const d = new Date(Date.now() + 86400000);
    const pad = (n) => String(n).padStart(2, '0');
    $('#ride-date').value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    $('#ride-publish').addEventListener('click', publish);
    $('#ride-filter-btn').addEventListener('click', loadRides);
  }

  window.ZYRide = { init() { bind(); renderMine(); loadRides(); } };
})();
