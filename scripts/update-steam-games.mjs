import { readFile, writeFile, mkdir } from 'node:fs/promises'

const PROFILE_ID = '76561198842164016'
const OUTPUT = new URL('../public/steam-games.json', import.meta.url)
const STEAM_URL = `https://steamcommunity.com/profiles/${PROFILE_ID}/games/?tab=all&l=english`
const STEAM_XML_URL = `https://steamcommunity.com/profiles/${PROFILE_ID}/games/?tab=all&xml=1&l=english`

function toDateTime(timestamp) {
  if (!timestamp) return '从未'
  const date = new Date(Number(timestamp) * 1000)
  return Number.isNaN(date.getTime()) ? '从未' : date.toLocaleDateString('zh-CN')
}

function makeGame(appid, name, hours = 0, lastPlayed = 0) {
  return {
    appid: Number(appid),
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
  const marker = [`${variableName} =`, `${variableName}=`].find(value => text.includes(value))
  if (!marker) return null

  const remainder = text.slice(text.indexOf(marker) + marker.length)
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
        try { return JSON.parse(remainder.slice(start, i + 1)) } catch { return null }
      }
    }
  }
  return null
}

function parseGameRows(text) {
  const games = []
  const seen = new Set()
  const add = (appid, name, hours = 0, lastPlayed = 0) => {
    const id = Number(appid)
    const cleanName = String(name ?? '')
      .replace(/\\u003c|<[^>]*>/g, ' ')
      .replace(/\\s+/g, ' ')
      .trim()
    if (!id || !cleanName || seen.has(id)) return
    seen.add(id)
    games.push(makeGame(id, cleanName, hours, lastPlayed))
  }

  const appidRegex = /data-ds-appid=["'](\d+)["'][^>]*>([\s\S]{0,1000}?)<\/a>/gi
  for (const match of text.matchAll(appidRegex)) {
    const name = match[2].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&')
    add(match[1], name)
  }

  const linkRegex = /(?:https?:\/\/store\.steampowered\.com)?\/app\/(\d+)[^"'<> ]*["'][^>]*>([\s\S]{0,500}?)<\/a>/gi
  for (const match of text.matchAll(linkRegex)) {
    add(match[1], match[2].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&'))
  }

  return games
}

function parseSteamPage(text) {
  for (const variable of ['g_rgGameData', 'rgGames', 'g_rgOwnedGames']) {
    const games = normalizeGames(parseJsonVariable(text, variable))
    if (games.length) return games
  }
  return parseGameRows(text)
}

function parseSteamXml(text) {
  const games = []
  const seen = new Set()
  const gameRegex = /<game>([\s\S]*?)<\/game>/gi

  for (const blockMatch of text.matchAll(gameRegex)) {
    const block = blockMatch[1]
    const get = tag => {
      const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))
      return match?.[1]?.trim() ?? ''
    }

    const appid = Number(get('appID'))
    const name = get('name')
    if (!appid || !name || seen.has(appid)) continue

    const hours = Number(get('hoursOnRecord') || 0)
    const lastPlayed = Number(get('lastPlayed') || 0)
    seen.add(appid)
    games.push(makeGame(appid, name, hours, lastPlayed))
  }

  return games
}

async function fetchSteamXml() {
  const response = await fetch(STEAM_XML_URL, {
    headers: {
      accept: 'application/xml,text/xml,text/plain,*/*',
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
    },
    redirect: 'follow',
  })

  const text = await response.text()
  console.log(`Steam XML HTTP 状态：${response.status}`)
  console.log(`Steam XML 最终地址：${response.url}`)
  console.log(`Steam XML 页面长度：${text.length}`)

  const games = parseSteamXml(text)
  console.log(`Steam XML 解析到游戏数量：${games.length}`)
  if (games.length) return games

  return null
}

async function fetchWithBrowser() {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({
      locale: 'en-US',
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      viewport: { width: 1440, height: 1000 },
    })

    await page.goto(STEAM_URL, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForTimeout(5000)

    const body = await page.content()
    console.log(`Steam 页面标题：${await page.title()}`)
    console.log(`Steam 页面地址：${page.url()}`)
    console.log(`Steam 页面长度：${body.length}`)

    const games = parseSteamPage(body)
    console.log(`浏览器解析到游戏数量：${games.length}`)
    if (!games.length) throw new Error('浏览器访问 Steam 后仍未解析到公开游戏')
    return games
  } finally {
    await browser.close()
  }
}

async function readExistingGames() {
  try {
    const games = JSON.parse(await readFile(OUTPUT, 'utf8'))
    return Array.isArray(games) ? games : []
  } catch {
    return []
  }
}

try {
  const games = await fetchSteamXml() ?? await fetchWithBrowser()
  await mkdir(new URL('../public/', import.meta.url), { recursive: true })
  await writeFile(OUTPUT, `${JSON.stringify(games, null, 2)}\n`, 'utf8')
  console.log(`Steam 游戏库更新成功：${games.length} 个游戏`)
} catch (error) {
  const existingGames = await readExistingGames()
  console.warn(`Steam 游戏库本次未能获取，保留现有数据：${existingGames.length} 个游戏。最后错误：${error?.message ?? '未知错误'}`)
  process.exitCode = 1
}
