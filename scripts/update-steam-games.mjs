import { writeFile, mkdir } from 'node:fs/promises'

const PROFILE_ID = '76561198842164016'
const OUTPUT = new URL('../public/steam-games.json', import.meta.url)

const urls = [
  `https://steamcommunity.com/profiles/${PROFILE_ID}/games/?tab=all&l=english`,
  `https://steamcommunity.com/profiles/${PROFILE_ID}/games/?tab=all`,
  `https://steamcommunity.com/profiles/${PROFILE_ID}/games/?tab=all&xml=1`,
]

function toDateTime(timestamp) {
  if (!timestamp) return '从未'
  const date = new Date(Number(timestamp) * 1000)
  return Number.isNaN(date.getTime()) ? '从未' : date.toLocaleDateString('zh-CN')
}

function normalizeGames(source) {
  const list = Array.isArray(source) ? source : Object.values(source ?? {})

  return list
    .map(game => {
      const appid = Number(game?.appid ?? game?.appID ?? game?.appid64)
      const name = String(game?.name ?? '').trim()
      if (!appid || !name) return null

      const minutes = Number(game?.playtime_forever ?? 0)
      const hours = game?.playtime_forever !== undefined
        ? minutes / 60
        : Number(game?.hours ?? game?.hours_forever ?? game?.hoursOnRecord ?? 0)
      const lastPlayed = Number(game?.rtime_last_played ?? game?.last_played ?? game?.lastPlayed ?? 0)

      return {
        appid,
        name,
        hours: Math.round(hours * 10) / 10,
        lastPlayed: toDateTime(lastPlayed),
        image: `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`,
        storeUrl: `https://store.steampowered.com/app/${appid}/`,
      }
    })
    .filter(Boolean)
}

function extractJsonVariable(html, variableName) {
  const marker = `${variableName} =`
  const markerIndex = html.indexOf(marker)
  if (markerIndex < 0) return null

  const searchStart = markerIndex + marker.length
  let start = -1
  for (let i = searchStart; i < html.length; i += 1) {
    if (html[i] === '[' || html[i] === '{') {
      start = i
      break
    }
    if (!/\s/.test(html[i])) return null
  }

  if (start < 0) return null

  const opening = html[start]
  const closing = opening === '[' ? ']' : '}'
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < html.length; i += 1) {
    const char = html[i]

    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }

    if (char === '"') {
      inString = true
    } else if (char === opening) {
      depth += 1
    } else if (char === closing) {
      depth -= 1
      if (depth === 0) {
        return JSON.parse(html.slice(start, i + 1))
      }
    }
  }

  return null
}

function parseSteamPage(html) {
  const variables = ['g_rgGameData', 'rgGames', 'g_rgOwnedGames']

  for (const variableName of variables) {
    try {
      const source = extractJsonVariable(html, variableName)
      const games = normalizeGames(source)
      if (games.length) {
        console.log(`Steam 页面变量 ${variableName} 解析成功：${games.length} 个游戏`)
        return games
      }
    } catch (error) {
      console.warn(`解析 Steam 页面变量 ${variableName} 失败：${error.message}`)
    }
  }

  const markers = {
    private: /(?:game details|games list|profile).*?(?:private|隐私)/i.test(html),
    login: /(?:Sign In|登录 Steam|Join Steam)/i.test(html),
    gameData: html.includes('g_rgGameData'),
    rgGames: html.includes('rgGames'),
    ownedGames: html.includes('g_rgOwnedGames'),
  }

  console.warn(`Steam 页面诊断：长度=${html.length}, ${JSON.stringify(markers)}`)
  return []
}

function parseGamesXml(xml) {
  const games = []
  const matches = xml.match(/<game>[\s\S]*?<\/game>/gi) ?? []

  for (const game of matches) {
    const readTag = tag => {
      const match = game.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'))
      return match ? match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : ''
    }

    const appid = Number(readTag('appID'))
    const name = readTag('name')
    if (!appid || !name) continue

    const hours = Number(readTag('hoursOnRecord')) || 0
    const lastPlayed = Number(readTag('lastPlayed')) || 0

    games.push({
      appid,
      name,
      hours: Math.round(hours * 10) / 10,
      lastPlayed: toDateTime(lastPlayed),
      image: `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`,
      storeUrl: `https://store.steampowered.com/app/${appid}/`,
    })
  }

  return games
}

async function fetchSteam(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
      'X-ValveUserAgent': 'panorama',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(30000),
  })

  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.text()
}

let lastError

for (const url of urls) {
  try {
    const body = await fetchSteam(url)
    const games = url.includes('xml=1') ? parseGamesXml(body) : parseSteamPage(body)

    if (!games.length) throw new Error('Steam 返回内容中没有解析到公开游戏')

    await mkdir(new URL('../public/', import.meta.url), { recursive: true })
    await writeFile(OUTPUT, `${JSON.stringify(games, null, 2)}\n`, 'utf8')
    console.log(`Steam 游戏库更新成功：${games.length} 个游戏`)
    process.exit(0)
  } catch (error) {
    lastError = error
    console.warn(`请求失败: ${url}`, error)
  }
}

throw new Error(`Steam 游戏库更新失败：${lastError?.message ?? '未知错误'}`)
