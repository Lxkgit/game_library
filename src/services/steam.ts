import { STEAM_CONFIG } from '../config/steam'

export type SteamGame = {
  appid: number
  name: string
  hours: number
  lastPlayed: string
  image: string
  storeUrl: string
}

type SteamConfig = {
  apiKey: string
  steamId: string
}

type SteamResponse = {
  response?: {
    games?: Array<{
      appid: number
      name: string
      playtime_forever?: number
      rtime_last_played?: number
    }>
  }
}

const STEAM_API_URL = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/'
const PROXY_URLS = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?url=',
]

async function loadSteamConfig(): Promise<SteamConfig> {
  const response = await fetch(STEAM_CONFIG.configUrl, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error('Steam 配置文件读取失败')
  }

  const config = await response.json() as SteamConfig
  if (!config.apiKey || !config.steamId) {
    throw new Error('Steam API 配置不完整')
  }

  return config
}

async function requestSteamApi(url: string): Promise<SteamResponse> {
  let lastError: unknown

  for (const proxy of PROXY_URLS) {
    try {
      const response = await fetch(`${proxy}${encodeURIComponent(url)}`, {
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      return await response.json() as SteamResponse
    } catch (error) {
      lastError = error
    }
  }

  throw new Error(lastError instanceof Error ? `Steam 数据加载失败：${lastError.message}` : 'Steam 数据加载失败')
}

export async function fetchSteamGames(): Promise<SteamGame[]> {
  const config = await loadSteamConfig()
  const params = new URLSearchParams({
    key: config.apiKey,
    steamid: config.steamId,
    format: 'json',
    include_appinfo: '1',
    include_played_free_games: '1',
  })

  const data = await requestSteamApi(`${STEAM_API_URL}?${params}`)
  const games = data.response?.games || []

  return games.map(game => {
    const date = game.rtime_last_played ? new Date(game.rtime_last_played * 1000) : null

    return {
      appid: game.appid,
      name: game.name,
      hours: Math.round(((game.playtime_forever || 0) / 60) * 10) / 10,
      lastPlayed: date && !Number.isNaN(date.getTime())
        ? date.toLocaleDateString('zh-CN')
        : '从未',
      image: `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`,
      storeUrl: `https://store.steampowered.com/app/${game.appid}/`,
    }
  })
}

export { STEAM_CONFIG }
