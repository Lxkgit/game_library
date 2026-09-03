import { writeFile, mkdir } from 'node:fs/promises'

const PROFILE_ID = '76561198842164016'
const OUTPUT = new URL('../public/steam-games.json', import.meta.url)

const urls = [
  `https://steamcommunity.com/profiles/${PROFILE_ID}/games/?tab=all&xml=1`,
  `https://steamcommunity.com/profiles/${PROFILE_ID}/games?tab=all&xml=1`,
]

function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function readTag(source, tag) {
  const match = source.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'))
  return match ? decodeXml(match[1]) : ''
}

function toDateTime(timestamp) {
  if (!timestamp) return '从未'
  const date = new Date(Number(timestamp) * 1000)
  return Number.isNaN(date.getTime()) ? '从未' : date.toLocaleDateString('zh-CN')
}

function parseGamesXml(xml) {
  const games = []
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
      lastPlayed: toDateTime(lastPlayed),
      image: `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`,
      storeUrl: `https://store.steampowered.com/app/${appid}/`,
    })
  }

  return games
}

let lastError

for (const url of urls) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'game-library-steam-sync/1.0',
        Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(30000),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const xml = await response.text()
    const games = parseGamesXml(xml)

    if (!games.length) {
      throw new Error('Steam XML 中没有解析到游戏')
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

throw new Error(`Steam 游戏库更新失败：${lastError?.message ?? '未知错误'}`)
