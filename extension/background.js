const STEAM_PROFILE_ID = '76561198842164016'
const STEAM_XML_URL = `https://steamcommunity.com/profiles/${STEAM_PROFILE_ID}/games/?tab=all&xml=1&l=english`

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'GAME_LIBRARY_STEAM_REQUEST') return

  fetch(STEAM_XML_URL, {
    cache: 'no-store',
    credentials: 'omit',
    headers: {
      accept: 'application/xml,text/xml,text/plain,*/*',
    },
  })
    .then(async response => {
      const xml = await response.text()
      if (!response.ok) {
        throw new Error(`Steam 请求失败：HTTP ${response.status}`)
      }
      if (!xml.includes('<game>')) {
        throw new Error('Steam 返回内容中没有公开游戏数据')
      }
      sendResponse({
        type: 'GAME_LIBRARY_STEAM_RESPONSE',
        requestId: message.requestId,
        ok: true,
        xml,
      })
    })
    .catch(error => {
      sendResponse({
        type: 'GAME_LIBRARY_STEAM_RESPONSE',
        requestId: message.requestId,
        ok: false,
        error: error instanceof Error ? error.message : 'Steam 请求失败',
      })
    })

  return true
})
