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
 * Steam 当前公开格式：
 * https://steamcommunity.com/profiles/<SteamID64>/games?tab=all&xml=1
 *
 * 这里不能再使用 /tool/game/steam-community/... 作为生产请求地址：
 * Vite 的 server.proxy 只在开发服务器生效，生产环境下会直接得到 404。
 *
 * 因此生产环境优先直接访问 Steam；如果浏览器因 CORS 拒绝，再通过
 * allorigins 的 raw 代理读取 XML。整个过程仍然是纯前端，不需要 API Key。
 */
export async function fetchSteamGames(): Promise<SteamGame[]> {
  const steamUrl = `https://steamcommunity.com/profiles/${STEAM_CONFIG.profileId}/games?tab=all&xml=1`

  try {
    const response = await fetch(steamUrl, {
      headers: { Accept: 'application/xml,text/xml' },
    })

    if (!response.ok) {
      throw new Error(`Steam 返回 HTTP ${response.status}`)
    }

    return parseGamesXml(await response.text())
  } catch (directError) {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(steamUrl)}`
    const response = await fetch(proxyUrl)

    if (!response.ok) {
      const directMessage = directError instanceof Error ? directError.message : 'Steam 请求失败'
      throw new Error(`${directMessage}；CORS 代理返回 HTTP ${response.status}`)
    }

    return parseGamesXml(await response.text())
  }
}
