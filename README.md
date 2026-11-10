# 知云同职 · 民办生公益求职助手

> 永久免费 · 非盈利 · 无广告 · 无付费入口 · 用户数据本地加密存储

「知云同职」是一套可直接运行的求职公益应用：**安卓 APP（WebView 壳）+ Node.js 轻后端 + 共享 Web 前端**，面向民办高校学生，提供岗位库、虚假岗过滤、简历定制生成与每日岗位推荐。

![技术栈](https://img.shields.io/badge/Android-WebView_壳-1E6FFF) ![后端](https://img.shields.io/badge/Node.js-Express_+_SQLite-1E6FFF) ![定位](https://img.shields.io/badge/%E5%AE%9A%E4%BD%8D-%E5%85%AC%E7%9B%8A%E5%85%8D%E8%B4%B9-16a34a)

> **在线地址（GitHub Pages，海外托管）**：https://shang1254.github.io/zhiyun-tongzhi/
> 源码仓库：https://github.com/Shang1254/zhiyun-tongzhi（`main` 为源码，`gh-pages` 为站点）

## 核心能力

| 模块 | 说明 |
| --- | --- |
| 🗂 岗位库 | 搜索 / 城市·类别·学历筛选 / 详情抽屉 / 投递跳转 |
| 🏛 官方岗位采集 | 每日 0 点礼貌采集人社部中国公共招聘网 + 湖北民办高校就业联盟（晴川学院等 7 校）真实岗位，自动过虚假岗引擎，带来源标注与原文投递链接 |
| 🛡 虚假岗过滤 | 可解释规则评分引擎（≥60 分判虚假）：刷单返款、培训贷、入职收费、境外高薪、薪资虚标、零门槛超高薪；附「判定理由」防骗教育视图 |
| 📄 简历生成 | 民办生画像模板：实践项目置顶、亮点自动生成、A4 预览、一键导出 PDF |
| 👤 个人中心 | 求职画像（方向/城市/学历）、今日推荐 3 条（带推荐理由）、本地加密数据管理 |
| 🛡 防骗检测 | 13 类国内高发诈骗研判（同一份规则库前后端复用，断网也能检测；入口在个人中心） |
| 🚗 拼车同行 | 公益信息公告板：发布/筛选/举报/删除令牌，联系方式打码，过期自动清理 |
| 🌐 公网上线 | 静态站导出（`npm run build:site`）+ PWA 离线 + Docker/Render/Fly 配置，见 [docs/上线部署指南.md](docs/上线部署指南.md) |
| ⏰ 定时任务 | 03:00 岗位库复检（虚假岗重评 + 过期标记）；09:00 按画像生成每日推荐 |

## 目录结构

```
├── server/            # 轻后端：Express + better-sqlite3 + node-cron
│   ├── src/           #   路由 / 服务（jobFilter 评分引擎 / resumeBuilder / dailyDigest）
│   ├── scripts/       #   build-site.js 静态站导出、smoke.js 上线冒烟检查
│   └── data/          #   内置演示岗位库 seed-jobs.json（40 条含 6 条骗术样本）
├── web/               # 前端（浏览器与 APK assets 共用）：蓝白公益风 SPA + PWA
├── android/           # 安卓 WebView 壳工程（Java，minSdk 24）
├── deploy/            # Dockerfile / docker-compose / Caddyfile
├── dist/site/         # npm run build:site 产物（可直接上传任意静态托管）
├── docs/              # 主Agent提示词 / 子Agent三件套提示词 / 使用与部署 / 上线部署
└── AGENTS.md          # ZCode 打开本项目自动生效的主 Agent 提示词
```

## 快速开始

**网页版（30 秒）：**

```bash
cd server && npm install && npm start
# 打开 http://localhost:3000
```

**静态版（可挂 GitHub Pages / Cloudflare Pages）：**

```bash
cd server && npm run build:site     # 产出 dist/site，约 1.2MB
```

**上线自检：**

```bash
cd server && npm run selfcheck                        # 环境与数据自检
cd server && npm run smoke -- https://你的域名         # 浏览器冒烟 6 项
```

**安卓 APP：**

- 直接安装现成 APK：`android/app/build/outputs/apk/debug/app-debug.apk`
- 或自行构建：`cd android && gradle assembleDebug`（需 JDK 17 + Android SDK，路径见 `gradle.properties` / `local.properties`）
- APP 离线可用；连接服务请在「个人中心 → 服务连接」填电脑局域网地址

详细说明见 **[docs/使用与部署说明.md](docs/使用与部署说明.md)**。

## 合规与隐私（务必阅读）

- **不爬取招聘平台**：爬取 BOSS 直聘等平台违反其用户协议且有法律风险。数据走导入接口接入（自动过虚假岗引擎），推荐使用公开就业信息、企业官网校招页、学校就业中心合作岗位等合规来源。
- **内置数据为虚构演示**：40 条岗位的公司名均为虚构，其中 6 条为骗术对照样本，用于防骗教育。
- **隐私设计**：简历/画像仅存用户设备（AES-GCM-256 加密）；服务端只存匿名匹配三元组；简历正文永不上传。

## 文档索引

- [docs/主Agent提示词-ZCode版.md](docs/主Agent提示词-ZCode版.md) — 用户原始提示词的可执行落地版
- [docs/ZCode-继续开发提示词.md](docs/ZCode-继续开发提示词.md) — v1.5.1 现状 + 可直接粘贴的续开提示词 + 待办优先级
- [docs/项目完善点评估-v1.5.1.md](docs/项目完善点评估-v1.5.1.md) — 安全/数据/工程/体验的问题清单与验收标准
- [docs/子Agent提示词-三件套.md](docs/子Agent提示词-三件套.md) — 岗位校验 / 简历生成 / 每日推送 三个子Agent
- [docs/使用与部署说明.md](docs/使用与部署说明.md) — 部署、数据导入、定时任务、能力边界
- [docs/上线部署指南.md](docs/上线部署指南.md) — 海外上线：静态托管 / Render / Fly / VPS / 临时隧道
