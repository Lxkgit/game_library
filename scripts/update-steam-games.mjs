import { readFile, writeFile, mkdir } from 'node:fs/promises'

const PROFILE_ID = '76561198842164016'
const OUTPUT = new URL('../public/steam-games.json', import.meta.url)

const urls = [
  `https://r.jina.ai/https://steamcommunity.com/profiles/${PROFILE_ID}/games/?tab=all&l=english`,
  `https://r.jina.ai/http://steamcommunity.com/profiles/${PROFILE_ID}/games/?tab=all&l=english`,
]

function toDateTime(timestamp) {
  if (!timestamp) return '从未'
  const date = new Date(Number(timestamp) * 1000)
  return Number.isNaN(date.getTime()) ? '从未' : date.toLocaleDateString('zh-CN')
}

function normalizeGames(source) {
  const list = Array.isArray(source) ? source : Object.values(source ?? {})
  return list.map(game => {
    const appid = Number(game?.appid ?? game?.appID ?? game?.appId)
    const name = String(game?.name ?? '').trim()
    if (!appid || !name) return null
    const minutes = Number(game?.playtime_forever ?? game?.playtimeForever ?? 0)
    const hours = game?.playtime_forever !== undefined || game?.playtimeForever !== undefined
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
  }).filter(Boolean)
}

function parseJsonVariable(text, variableName) {
  const marker = `${variableName} =`
  const markerIndex = text.indexOf(marker)
  if (markerIndex < 0) return null
  const remainder = text.slice(markerIndex + marker.length)
  const starts = [remainder.indexOf('['), remainder.indexOf('{')].filter(i => i >= 0)
  if (!starts.length) return null
  const start = Math.min(...starts)
  const first = remainder[start]
  const closing = first === '[' ? ']' : '}'
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
    else if (char === first) depth += 1
    else if (char === closing) {
      depth -= 1
      if (depth === 0) {
        try { return JSON.parse(remainder.slice(start, i + 1)) } catch { return null }
      }
    }
  }
  return null
}

function parseSteamText(text) {
  for (const variable of ['g_rgGameData', 'rgGames', 'g_rgOwnedGames']) {
    const games = normalizeGames(parseJsonVariable(text, variable))
    if (games.length) return games
  }

  // Jina Reader 通常会把页面中的游戏表格转换成 Markdown。
  // 同时兼容直接暴露 appid/name 的文本格式。
  const games = []
  const patterns = [
    /(?:appid|appID)\s*[:=]\s*(\d+)[\s\S]{0,300}?(?:name)\s*[:=]\s*["']([^"']+)["']/gi,
    /(?:name)\s*[:=]\s*["']([^"']+)["'][\s\S]{0,300}?(?:appid|appID)\s*[:=]\s*(\d+)/gi,
  ]

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const appid = Number(match[1])
      const name = String(match[2]).trim()
      if (!appid || !name) continue
      if (games.some(game => game.appid === appid)) continue
      games.push({
        appid,
        name,
        hours: 0,
        lastPlayed: '从未',
        image: `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`,
        storeUrl: `https://store.steampowered.com/app/${appid}/`,
      })
    }
  }

  return games
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'game-library-steam-sync/1.0' },
    signal: AbortSignal.timeout(60000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.text()
}

async function readExistingGames() {
  try {
    const games = JSON.parse(await readFile(OUTPUT, 'utf8'))
    return Array.isArray(games) ? games : []
  } catch {
    return []
  }
}

let lastError
for (const url of urls) {
  try {
    const body = await fetchText(url)
    console.log(`数据源返回长度：${body.length}`)
    console.log(`数据源预览：${body.slice(0, 500).replace(/\s+/g, ' ')}`)
    const games = parseSteamText(body)
    if (!games.length) throw new Error('未解析到公开 Steam 游戏')
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
console.warn(`Steam 游戏库本次未能获取，保留现有数据：${existingGames.length} 个游戏。最后错误：${lastError?.message ?? '未知错误'}`)
process.exit(0)
