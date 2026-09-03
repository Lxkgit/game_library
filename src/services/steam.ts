import { STEAM_CONFIG } from '../config/steam'

export type SteamGame = {
  appid: number
  name: string
  hours: number
  lastPlayed: string
  image: string
  storeUrl: string
}

/**
 * 浏览器只读取项目自己的静态 JSON。
 *
 * Steam 数据由 GitHub Actions 定时同步到 public/steam-games.json，
 * 因此浏览器运行时不再直接访问 Steam，也不依赖 CORS 代理。
 * npm run build 同样不会访问 Steam。
 */
export async function fetchSteamGames(): Promise<SteamGame[]> {
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

export { STEAM_CONFIG }
