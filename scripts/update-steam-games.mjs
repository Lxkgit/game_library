import { readFile, writeFile, mkdir } from 'node:fs/promises'

const PROFILE_ID = '76561198842164016'
const OUTPUT = new URL('../public/steam-games.json', import.meta.url)

// Steam 当前公开游戏页不再稳定输出旧版 g_rgGameData。
// SteamDB 可以读取公开 Steam 资料，因此优先通过 Jina Reader 获取
// SteamDB Calculator 的文本页面；Steam Community 作为第二数据源保留。
const urls = [
  `https://r.jina.ai/https://steamdb.info/calculator/${PROFILE_ID}/`,
  `https://r.jina.ai/https://steamcommunity.com/profiles/${PROFILE_ID}/games/?tab=all&l=english`,
]

function toDateTime(timestamp) {
  if (!timestamp) return '从未'
  const date = new Date(Number(timestamp) * 1000)
  return Number.isNaN(date.getTime()) ? '从未' : date.toLocaleDateString('zh-CN')
}

function makeGame(appid, name, hours = 0, lastPlayed = 0) {
  return {
    appid,
    name: String(name).trim(),
    hours: Math.round(Number(hours || 0) * 10) / 10,
    lastPlayed: typeof lastPlayed === 'number' ? toDateTime(lastPlayed) : String(lastPlayed || '从未'),
    image: `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`,
    storeUrl: `https://store.steampowered.com/app/${appid}/`,
  }
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

    return makeGame(appid, name, hours, lastPlayed)
  }).filter(Boolean)
}

function parseJsonVariable(text, variableName) {
  const markers = [`${variableName} =`, `${variableName}=`]
  const marker = markers.find(value => text.includes(value))
  if (!marker) return null

  const markerIndex = text.indexOf(marker)
  const remainder = text.slice(markerIndex + marker.length)
  const starts = [remainder.indexOf('['), remainder.indexOf('{')].filter(index => index >= 0)
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
        try {
          return JSON.parse(remainder.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }

  return null
}

function parseSteamDB(text) {
  const games = []

  // 兼容 Jina 输出中的 Markdown/HTML Steam 商店链接：
  // [Game Name](https://store.steampowered.com/app/730/...)
  // <a href="/app/730/...">Game Name</a>
  const patterns = [
    /\[([^\]\n]+?)\]\(https?:\/\/store\.steampowered\.com\/app\/(\d+)[^)]*\)/gi,
    /\[([^\]\n]+?)\]\(\/app\/(\d+)[^)]*\)/gi,
    /<a[^>]+href=["'](?:https?:\/\/store\.steampowered\.com)?\/app\/(\d+)[^"']*["'][^>]*>([^<]+)<\/a>/gi,
  ]

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const first = match[1]
      const second = match[2]
      const appid = Number(first.match(/^\d+$/) ? first : second)
      const name = first.match(/^\d+$/) ? second : first
      if (!appid || !name) continue

      const cleanName = name.replace(/\s+/g, ' ').trim()
      if (!cleanName || games.some(game => game.appid === appid)) continue
      games.push(makeGame(appid, cleanName))
    }
  }

  // SteamDB/Jina 有时把 Owned Games 直接转成表格文字，
  // 表格中的第一列可能是 app 链接，第二列是名称。再做一层兜底。
  if (!games.length) {
    const rows = text.split('\n')
    for (const row of rows) {
      const appMatch = row.match(/(?:\/app\/|app\/)(\d{2,8})(?:\/|\b)/i)
      if (!appMatch) continue
      const appid = Number(appMatch[1])
      const cells = row
        .split('|')
        .map(cell => cell.replace(/[*_`<>]/g, '').trim())
        .filter(Boolean)
      const name = cells.find(cell =>
        cell.length > 1 &&
        !/^\d+(?:\.\d+)?$/.test(cell) &&
        !/^(Name|Price|Time|Rating|Image|Owned Games)$/i.test(cell),
      )
      if (!name || games.some(game => game.appid === appid)) continue
      games.push(makeGame(appid, name))
    }
  }

  return games
}

function parseSteamText(text) {
  for (const variable of ['g_rgGameData', 'rgGames', 'g_rgOwnedGames']) {
    const games = normalizeGames(parseJsonVariable(text, variable))
    if (games.length) return games
  }

  return parseSteamDB(text)
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'game-library-steam-sync/2.0',
      Accept: 'text/plain,text/markdown,text/html;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(90000),
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
    console.log(`数据源：${url}`)
    console.log(`数据源返回长度：${body.length}`)
    console.log(`数据源预览：${body.slice(0, 800).replace(/\s+/g, ' ')}`)

    const games = parseSteamText(body)
    console.log(`解析到游戏数量：${games.length}`)

    if (!games.length) {
      throw new Error('未解析到公开 Steam 游戏')
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
console.warn(`Steam 游戏库本次未能获取，保留现有数据：${existingGames.length} 个游戏。最后错误：${lastError?.message ?? '未知错误'}`)

// 数据源暂时异常时不要让 CI 变红，也绝不覆盖已有有效数据。
process.exit(0)
