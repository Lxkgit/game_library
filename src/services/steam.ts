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
 * 不再从浏览器直接请求 Steam，也不再依赖第三方 CORS 代理。
 * 请求统一走当前站点的 /tool/game/steam-community/ 反向代理，
 * 由 nginx/Vite 服务器请求 Steam，从而避免浏览器 CORS 和第三方代理不稳定问题。
 */
export async function fetchSteamGames(): Promise<SteamGame[]> {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
  const url = `${base}steam-community/profiles/${STEAM_CONFIG.profileId}/games?tab=all&xml=1`

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const xml = await response.text()
    if (!xml.trim()) {
      throw new Error('返回内容为空')
    }

    return parseGamesXml(xml)
  } catch (error) {
    throw new Error(`Steam 数据请求失败：${error instanceof Error ? error.message : '请求失败'}`)
  }
}
