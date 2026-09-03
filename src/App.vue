<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchSteamGames, type SteamGame } from './services/steam'

type GameStatus = '未开始' | '正在玩' | '已通关' | '已弃坑'

type Game = SteamGame & {
  id: number
  status: GameStatus
  genre: string
  favorite: boolean
  rating: number
  note: string
  tags: string[]
}

type LocalGameState = Pick<Game, 'status' | 'favorite' | 'rating' | 'note'>

const STORAGE_KEY = 'game-library:games'
const games = ref<Game[]>([])
const search = ref('')
const activeFilter = ref<'全部' | GameStatus | '收藏'>('全部')
const selectedGame = ref<Game | null>(null)
const syncing = ref(false)
const loading = ref(true)
const error = ref('')

function loadLocalState(): Record<string, LocalGameState> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveLocalState() {
  const state: Record<string, LocalGameState> = {}
  games.value.forEach(game => {
    state[String(game.appid)] = {
      status: game.status,
      favorite: game.favorite,
      rating: game.rating,
      note: game.note,
    }
  })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function convertGames(source: SteamGame[]): Game[] {
  const localState = loadLocalState()
  return source.map((game, index) => {
    const saved = localState[String(game.appid)]
    return {
      ...game,
      id: index + 1,
      status: saved?.status || (game.hours > 0 ? '正在玩' : '未开始'),
      genre: 'Steam 游戏',
      favorite: saved?.favorite ?? false,
      rating: saved?.rating ?? 0,
      note: saved?.note ?? '',
      tags: [],
      image: `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`,
    }
  })
}

async function syncSteam() {
  syncing.value = true
  error.value = ''
  try {
    games.value = convertGames(await fetchSteamGames())
    saveLocalState()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Steam 游戏库同步失败'
  } finally {
    loading.value = false
    syncing.value = false
  }
}

onMounted(syncSteam)

const filteredGames = computed(() => games.value.filter(game => {
  const keyword = search.value.trim().toLowerCase()
  const matchesSearch = !keyword || game.name.toLowerCase().includes(keyword)
  const matchesFilter = activeFilter.value === '全部'
    || (activeFilter.value === '收藏' ? game.favorite : game.status === activeFilter.value)
  return matchesSearch && matchesFilter
}))

const totalHours = computed(() => games.value.reduce((sum, game) => sum + game.hours, 0))
const playedCount = computed(() => games.value.filter(game => game.hours > 0).length)
const completedCount = computed(() => games.value.filter(game => game.status === '已通关').length)
const favoriteCount = computed(() => games.value.filter(game => game.favorite).length)

function toggleFavorite(game: Game) {
  game.favorite = !game.favorite
  saveLocalState()
}

function openGame(game: Game) {
  selectedGame.value = game
}

function closeGame() {
  saveLocalState()
  selectedGame.value = null
}

function setStatus(status: GameStatus) {
  if (selectedGame.value) {
    selectedGame.value.status = status
    saveLocalState()
  }
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">G</span><span>Game Library</span></div>
      <nav>
        <button :class="{ active: activeFilter === '全部' }" @click="activeFilter = '全部'">🎮 <span>我的游戏</span><b>{{ games.length }}</b></button>
        <button :class="{ active: activeFilter === '正在玩' }" @click="activeFilter = '正在玩'">🔥 <span>正在玩</span></button>
        <button :class="{ active: activeFilter === '未开始' }" @click="activeFilter = '未开始'">🕹️ <span>未开始</span></button>
        <button :class="{ active: activeFilter === '已通关' }" @click="activeFilter = '已通关'">✅ <span>已通关</span></button>
        <button :class="{ active: activeFilter === '收藏' }" @click="activeFilter = '收藏'">⭐ <span>收藏</span><b>{{ favoriteCount }}</b></button>
      </nav>
      <div class="sidebar-bottom">
        <div class="sync-status"><span></span> Steam 公开数据</div>
        <button class="settings">⚙️ <span>设置</span></button>
      </div>
    </aside>

    <main class="main">
      <header class="topbar">
        <div>
          <p class="eyebrow">STEAM LIBRARY</p>
          <h1>我的游戏库</h1>
        </div>
        <div class="top-actions">
          <label class="search"><span>⌕</span><input v-model="search" placeholder="搜索游戏..." /></label>
          <button class="sync" :disabled="syncing" @click="syncSteam">{{ syncing ? '↻ 同步中...' : '↻ 同步 Steam' }}</button>
        </div>
      </header>

      <div v-if="error" class="error-banner">
        <span>Steam 数据加载失败：{{ error }}</span>
        <button @click="syncSteam">重试</button>
      </div>

      <section class="stats">
        <article><span>游戏总数</span><strong>{{ games.length }}</strong><small>收藏 {{ favoriteCount }}</small></article>
        <article><span>游玩时间</span><strong>{{ Math.round(totalHours * 10) / 10 }}<i>h</i></strong><small>累计游玩</small></article>
        <article><span>已游玩</span><strong>{{ playedCount }}</strong><small>占游戏库 {{ games.length ? Math.round(playedCount / games.length * 100) : 0 }}%</small></article>
        <article><span>已通关</span><strong>{{ completedCount }}</strong><small>继续保持 🎯</small></article>
      </section>

      <section class="section-head">
        <div><h2>{{ activeFilter === '全部' ? '我的游戏' : activeFilter }}</h2><p>Steam 游戏库 · 数据来自公开资料</p></div>
        <button class="view-btn">▦ 卡片视图</button>
      </section>

      <section v-if="loading" class="loading">正在读取 Steam 游戏库...</section>
      <section v-else class="game-grid">
        <article v-for="game in filteredGames" :key="game.appid" class="game-card" @click="openGame(game)">
          <div class="cover-wrap">
            <img :src="game.image" :alt="game.name" loading="lazy" />
            <button class="favorite" :class="{ on: game.favorite }" @click.stop="toggleFavorite(game)">{{ game.favorite ? '★' : '☆' }}</button>
            <span class="status">{{ game.status }}</span>
          </div>
          <div class="game-info">
            <div class="title-row"><h3>{{ game.name }}</h3><span>{{ game.genre }}</span></div>
            <div class="game-meta"><span>◷ {{ game.hours }}h</span><span>最近：{{ game.lastPlayed }}</span></div>
          </div>
        </article>
        <div v-if="filteredGames.length === 0" class="empty">没有找到匹配的游戏</div>
      </section>
    </main>

    <div v-if="selectedGame" class="modal-backdrop" @click.self="closeGame">
      <section class="detail-modal">
        <button class="modal-close" @click="closeGame">×</button>
        <img class="detail-cover" :src="selectedGame.image" :alt="selectedGame.name" />
        <div class="detail-content">
          <p class="eyebrow">STEAM APP {{ selectedGame.appid }}</p>
          <h2>{{ selectedGame.name }}</h2>
          <div class="detail-stats"><div><small>游玩时间</small><strong>{{ selectedGame.hours }}h</strong></div><div><small>最近游玩</small><strong>{{ selectedGame.lastPlayed }}</strong></div><div><small>评分</small><strong>{{ selectedGame.rating ? '★'.repeat(selectedGame.rating) : '—' }}</strong></div></div>
          <label class="field"><span>游戏状态</span><select :value="selectedGame.status" @change="setStatus(($event.target as HTMLSelectElement).value as GameStatus)"><option>未开始</option><option>正在玩</option><option>已通关</option><option>已弃坑</option></select></label>
          <label class="field"><span>个人备注</span><textarea v-model="selectedGame.note" placeholder="记录这款游戏的想法、进度或计划..." /></label>
          <div class="detail-actions"><button class="primary" @click="closeGame">保存</button><button @click="toggleFavorite(selectedGame)">{{ selectedGame.favorite ? '★ 已收藏' : '☆ 收藏' }}</button><a :href="selectedGame.storeUrl" target="_blank" rel="noreferrer">打开 Steam</a></div>
        </div>
      </section>
    </div>
  </div>
</template>
