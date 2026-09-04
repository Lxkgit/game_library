export type SteamGame = {
  appid: number
  name: string
  hours: number
  lastPlayed: string
  image: string
  storeUrl: string
}

type SteamExtensionResponse = {
  type: 'GAME_LIBRARY_STEAM_RESPONSE'
  requestId: string
  ok: boolean
  xml?: string
  error?: string
}

function parseSteamXml(text: string): SteamGame[] {
  const xml = new DOMParser().parseFromString(text, 'application/xml')
  if (xml.querySelector('parsererror')) {
    throw new Error('Steam XML 数据解析失败')
  }

  const games: SteamGame[] = []
  const seen = new Set<number>()

  xml.querySelectorAll('game').forEach(game => {
    const appid = Number(game.querySelector('appID')?.textContent || 0)
    const name = game.querySelector('name')?.textContent?.trim() || ''
    if (!appid || !name || seen.has(appid)) return

    const hours = Number(game.querySelector('hoursOnRecord')?.textContent || 0)
    const lastPlayed = Number(game.querySelector('lastPlayed')?.textContent || 0)
    const date = lastPlayed ? new Date(lastPlayed * 1000) : null

    seen.add(appid)
    games.push({
      appid,
      name,
      hours: Math.round(hours * 10) / 10,
      lastPlayed: date && !Number.isNaN(date.getTime())
        ? date.toLocaleDateString('zh-CN')
        : '从未',
      image: `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`,
      storeUrl: `https://store.steampowered.com/app/${appid}/`,
    })
  })

  return games
}

export async function fetchSteamGames(): Promise<SteamGame[]> {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`

  return new Promise((resolve, reject) => {
    let finished = false
    let timer = 0

    const cleanup = () => {
      window.removeEventListener('message', onMessage)
      window.clearTimeout(timer)
    }

    const finish = (callback: () => void) => {
      if (finished) return
      finished = true
      cleanup()
      callback()
    }

    const onMessage = (event: MessageEvent<SteamExtensionResponse>) => {
      if (event.source !== window || event.data?.type !== 'GAME_LIBRARY_STEAM_RESPONSE') return
      if (event.data.requestId !== requestId) return

      finish(() => {
        if (!event.data.ok || !event.data.xml) {
          reject(new Error(event.data.error || 'Steam 扩展获取数据失败'))
          return
        }

        try {
          const games = parseSteamXml(event.data.xml)
          if (!games.length) {
            reject(new Error('Steam 扩展获取成功，但没有解析到公开游戏'))
            return
          }
          resolve(games)
        } catch (error) {
          reject(error instanceof Error ? error : new Error('Steam 数据解析失败'))
        }
      })
    }

    timer = window.setTimeout(() => {
      finish(() => reject(new Error('未检测到 Game Library Steam 扩展，请安装并启用扩展后重试')))
    }, 15000)

    window.addEventListener('message', onMessage)
    window.postMessage({
      type: 'GAME_LIBRARY_STEAM_REQUEST',
      requestId,
    }, '*')
  })
}

export { STEAM_CONFIG }
