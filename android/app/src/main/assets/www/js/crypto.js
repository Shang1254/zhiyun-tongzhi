/**
 * 知云同职 - 本地加密存储层
 * 优先使用 Web Crypto（AES-GCM-256 + PBKDF2-SHA256 25万次迭代）；
 * 在不支持 secure context 的 WebView（file://）环境自动回退 CryptoJS AES。
 * 用途：用户简历与画像只保存在本机并加密，绝不外传。
 */
(function () {
  const VAULT_KEY = 'zy_vault';
  const PASS_KEY = 'zy_pass_hint';

  // ---------- Web Crypto 实现 ----------
  const subtleOK = !!(window.crypto && window.crypto.subtle);

  function b64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }
  function unb64(str) {
    const bin = atob(str);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }

  async function deriveKeyWebCrypto(pass, salt) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function saveWebCrypto(data, pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKeyWebCrypto(pass, salt);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data)));
    localStorage.setItem(VAULT_KEY, JSON.stringify({ v: 2, mode: 'aes-gcm', salt: b64(salt), iv: b64(iv), ct: b64(ct) }));
    localStorage.setItem(PASS_KEY, JSON.stringify({ hasCustom: pass !== defaultPass() }));
  }

  async function loadWebCrypto(pass) {
    const raw = localStorage.getItem(VAULT_KEY);
    if (!raw) return null;
    const box = JSON.parse(raw);
    if (box.mode !== 'aes-gcm') return loadCryptoJS(pass); // 旧数据回退链
    const key = await deriveKeyWebCrypto(pass, unb64(box.salt));
    try {
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct));
      return JSON.parse(new TextDecoder().decode(pt));
    } catch (e) {
      throw new Error('PASS_WRONG');
    }
  }

  // ---------- CryptoJS 回退（file:// WebView 等无 subtle 环境） ----------
  function loadCryptoJS(pass) {
    const raw = localStorage.getItem(VAULT_KEY);
    if (!raw) return null;
    const box = JSON.parse(raw);
    const ct = box.mode === 'cryptojs' ? box.ct : raw; // 兼容直接整串加密的历史格式
    try {
      const bytes = CryptoJS.AES.decrypt(ct, pass);
      return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
    } catch (e) {
      throw new Error('PASS_WRONG');
    }
  }

  function saveCryptoJS(data, pass) {
    const ct = CryptoJS.AES.encrypt(JSON.stringify(data), pass).toString();
    localStorage.setItem(VAULT_KEY, JSON.stringify({ v: 2, mode: 'cryptojs', ct }));
    localStorage.setItem(PASS_KEY, JSON.stringify({ hasCustom: pass !== defaultPass() }));
  }

  // ---------- 对外接口 ----------
  function defaultPass() {
    // 设备默认密钥：换浏览器/设备需重新填写；可在个人中心设置自定义隐私口令
    return localStorage.getItem('zy_custom_pass') || 'zhiyun-tongzhi-local';
  }

  const vault = {
    /** 加密并保存对象 */
    async save(data) {
      const pass = defaultPass();
      if (subtleOK) await saveWebCrypto(data, pass);
      else saveCryptoJS(data, pass);
    },
    /** 读取并解密对象 */
    async load() {
      if (!localStorage.getItem(VAULT_KEY)) return null;
      const pass = defaultPass();
      return subtleOK ? loadWebCrypto(pass) : loadCryptoJS(pass);
    },
    /** 清空保险库 */
    clear() {
      localStorage.removeItem(VAULT_KEY);
      localStorage.removeItem(PASS_KEY);
      localStorage.removeItem('zy_custom_pass');
    },
    /** 当前加密模式说明（个人中心展示） */
    modeLabel() {
      if (subtleOK) return '标准加密（AES-GCM-256 · PBKDF2 25万次迭代）';
      if (window.CryptoJS) return '兼容加密（CryptoJS AES · WebView 离线模式）';
      return '未加密（异常，请更新浏览器/WebView）';
    },
    hasData() {
      return !!localStorage.getItem(VAULT_KEY);
    },
  };

  window.ZYVault = vault;
})();
