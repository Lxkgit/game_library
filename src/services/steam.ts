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

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function readTag(source: string, tag: string) {
  const match = source.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'))
  return match ? decodeXml(match[1]) : ''
}

function parseGamesXml(xml: string): SteamGame[] {
  const games: SteamGame[] = []
  const matches = xml.match(/<game>[\s\S]*?<\/game>/gi) ?? []

  for (const game of matches) {
    const appid = Number(readTag(game, 'appID'))
    const name = readTag(game, 'name')
    if (!appid || !name) continue

    const hours = Number(readTag(game, 'hoursOnRecord')) || 0
    const lastPlayed = Number(readTag(game, 'lastPlayed')) || 0

    games.push({
      appid,
      name,
      hours: Math.round(hours * 10) / 10,
      lastPlayed: lastPlayed ? toDateTime(new Date(lastPlayed * 1000).toISOString()) : '从未',
      image: `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`,
      storeUrl: `https://store.steampowered.com/app/${appid}/`,
    })
  }

  return games
}

async function fetchText(url: string, timeout = 12000) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    return response.text()
  } finally {
    window.clearTimeout(timer)
  }
}

/**
 * 浏览器运行时读取 Steam 公开游戏库。
 *
 * Steam Community 不允许普通网页直接跨域读取 XML，因此这里不再依赖
 * Vite proxy 或 nginx。浏览器会依次尝试多个公开 CORS 转发服务。
 * npm run build 完全不会访问 Steam。
 */
export async function fetchSteamGames(): Promise<SteamGame[]> {
  const steamUrl = `https://steamcommunity.com/profiles/${STEAM_CONFIG.profileId}/games/?tab=all&xml=1`
  const urls = [
    steamUrl,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(steamUrl)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(steamUrl)}`,
  ]

  const errors: string[] = []

  for (const url of urls) {
    try {
      const xml = await fetchText(url)
      const games = parseGamesXml(xml)

      if (!games.length) {
        throw new Error('Steam 返回的游戏库为空或格式已变化')
      }

      return games
    } catch (error) {
      errors.push(error instanceof Error ? error.message : '请求失败')
    }
  }

  throw new Error(`Steam 数据加载失败：${errors.join(' / ')}`)
}

export { STEAM_CONFIG }
