/**
 * Steam 配置
 *
 * 当前版本只读取公开 Steam 游戏库，不使用 Steam Web API Key。
 * 881898288 为 Steam Account ID，服务请求时转换为 64 位 SteamID。
 */
export const STEAM_CONFIG = {
  accountId: '881898288',
  profileId: '76561198842164016',
  profileUrl: 'https://steamcommunity.com/profiles/76561198842164016/',
} as const
