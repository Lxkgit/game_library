import { STEAM_CONFIG } from '../config/steam'

export type SteamGame = {
  appid: number
  name: string
  hours: number
  lastPlayed: string
  image: string
  storeUrl: string
}

const STEAM_XML_URL = `https://steamcommunity.com/profiles/${STEAM_CONFIG.profileId}/games/?tab=all&xml=1&l=english`

function toDateTime(timestamp: number) {
  if (!timestamp) return '从未'
  const date = new Date(timestamp * 1000)
  return Number.isNaN(date.getTime()) ? '从未' : date.toLocaleDateString('zh-CN')
}

function makeGame(appid: number, name: string, hours = 0, lastPlayed = 0): SteamGame {
  return {
    appid,
    name: name.trim(),
    hours: Math.round(hours * 10) / 10,
    lastPlayed: toDateTime(lastPlayed),
    image: `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`,
    storeUrl: `https://store.steampowered.com/app/${appid}/`,
  }
}

function parseSteamXml(text: string): SteamGame[] {
  const xml = new DOMParser().parseFromString(text, 'application/xml')

  if (xml.querySelector('parsererror')) {
    throw new Error('Steam XML 数据解析失败')
  }

  return Array.from(xml.querySelectorAll('game')).flatMap(game => {
    const appid = Number(game.querySelector('appID')?.textContent || 0)
    const name = game.querySelector('name')?.textContent?.trim() || ''
    if (!appid || !name) return []

    const hours = Number(game.querySelector('hoursOnRecord')?.textContent || 0)
    const lastPlayed = Number(game.querySelector('lastPlayed')?.textContent || 0)
    return [makeGame(appid, name, hours, lastPlayed)]
  })
}

async function fetchSteamXml(): Promise<SteamGame[]> {
  const response = await fetch(STEAM_XML_URL, {
    cache: 'no-store',
    credentials: 'omit',
  })

  if (!response.ok) {
    throw new Error(`Steam XML 请求失败：HTTP ${response.status}`)
  }

  const games = parseSteamXml(await response.text())
  if (!games.length) {
    throw new Error('Steam XML 中没有解析到公开游戏')
  }

  return games
}

async function fetchLocalGames(): Promise<SteamGame[]> {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`

  const response = await fetch(`${base}steam-games.json`, {
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`本地 Steam 数据读取失败：HTTP ${response.status}`)
  }

  const games = (await response.json()) as unknown
  if (!Array.isArray(games)) {
    throw new Error('本地 Steam 数据格式错误')
  }

  return games as SteamGame[]
}

/**
 * 优先在客户端直接读取 Steam 公开 XML。
 *
 * 这样不需要 Steam Web API Key，也不会把任何密钥放进前端。
 * 如果浏览器因 Steam 的 CORS 策略无法读取，则回退到构建时生成的静态 JSON。
 */
export async function fetchSteamGames(): Promise<SteamGame[]> {
  try {
    return await fetchSteamXml()
  } catch (steamError) {
    console.warn('客户端直接读取 Steam 失败，回退到本地数据：', steamError)
    return fetchLocalGames()
  }
}

export { STEAM_CONFIG }
