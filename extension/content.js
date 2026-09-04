window.addEventListener('message', event => {
  if (event.source !== window) return
  if (event.data?.type !== 'GAME_LIBRARY_STEAM_REQUEST') return

  chrome.runtime.sendMessage({
    type: 'GAME_LIBRARY_STEAM_REQUEST',
    requestId: event.data.requestId,
  }, response => {
    if (chrome.runtime.lastError) {
      window.postMessage({
        type: 'GAME_LIBRARY_STEAM_RESPONSE',
        requestId: event.data.requestId,
        ok: false,
        error: chrome.runtime.lastError.message || 'Steam 扩展通信失败',
      }, '*')
      return
    }

    window.postMessage(response, '*')
  })
})
