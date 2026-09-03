import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const steamId = '76561198842164016'
const output = resolve('public/steam-games.json')
const urls = [
  `https://steamcommunity.com/profiles/${steamId}/games/?tab=all&xml=1`,
  `https://steamcommunity.com/profiles/${steamId}/games?tab=all&xml=1`,
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
      lastPlayed: lastPlayed ? new Date(lastPlayed * 1000).toISOString() : '',
      image: `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`,
      storeUrl: `https://store.steampowered.com/app/${appid}/`,
    })
  }

  return games
}

async function fetchSteamGames() {
  let lastError = null

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'game-library-build/1.0',
        },
        signal: AbortSignal.timeout(30000),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const xml = await response.text()
      const games = parseGamesXml(xml)
      if (!games.length) {
        throw new Error('Steam 返回的游戏库为空或格式已变化')
      }

      return games
    } catch (error) {
      lastError = error
    }
  }

  throw new Error(`Steam 游戏库获取失败：${lastError instanceof Error ? lastError.message : '未知错误'}`)
}

const games = await fetchSteamGames()
await mkdir(dirname(output), { recursive: true })
await writeFile(output, `${JSON.stringify(games, null, 2)}\n`, 'utf8')
console.log(`Steam 游戏库已生成：${games.length} 个游戏 -> ${output}`)
