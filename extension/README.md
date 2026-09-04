# Game Library Steam Connector

用于让 Game Library 网页通过 Chrome / Edge 扩展读取公开 Steam 游戏库。

## 安装

1. 打开 Chrome 或 Edge 的扩展管理页面。
2. 开启“开发者模式”。
3. 选择“加载已解压的扩展”。
4. 选择当前项目中的 `extension` 目录。
5. 确认扩展已启用。
6. 刷新 Game Library 页面。

## 工作方式

```text
Game Library 网页
        ↓
      content.js
        ↓
    background.js
        ↓
 Steam Community XML
        ↓
      Game Library
```

扩展只请求公开 Steam 游戏库，不使用 Steam Web API Key。

当前 Steam 账号通过项目配置中的 SteamID64 `76561198842164016` 固定读取。
