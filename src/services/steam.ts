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

function parseGamesXml(xml: string): SteamGame[] {
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

/**
 * 读取 Steam 公开游戏库 XML。
 *
 * Steam 的 Community XML 接口没有提供可依赖的浏览器 CORS 响应，
 * 因此前端直接 fetch Steam 时可能出现 Failed to fetch。
 * 当前仍保持纯前端、无需 API Key；先尝试直连，再依次使用公开 CORS 代理。
 */
export async function fetchSteamGames(): Promise<SteamGame[]> {
  const steamUrl = `https://steamcommunity.com/profiles/${STEAM_CONFIG.profileId}/games?tab=all&xml=1`

  const requests: Array<() => Promise<Response>> = [
    () => fetch(steamUrl),
    () => fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(steamUrl)}`),
    () => fetch(`https://corsproxy.io/?url=${encodeURIComponent(steamUrl)}`),
    () => fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(steamUrl)}`),
  ]

  const errors: string[] = []

  for (const request of requests) {
    try {
      const response = await request()
      if (!response.ok) {
        errors.push(`HTTP ${response.status}`)
        continue
      }

      const xml = await response.text()
      if (!xml.trim()) {
        errors.push('返回内容为空')
        continue
      }

      return parseGamesXml(xml)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Failed to fetch')
    }
  }

  throw new Error(`Steam 数据请求失败：${errors.join('；')}`)
}
