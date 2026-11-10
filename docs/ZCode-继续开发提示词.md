# 知云同职 · 给 ZCode 的继续开发提示词（v1.5.1）

> 用法：把本文**第一节**整段复制给 ZCode 当首条消息即可开工；后面是背景资料，ZCode 需要时自己读。
> 同时把项目根目录的 `AGENTS.md` 留在原处——ZCode 打开项目会自动加载它。

---

## 一、可直接粘贴的提示词（复制这一段）

```
你是「知云同职」项目的继续开发者。这是一个已上线运行的公益求职应用，不是从零开始的新项目。

【项目是什么】
面向民办高校学生的免费求职助手：岗位库（含官方渠道采集）、虚假岗过滤、简历生成、拼车同行、防骗检测。
安卓 APP（WebView 壳）+ Node/Express/SQLite 轻后端 + 共享 Web 前端（含 PWA）。
当前版本 v1.5.1，已部署公网（Cloudflare 隧道 + 可静态托管）。

【开工前必做】
1. 读项目根目录 AGENTS.md（项目规则，隐私与合规红线都在里面）。
2. 读 docs/使用与部署说明.md、docs/上线部署指南.md。
3. 跑一次现状确认：
   cd server && npm run selfcheck
   cd server && npm start          # 另开终端
   cd server && npm run smoke -- http://127.0.0.1:3000
   必须 6/6 通过再动代码。

【技术栈与目录】
server/src/index.js        入口（生产化：限流、安全头、优雅退出）
server/src/routes/         jobs / resume / user / digest / rides / antifraud / fetcher / admin
server/src/services/       jobFilter（虚假岗评分）、fraudGuard（13 类诈骗规则）、resumeBuilder、dailyDigest、rideGuard、geo、jobStore
server/src/fetcher/        官方岗位采集（mohrss / wllm / ncss），礼貌限速，不绕限制
server/src/cron.js         00:00 采集 / 03:00 复检 / 09:00 推荐
server/scripts/            build-site.js（静态站导出）、smoke.js（浏览器冒烟）
web/                       前端 SPA（蓝白公益风），js/api.js 负责联网与离线降级
android/                   WebView 壳；assets/www 是 web/ 的副本
deploy/                    Dockerfile / compose / Caddyfile / start-public.ps1

【不可违背的红线】
- 永不收费、无广告、无付费入口；不引入任何需要 API Key 的付费服务。
- 简历与画像只存用户设备本地（AES 加密）；服务端只存匿名三元组（方向/城市/学历）。
- 拼车联系方式必须维持四道设计：明示公开、列表打码、点击查看、删除令牌。禁止二次利用。
- 不爬 BOSS 直聘/智联/前程无忧等平台；只采政府与高校公开岗位，保持 3-8 秒间隔、可识别 UA、遵守 robots。
- 管理接口（/api/admin/*、/api/jobs/import）必须保留 requireAdmin 保护，不得为了调试摘掉。
- 部署配置里不写死密钥、Token、账号。

【工作方式】
- 一次只做一件事，小步改动；每改完一块就跑 selfcheck + smoke，别攒到最后一起验。
- 改后端逻辑前先看有没有离线/静态降级路径：静态站没有 /api，前端会用 window.ZY_CONFIG.mode 判断。
- 改 web/ 之后必须：npm run build:site → 重新同步 android/app/src/main/assets/www → gradle assembleDebug。
- 改 web/js/fraudGuard.js 是无效改动，规则库唯一源是 server/src/services/fraudGuard.js，build:site 会覆盖同步。
- 新增依赖前先问：能不能用现有实现？能不加就不加。加的话必须是可离线、免费、MIT/Apache 类许可。
- 数据库改动一律写「轻量迁移」（参考 server/src/db.js 的 migrate()），不能要求用户删库。
- 交付时给出：改了哪些文件、为什么、怎么验证、还有什么没做（不要只报完成）。

【本轮要做的优先级】
P0：
1. 拼车举报防滥用（现在任何人可把任意信息置为 hidden）：新增 ride_reports 表，同 IP 同贴只记一次，累计 3 个不同来源才自动下架，否则进待审。
2. 把 ZY_ADMIN_TOKEN 注入 render.yaml / fly.toml 的密钥配置，并在部署文档里写清生成方式。
3. 新增独立的隐私政策 / 用户协议 / 免责声明页面（web/privacy.html），页脚与个人中心挂链接。
4. SQLite 每日自动备份：03:00 复制到 data/backups，保留 7 份，接口可查最近备份时间。
P1：
5. 城市筛选动态化：现在 jobs.js 写死 9 个城市；改为从 /api/stats/by-province 生成，并与省份选择联动。
6. 岗位列表分页/加载更多（现在固定一次 50 条）。
7. 岗位收藏 + 投递记录（本地加密存储），个人中心加「求职进度」。
8. 简历模板多样化（简洁/项目型/技能型）+ 支持导出 Word。
9. 采集质量看板：把 /api/fetcher/last-report 的结果展示到「个人中心 → 数据更新」，并说明 0 条是站点限制而非故障。
P2：
10. 单元测试（node:test）覆盖 jobFilter / rideGuard / fraudGuard / geo 的关键分支。
11. 初始化 git 仓库 + .gitignore + GitHub Actions（lint + test + smoke）。
12. 静态站补 sitemap.xml、Open Graph 分享卡片。

先做 P0 第 1 项，做完停下来汇报，等我确认再继续。
```

---

## 二、附录 A · 现状快照（2026-11-10）

### 已上线的东西

| 项 | 状态 |
| --- | --- |
| 版本 | v1.5.1（versionCode 6） |
| 公网入口 | Cloudflare 隧道（本机启动，地址每次重启变化）；静态包可挂任意静态托管 |
| 岗位库 | 94 条（有效 85 条：人社部 19、武汉晴川学院 32、演示 34；虚假岗样本 6 条单独留存） |
| 每日任务 | 00:00 采集 / 03:00 复检+拼车清理 / 09:00 推荐（容器时区必须 `TZ=Asia/Shanghai`） |
| 验证基线 | `npm run smoke` 在 首页服务版 / 静态站 / 公网地址 三种形态都是 6/6 |

### 刚修掉的三处线上缺口（别改回去）

1. `POST /api/admin/run-now` 原用 `req.socket.remoteAddress` 判断本机，反代后永远 127.0.0.1，等于公网可触发。已改为 `req.ip` + `requireAdmin`。
2. `POST /api/jobs/import` 原对公网开放，任何人可往库里灌岗位。已加 `requireAdmin`（本机直连或 `ZY_ADMIN_TOKEN`）。
3. `GET /api/rides/:id` 原返回 `delete_token_hash`。已改为白名单字段，且 `status` 不外泄。

另外统一了「今天」的口径：新增 `server/src/utils/date.js`，全站（拼车、推荐、采集日志、报告文件名）都按**本地时区**算日期，避免东八区凌晨取到 UTC 昨天。

### 关键约定

- 版本号唯一源：`server/src/config.js` 的 `version`（构建静态站、健康检查都读它）。
- 前端配置注入：`web/js/config.js` 本地默认，`build:site` 会覆写（含 `apiBase`、`mode: static`）。
- 离线降级：`web/js/api.js` 里 jobs/stats/digest/provinces 都有 seed 回退；防骗检测有本地规则引擎。
- 限流：读 120/min、写 20/min，内存实现（单实例够用，多实例需换共享存储）。

---

## 三、附录 B · 技术债清单（改之前先知道）

| 债 | 影响 | 建议 |
| --- | --- | --- |
| 项目不是 git 仓库 | 没有回滚点，多人/多轮改动互相覆盖风险高 | 先 `git init` + `.gitignore`（node_modules、`server/data/*.db*`、`dist`、`*.apk`、android/.gradle） |
| playwright 在 dependencies | 生产镜像要跳过浏览器下载，否则多 300MB | 移到 `optionalDependencies`，`fetcher/wllm` 渲染失败时降级为 HTTP |
| 城市筛选写死 9 城 | 全国 31 省数据无法筛 | 动态生成 + 省市级联 |
| 前端手写 HTML 模板 | 多处 `esc()`，容易漏导致 XSS | 抽 `web/js/render.js` 统一转义，或统一走一个 `html` 模板函数 |
| 静态版与动态版口径不一 | 静态版不展示"可能已过期"标记 | `build:site` 可导出 `expired` 字段，前端统一渲染 |
| APK assets 手动复制 | 前端改了忘同步，APK 与网站不一致 | gradle 里加 `syncWebAssets` task，或脚本化 |
| 限流是进程内 Map | 多实例/重启丢失 | 单实例部署先接受；要扩就上 Redis 或平台级限流 |
| 采集成功率低 | mohrss 20 条全部"库内跳过"（去重 key 过严？），wllm 0-32 波动 | 排查 `jobStore.upsertJob` 的 id 生成与去重；wllm 渲染模式失败要能自动降级 |

---

## 四、附录 C · 验收命令

```powershell
# 环境与数据
cd server; npm run selfcheck

# 单测（P2 做了之后）
cd server; npm test

# 浏览器冒烟（本地 / 静态 / 公网都适用）
cd server; npm run smoke -- http://127.0.0.1:3000
cd server; npm run smoke -- https://你的域名

# 安全回归（公网必须 403，本机必须 200）
curl -i -X POST "https://你的域名/api/admin/run-now?task=refresh"     # 期望 403
curl -i -X POST "https://你的域名/api/jobs/import" -d '{"json":[]}'    # 期望 403
curl -s "https://你的域名/api/rides/1" | findstr delete_token_hash      # 期望无输出

# 静态包
cd server; npm run build:site
```

---

## 五、附录 D · 交付格式要求

每次交付回复里必须有这四块，缺一块视为没做完：

1. **改了什么**：文件清单 + 一句话说明。
2. **为什么**：对应哪个问题/需求。
3. **怎么验证**：实际跑过的命令与输出结论（不是"应该可以"）。
4. **没做什么 / 风险**：明确遗留项，不要用"后续可优化"糊过去。
