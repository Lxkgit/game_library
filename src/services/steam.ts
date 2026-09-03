import { STEAM_CONFIG } from '../config/steam'

export type SteamGame = {
  appid: number
  name: string
  hours: number
  lastPlayed: string
  image: string
  storeUrl: string
}

function toDateTime(value: string) {
  if (!value) return '从未'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '从未'

  return date.toLocaleDateString('zh-CN')
}

/**
 * 读取构建阶段从 Steam 公开游戏库生成的静态 JSON。
 *
 * 这样浏览器只访问当前站点的静态资源，不需要 Steam API Key、后端服务、
 * CORS 代理，也不需要修改基础 nginx 配置。
 */
export async function fetchSteamGames(): Promise<SteamGame[]> {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
  const url = `${base}steam-games.json`

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const games = await response.json()
    if (!Array.isArray(games)) {
      throw new Error('Steam 游戏数据格式错误')
    }

    return games
      .filter((game) => Number(game?.appid) && typeof game?.name === 'string')
      .map((game) => {
        const appid = Number(game.appid)
        return {
          appid,
          name: game.name,
          hours: Number(game.hours) || 0,
          lastPlayed: toDateTime(String(game.lastPlayed ?? '')),
          image: game.image || `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`,
          storeUrl: game.storeUrl || `https://store.steampowered.com/app/${appid}/`,
        }
      })
  } catch (error) {
    throw new Error(`Steam 数据加载失败：${error instanceof Error ? error.message : '请求失败'}`)
  }
}

export { STEAM_CONFIG }
