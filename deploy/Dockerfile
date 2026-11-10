# 知云同职 · 公网部署镜像
# 构建：docker build -f deploy/Dockerfile -t zhiyun-tongzhi .
# 运行：docker run -d -p 3000:3000 -v zhiyun-data:/data --name zhiyun zhiyun-tongzhi
#
# 说明：前端与后端同镜像交付；SQLite 落在 /data 卷上，重建容器不丢岗位库与拼车信息。

FROM node:22-bookworm-slim AS deps
WORKDIR /app/server
COPY server/package*.json ./
# 采集器依赖 playwright，但公网站点不需要浏览器内核，跳过下载（省约 300MB）
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    ZY_DATA_DIR=/data \
    TZ=Asia/Shanghai

COPY --from=deps /app/server/node_modules ./server/node_modules
COPY server/package.json ./server/package.json
COPY server/src ./server/src
COPY server/scripts ./server/scripts
COPY server/data/seed-jobs.json ./server/data/seed-jobs.json
COPY server/data/university-sites.json ./server/data/university-sites.json
COPY web ./web
COPY national_city_index.csv ./national_city_index.csv

RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server/src/index.js"]
