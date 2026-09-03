import { STEAM_CONFIG } from '../config/steam'

export type SteamGame = {
  appid: number
  name: string
  hours: number
  lastPlayed: string
  image: string
  storeUrl: string
}

function text(parent: Element, selector: string) {
  return parent.querySelector(selector)?.textContent?.trim() ?? ''
}

function toDateTime(value: string) {
  if (!value) return ''
  const timestamp = Number(value)
  if (!Number.isFinite(timestamp)) return ''
  return new Date(timestamp * 1000).toLocaleDateString('zh-CN')
}

/**
 * 读取 Steam 公开游戏库 XML。
 *
 * Steam 官方已经将 Community XML 标记为 deprecated，但它目前仍是
 * 无 API Key 获取公开游戏库的直接方式。浏览器生产环境需要通过同源
 * reverse proxy 转发到 steamcommunity.com，避免 CORS。
 */
export async function fetchSteamGames(): Promise<SteamGame[]> {
  const url = `/steam-community/profiles/${STEAM_CONFIG.profileId}/games/?tab=all&xml=1`
  const response = await fetch(url, { headers: { Accept: 'application/xml,text/xml' } })

  if (!response.ok) {
    throw new Error(`Steam 返回 HTTP ${response.status}`)
  }

  const xml = await response.text()
  const document = new DOMParser().parseFromString(xml, 'application/xml')

  if (document.querySelector('parsererror')) {
    throw new Error('Steam 游戏数据解析失败')
  }

  const games = Array.from(document.querySelectorAll('game'))
    .map((game): SteamGame | null => {
      const appid = Number(text(game, 'appID'))
      const name = text(game, 'name')
      if (!appid || !name) return null

      const logo = text(game, 'logo')
      const hours = Number(text(game, 'hoursOnRecord')) || 0
      const lastPlayed = toDateTime(text(game, 'lastPlayed'))

      return {
        appid,
        name,
        hours: Math.round(hours * 10) / 10,
        lastPlayed: lastPlayed || '从未',
        image: logo || `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`,
        storeUrl: `https://store.steampowered.com/app/${appid}/`,
      }
    })
    .filter((game): game is SteamGame => game !== null)

  return games
}
