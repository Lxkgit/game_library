# Game Library

个人 Steam 游戏库管理平台。

## 当前版本

V0.1 MVP：

- 使用公开 Steam 游戏库读取真实游戏数据
- SteamID 配置在 `src/config/steam.ts`
- 当前不需要 Steam Web API Key
- 游戏库卡片展示
- 搜索游戏
- 按「全部 / 正在玩 / 未开始 / 已通关 / 收藏」筛选
- 收藏、状态、评分、备注保存在浏览器 localStorage
- 游玩时间与基础统计
- 响应式布局

## Steam 数据

当前使用 Steam Community 的公开 XML 游戏库数据：

```text
https://steamcommunity.com/profiles/{SteamID64}/games/?tab=all&xml=1
```

Steam 官方文档已经将 Community XML 标记为 deprecated，因此当前只把它作为前端 MVP 的无 Key 数据源。后续如果增加后端，再切换到 Steam Web API。

## 开发

```bash
npm install
npm run dev
```

开发环境通过 Vite proxy 将 `/tool/game/steam-community/*` 转发到 `steamcommunity.com`，避免浏览器 CORS。

## 生产环境

由于页面部署路径为 `/tool/game/`，Nginx 需要增加同源代理：

```nginx
location ^~ /tool/game/steam-community/ {
    proxy_pass https://steamcommunity.com/;
    proxy_ssl_server_name on;
    proxy_set_header Host steamcommunity.com;
    proxy_set_header User-Agent $http_user_agent;
    proxy_set_header Accept-Encoding "";
}
```

## 后续规划

1. Steam 游戏详情与成就
2. 游戏状态、评分、标签、笔记完善
3. 游玩时间统计与年度总结
4. Steam Web API / 后端同步
5. MySQL + Spring Boot 后端
6. Docker 部署
