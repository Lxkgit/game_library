<script setup lang="ts">
import { computed, ref } from 'vue'

type GameStatus = '未开始' | '正在玩' | '已通关' | '已弃坑'

type Game = {
  id: number
  appid: number
  name: string
  hours: number
  status: GameStatus
  genre: string
  image: string
  lastPlayed: string
  favorite: boolean
  rating: number
  note: string
  tags: string[]
}

const games = ref<Game[]>([
  { id: 1, appid: 1245620, name: 'Elden Ring', hours: 126, status: '正在玩', genre: 'RPG', image: 'https://cdn.akamai.steamstatic.com/steam/apps/1245620/header.jpg', lastPlayed: '今天', favorite: true, rating: 5, note: '继续探索地下世界。', tags: ['魂类', '开放世界'] },
  { id: 2, appid: 1086940, name: 'Baldur’s Gate 3', hours: 72, status: '正在玩', genre: 'RPG', image: 'https://cdn.akamai.steamstatic.com/steam/apps/1086940/header.jpg', lastPlayed: '昨天', favorite: true, rating: 5, note: '准备推进第二章。', tags: ['CRPG', '剧情'] },
  { id: 3, appid: 1091500, name: 'Cyberpunk 2077', hours: 31, status: '已通关', genre: 'RPG', image: 'https://cdn.akamai.steamstatic.com/steam/apps/1091500/header.jpg', lastPlayed: '8月28日', favorite: false, rating: 4, note: '', tags: ['开放世界', '科幻'] },
  { id: 4, appid: 1145360, name: 'Hades', hours: 18, status: '正在玩', genre: '动作', image: 'https://cdn.akamai.steamstatic.com/steam/apps/1145360/header.jpg', lastPlayed: '8月26日', favorite: false, rating: 4, note: '', tags: ['Roguelike'] },
  { id: 5, appid: 292030, name: 'The Witcher 3', hours: 0, status: '未开始', genre: 'RPG', image: 'https://cdn.akamai.steamstatic.com/steam/apps/292030/header.jpg', lastPlayed: '从未', favorite: false, rating: 0, note: '', tags: ['开放世界'] },
  { id: 6, appid: 1174180, name: 'Red Dead Redemption 2', hours: 0, status: '未开始', genre: '开放世界', image: 'https://cdn.akamai.steamstatic.com/steam/apps/1174180/header.jpg', lastPlayed: '从未', favorite: false, rating: 0, note: '', tags: ['剧情', '开放世界'] },
])

const search = ref('')
const activeFilter = ref<'全部' | GameStatus | '收藏'>('全部')
const selectedGame = ref<Game | null>(null)
const syncing = ref(false)

const filteredGames = computed(() => games.value.filter(game => {
  const matchesSearch = game.name.toLowerCase().includes(search.value.toLowerCase())
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
}

function openGame(game: Game) {
  selectedGame.value = game
}

function closeGame() {
  selectedGame.value = null
}

function setStatus(status: GameStatus) {
  if (selectedGame.value) selectedGame.value.status = status
}

function syncSteam() {
  syncing.value = true
  window.setTimeout(() => { syncing.value = false }, 1200)
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
        <div class="sync-status"><span></span> 本地数据模式</div>
        <button class="settings">⚙️ <span>设置</span></button>
      </div>
    </aside>

    <main class="main">
      <header class="topbar">
        <div>
          <p class="eyebrow">MY COLLECTION</p>
          <h1>我的游戏库</h1>
        </div>
        <div class="top-actions">
          <label class="search"><span>⌕</span><input v-model="search" placeholder="搜索游戏..." /></label>
          <button class="sync" :disabled="syncing" @click="syncSteam">{{ syncing ? '↻ 同步中...' : '↻ 同步 Steam' }}</button>
        </div>
      </header>

      <section class="stats">
        <article><span>游戏总数</span><strong>{{ games.length }}</strong><small>收藏 {{ favoriteCount }}</small></article>
        <article><span>游玩时间</span><strong>{{ totalHours }}<i>h</i></strong><small>累计游玩</small></article>
        <article><span>已游玩</span><strong>{{ playedCount }}</strong><small>占游戏库 {{ Math.round(playedCount / games.length * 100) }}%</small></article>
        <article><span>已通关</span><strong>{{ completedCount }}</strong><small>继续保持 🎯</small></article>
      </section>

      <section class="section-head">
        <div><h2>{{ activeFilter === '全部' ? '最近游戏' : activeFilter }}</h2><p>管理你的游戏收藏与游玩状态</p></div>
        <button class="view-btn">▦ 卡片视图</button>
      </section>

      <section class="game-grid">
        <article v-for="game in filteredGames" :key="game.id" class="game-card" @click="openGame(game)">
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
          <div class="detail-tags"><span v-for="tag in selectedGame.tags" :key="tag">{{ tag }}</span></div>
          <div class="detail-stats"><div><small>游玩时间</small><strong>{{ selectedGame.hours }}h</strong></div><div><small>最近游玩</small><strong>{{ selectedGame.lastPlayed }}</strong></div><div><small>评分</small><strong>{{ selectedGame.rating ? '★'.repeat(selectedGame.rating) : '—' }}</strong></div></div>
          <label class="field"><span>游戏状态</span><select :value="selectedGame.status" @change="setStatus(($event.target as HTMLSelectElement).value as GameStatus)"><option>未开始</option><option>正在玩</option><option>已通关</option><option>已弃坑</option></select></label>
          <label class="field"><span>个人备注</span><textarea v-model="selectedGame.note" placeholder="记录这款游戏的想法、进度或计划..." /></label>
          <div class="detail-actions"><button class="primary" @click="closeGame">保存</button><button @click="toggleFavorite(selectedGame)">{{ selectedGame.favorite ? '★ 已收藏' : '☆ 收藏' }}</button></div>
        </div>
      </section>
    </div>
  </div>
</template>
