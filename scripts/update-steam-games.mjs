import { readFile, writeFile, mkdir } from 'node:fs/promises'

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
      const appid = Number(game?.appid ?? game?.appID ?? game?.appId)
      const name = String(game?.name ?? '').trim()
      if (!appid || !name) return null

      const minutes = Number(game?.playtime_forever ?? game?.playtimeForever ?? 0)
      const hours = game?.playtime_forever !== undefined || game?.playtimeForever !== undefined
        ? minutes / 60
        : Number(game?.hours ?? game?.hours_forever ?? game?.hoursOnRecord ?? 0)
      const lastPlayed = Number(
        game?.rtime_last_played ?? game?.last_played ?? game?.lastPlayed ?? 0,
      )

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

  const remainder = html.slice(markerIndex + marker.length)
  const starts = [remainder.indexOf('['), remainder.indexOf('{')].filter(index => index >= 0)
  const start = Math.min(...starts)
  if (!Number.isFinite(start)) return null

  const firstChar = remainder[start]
  const closingChar = firstChar === '[' ? ']' : '}'
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < remainder.length; i += 1) {
    const char = remainder[i]

    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }

    if (char === '"') inString = true
    else if (char === firstChar) depth += 1
    else if (char === closingChar) {
      depth -= 1
      if (depth === 0) return JSON.parse(remainder.slice(start, i + 1))
    }
  }

  return null
}

function parseSteamPage(html) {
  for (const variableName of ['g_rgGameData', 'rgGames', 'g_rgOwnedGames']) {
    try {
      const games = normalizeGames(extractJsonVariable(html, variableName))
      if (games.length) return games
    } catch {
      // 尝试下一个 Steam 页面数据格式
    }
  }

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

function diagnoseSteamPage(html) {
  const lower = html.toLowerCase()
  return {
    length: html.length,
    private: lower.includes('private') || lower.includes('privatestate'),
    gameData: lower.includes('g_rggamedata'),
    rgGames: lower.includes('rggames'),
    ownedGames: lower.includes('ownedgames'),
  }
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

async function readExistingGames() {
  try {
    const content = await readFile(OUTPUT, 'utf8')
    const games = JSON.parse(content)
    return Array.isArray(games) ? games : []
  } catch {
    return []
  }
}

let lastError

for (const url of urls) {
  try {
    const body = await fetchSteam(url)
    console.log(`Steam 页面诊断：${JSON.stringify(diagnoseSteamPage(body))}`)

    const games = url.includes('xml=1') ? parseGamesXml(body) : parseSteamPage(body)

    if (!games.length) {
      throw new Error('Steam 返回内容中没有解析到公开游戏')
    }

    await mkdir(new URL('../public/', import.meta.url), { recursive: true })
    await writeFile(OUTPUT, `${JSON.stringify(games, null, 2)}\n`, 'utf8')
    console.log(`Steam 游戏库更新成功：${games.length} 个游戏`)
    process.exit(0)
  } catch (error) {
    lastError = error
    console.warn(`请求失败: ${url}`, error)
  }
}

const existingGames = await readExistingGames()

console.warn(
  `Steam 游戏库本次未能获取，保留现有数据：${existingGames.length} 个游戏。` +
  ` 最后错误：${lastError?.message ?? '未知错误'}`,
)

// Steam 当前公开页面没有提供可稳定解析的游戏列表时，不能因为数据源异常让整个 CI 失败。
// 前端继续使用仓库中上一次成功同步的数据；后续定时任务会再次尝试更新。
process.exit(0)
