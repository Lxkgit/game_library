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
 * Steam 官方已将 Community XML 标记为 deprecated，但目前仍可用于
 * “公开游戏库 + 纯前端 + 不使用 API Key”的 MVP。
 *
 * 注意：games 后面不要加 `/`，使用 Steam 当前公开格式：
 * /games?tab=all&xml=1
 */
export async function fetchSteamGames(): Promise<SteamGame[]> {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
  const url = `${base}steam-community/profiles/${STEAM_CONFIG.profileId}/games?tab=all&xml=1`
  const response = await fetch(url, { headers: { Accept: 'application/xml,text/xml' } })

  if (!response.ok) {
    throw new Error(`Steam 返回 HTTP ${response.status}，请求地址：${url}`)
  }

  const xml = await response.text()
  const document = new DOMParser().parseFromString(xml, 'application/xml')

  if (document.querySelector('parsererror')) {
    throw new Error('Steam 游戏数据解析失败')
  }

  return Array.from(document.querySelectorAll('game'))
    .map((game): SteamGame | null => {
      const appid = Number(text(game, 'appID'))
      const name = text(game, 'name')
      if (!appid || !name) return null

      return {
        appid,
        name,
        hours: Math.round((Number(text(game, 'hoursOnRecord')) || 0) * 10) / 10,
        lastPlayed: toDateTime(text(game, 'lastPlayed')) || '从未',
        image: `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`,
        storeUrl: `https://store.steampowered.com/app/${appid}/`,
      }
    })
    .filter((game): game is SteamGame => game !== null)
}
