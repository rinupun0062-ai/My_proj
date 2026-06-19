/* Extracted JS from index.html */
/* ─── CONFIG ──────────────────────────────────── */
const API_KEY  = '143bcbe1';
const BASE_URL = 'https://www.omdbapi.com/';

/* ─── STATE ───────────────────────────────────── */
let state = {
  query:       'avengers',
  type:        'all',
  page:        1,
  totalResults: 0,
  movies:      [],
  watchlist:   JSON.parse(localStorage.getItem('cine_watchlist') || '[]'),
  heroMovies:  [],
  heroIdx:     0,
  currentDetail: null,
  searchMode:  false,
  loading:     false,
};
let currentMovieId = null;
let heroTimer = null;
let searchDebounce = null;

/* ─── API ─────────────────────────────────────── */
async function apiFetch(params) {
  const directURL = `${BASE_URL}?${params}`;
  const proxyURL  = `https://api.allorigins.win/get?url=${encodeURIComponent(directURL)}`;

  try {
    const res = await fetch(directURL, { mode: 'cors' });
    if (res.ok) return res.json();
  } catch (e) { }

  try {
    const res  = await fetch(proxyURL);
    const json = await res.json();
    return JSON.parse(json.contents);
  } catch (e) {
    throw new Error('NETWORK_FAIL');
  }
}

async function searchMovies(query, page = 1, type = '') {
  const params = new URLSearchParams({ apikey: API_KEY, s: query, page });
  if (type && type !== 'all') params.append('type', type);
  return apiFetch(params);
}

async function getMovieDetail(id) {
  const params = new URLSearchParams({ apikey: API_KEY, i: id, plot: 'full' });
  return apiFetch(params);
}

/* ─── HERO ────────────────────────────────────── */
const HERO_QUERIES = ['inception','interstellar','the dark knight','avatar','oppenheimer'];

async function loadHero() {
  const results = await Promise.all(
    HERO_QUERIES.map(q => searchMovies(q, 1, 'movie'))
  );
  state.heroMovies = results
    .filter(r => r.Search?.length)
    .map(r => r.Search[0]);
  if (state.heroMovies.length) {
    buildHeroDots();
    showHero(0);
    startHeroTimer();
  }
}

function buildHeroDots() {
  const dots = document.getElementById('heroDots');
  dots.innerHTML = state.heroMovies.map((_, i) =>
    `<button class="hero-dot-btn${i===0?' active':''}" onclick="showHero(${i})" aria-label="Featured movie ${i+1}"></button>`
  ).join('');
}

async function showHero(idx) {
  state.heroIdx = idx;
  const m = state.heroMovies[idx];
  if (!m) return;
  const detail = await getMovieDetail(m.imdbID);
  if (!detail || detail.Response === 'False') return;

  const bg = document.getElementById('heroBg');
  if (detail.Poster && detail.Poster !== 'N/A') {
    bg.onload = () => bg.classList.add('loaded');
    bg.src = detail.Poster;
  } else { bg.classList.remove('loaded'); }

  document.getElementById('heroTitle').innerHTML = `${detail.Title.split(' ').slice(0,-1).join(' ')}<br><span>${detail.Title.split(' ').pop()}</span>`;
  document.getElementById('heroType').innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> ${detail.Type === 'series' ? 'Series' : 'Now Playing'}`;
  document.getElementById('heroPlot').textContent = detail.Plot !== 'N/A' ? detail.Plot : '';

  const rating = detail.imdbRating !== 'N/A' ? `<span class="hero-rating"><svg width="13" height="13" viewBox="0 0 24 24" fill="#F59E0B" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>${detail.imdbRating}</span>` : '';
  document.getElementById('heroMeta').innerHTML = `${rating}<span class="hero-dot-meta" aria-hidden="true">·</span><span class="hero-year">${detail.Year}</span><span class="hero-dot-meta" aria-hidden="true">·</span><span class="hero-genre">${(detail.Genre||'').split(',')[0]}</span>`;

  document.querySelectorAll('.hero-dot-btn').forEach((d,i) => d.classList.toggle('active', i === idx));
  state.heroMovies[idx]._detail = detail;
}

function openHeroModal() {
  const d = state.heroMovies[state.heroIdx]?._detail;
  if (d) openModal(d);
}

function startHeroTimer() {
  clearInterval(heroTimer);
  heroTimer = setInterval(() => {
    const next = (state.heroIdx + 1) % state.heroMovies.length;
    showHero(next);
  }, 6000);
}

document.getElementById('heroNext').addEventListener('click', () => { clearInterval(heroTimer); const n=(state.heroIdx+1)%state.heroMovies.length; showHero(n); startHeroTimer(); });
document.getElementById('heroPrev').addEventListener('click', () => { clearInterval(heroTimer); const n=(state.heroIdx-1+state.heroMovies.length)%state.heroMovies.length; showHero(n); startHeroTimer(); });

/* ─── LOAD MOVIES ─────────────────────────────── */
async function loadMovies(query, page = 1, append = false) {
  if (state.loading) return;
  state.loading = true;
  const grid = document.getElementById('moviesGrid');

  if (!append) {
    grid.innerHTML = '';
    renderSkeletons(12);
  }

  try {
    const typeFilter = state.type !== 'all' ? state.type : '';
    const data = await searchMovies(query, page, typeFilter);

    if (!append) grid.innerHTML = '';

    if (data.Response === 'True' && data.Search?.length) {
      state.totalResults = parseInt(data.totalResults || 0);
      if (append) state.movies.push(...data.Search);
      else state.movies = data.Search;

      renderMovies(data.Search, append);
      document.getElementById('resultsCount').textContent = `${state.totalResults.toLocaleString()} results`;

      const hasMore = state.movies.length < state.totalResults;
      document.getElementById('loadMoreWrap').style.display = hasMore ? 'flex' : 'none';
    } else {
      if (!append) showEmpty(data.Error || 'No movies found');
    }
  } catch (e) {
    console.error('[CineSearch] Fetch error:', e);
    if (!append) showEmpty(
      e.message === 'NETWORK_FAIL'
        ? 'Could not reach OMDB. Check your internet connection and try refreshing.'
        : 'Something went wrong. Open DevTools (F12) → Console for details.'
    );
  }
  state.loading = false;
}

function renderSkeletons(n) {
  const grid = document.getElementById('moviesGrid');
  for (let i = 0; i < n; i++) {
    const div = document.createElement('div');
    div.className = 'skeleton';
    div.setAttribute('aria-hidden','true');
    div.innerHTML = `<div class="skeleton-poster"></div><div class="skeleton-info"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div>`;
    grid.appendChild(div);
  }
}

function renderMovies(movies, append = false) {
  const grid = document.getElementById('moviesGrid');
  movies.forEach((m, i) => {
    const card = createMovieCard(m, i);
    grid.appendChild(card);
  });
}

function createMovieCard(m, idx = 0) {
  const card = document.createElement('div');
  card.className = 'movie-card';
  card.setAttribute('role','listitem');
  card.setAttribute('tabindex','0');
  card.setAttribute('aria-label',`${m.Title}, ${m.Year}`);
  card.style.animationDelay = `${Math.min(idx,8)*0.05}s`;

  const isSaved = state.watchlist.includes(m.imdbID);
  const typeClass = m.Type || 'movie';

  card.innerHTML = `
    <div class="movie-poster-wrap">
      ${m.Poster && m.Poster !== 'N/A'
        ? `<img class="movie-poster" src="${m.Poster}" alt="${m.Title} poster" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\'movie-poster-fallback\'><svg width=\'40\' height=\'40\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'1.5\'><rect x=\'3\' y=\'3\' width=\'18\' height=\'18\' rx=\'2\'/><circle cx=\'8.5\' cy=\'8.5\' r=\'1.5\'/><polyline points=\'21 15 16 10 5 21\'/></svg><span>${m.Title}</span></div>'">`
        : `<div class="movie-poster-fallback"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>${m.Title}</span></div>`
      }
      <div class="movie-overlay" aria-hidden="true">
        <div class="movie-play-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
      </div>
      <span class="movie-type-badge ${typeClass}">${m.Type || 'movie'}</span>
      <button class="movie-save-btn${isSaved?' saved':''}" onclick="toggleWatchlist('${m.imdbID}',event)" aria-label="${isSaved?'Remove from':'Add to'} watchlist">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="${isSaved?'currentColor':'none'}" stroke="currentColor" stroke-width="2.5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
      </button>
    </div>
    <div class="movie-info">
      <div class="movie-title">${m.Title}</div>
      <div class="movie-meta-row">
        <span class="movie-year">${m.Year}</span>
      </div>
    </div>`;

  card.addEventListener('click', () => fetchAndOpenModal(m.imdbID));
  card.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' ') { e.preventDefault(); fetchAndOpenModal(m.imdbID); } });
  return card;
}

function showEmpty(msg) {
  const isNetErr = msg.toLowerCase().includes('network') || msg.toLowerCase().includes('reach') || msg.toLowerCase().includes('connect');
  const grid = document.getElementById('moviesGrid');
  grid.innerHTML = `
    <div class="empty-state" style="grid-column:1/-1">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
        ${isNetErr
          ? '<path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>'
          : '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'}
      </svg>
      <h3>${isNetErr ? 'Cannot connect to OMDB API' : 'No results found'}</h3>
      <p style="margin-bottom:1.25rem">${msg}</p>
      ${isNetErr ? `
      <div style="background:var(--surface-2);border:1px solid var(--border-2);border-radius:12px;padding:1rem 1.25rem;text-align:left;max-width:400px;font-size:0.82rem;color:var(--text-2);line-height:1.8">
        <strong style="color:var(--text);display:block;margin-bottom:0.5rem">💡 Try these fixes:</strong>
        1. Make sure you are connected to the internet<br>
        2. Open this file in <strong>Chrome or Firefox</strong> (not Edge/Safari)<br>
        3. If using Chrome: open DevTools → Console → check the error<br>
        4. If you see "CORS" errors, try using <strong>VS Code Live Server</strong> extension instead of opening the file directly<br>
        5. Or deploy the file to any free host (Netlify, GitHub Pages)
      </div>` : ''}
    </div>`;
  document.getElementById('resultsCount').textContent = '';
  document.getElementById('loadMoreWrap').style.display = 'none';
}

/* ─── MODAL ───────────────────────────────────── */
async function fetchAndOpenModal(id) {
  currentMovieId = id;
  const backdrop = document.getElementById('modalBackdrop');
  backdrop.classList.add('open');
  document.body.style.overflow = 'hidden';

  document.getElementById('modalTitle').textContent = 'Loading…';
  document.getElementById('modalMeta').innerHTML = '';
  document.getElementById('modalGenres').innerHTML = '';
  document.getElementById('modalPlot').textContent = '';
  document.getElementById('modalDetails').innerHTML = '';
  document.getElementById('ratingsSection').innerHTML = '';

  const d = await getMovieDetail(id);
  if (d.Response === 'True') openModal(d);
  else { closeModal(); showToast('Could not load movie details.', '#EF4444'); }
}

function openModal(d) {
  state.currentDetail = d;
  currentMovieId = d.imdbID;
  const backdrop = document.getElementById('modalBackdrop');
  backdrop.classList.add('open');
  document.body.style.overflow = 'hidden';

  if (d.Poster && d.Poster !== 'N/A') {
    document.getElementById('modalBg').src = d.Poster;
    document.getElementById('modalPosterSmall').src = d.Poster;
    document.getElementById('modalPosterSmall').alt = d.Title + ' poster';
  }

  document.getElementById('modalTitle').textContent = d.Title;

  const rating = d.imdbRating !== 'N/A'
    ? `<span class="modal-rating-big"><svg width="16" height="16" viewBox="0 0 24 24" fill="#F59E0B" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>${d.imdbRating}/10</span><span class="modal-dot">·</span>` : '';
  document.getElementById('modalMeta').innerHTML = `${rating}<span class="modal-meta-item">${d.Year}</span><span class="modal-dot">·</span><span class="modal-meta-item">${d.Runtime !== 'N/A' ? d.Runtime : '—'}</span><span class="modal-dot">·</span><span class="modal-meta-item">${d.Rated !== 'N/A' ? d.Rated : '—'}</span>`;

  if (d.Genre && d.Genre !== 'N/A') {
    document.getElementById('modalGenres').innerHTML = d.Genre.split(',').map(g=>`<span class="modal-genre-tag">${g.trim()}</span>`).join('');
  }

  document.getElementById('modalPlot').textContent = d.Plot !== 'N/A' ? d.Plot : 'No plot available.';

  const details = [
    { label: 'Director', value: d.Director },
    { label: 'Writer', value: d.Writer?.split(',')[0] },
    { label: 'Actors', value: d.Actors?.split(',').slice(0,2).join(', ') },
    { label: 'Language', value: d.Language },
    { label: 'Country', value: d.Country },
    { label: 'Box Office', value: d.BoxOffice !== 'N/A' ? d.BoxOffice : '—' },
  ];
  document.getElementById('modalDetails').innerHTML = details
    .filter(x => x.value && x.value !== 'N/A')
    .map(x => `<div class="modal-detail"><div class="modal-detail-label">${x.label}</div><div class="modal-detail-value">${x.value}</div></div>`).join('');

  const isSaved = state.watchlist.includes(d.imdbID);
  document.getElementById('watchlistBtnText').textContent = isSaved ? 'In Watchlist ✓' : 'Add to Watchlist';

  if (d.Ratings?.length) {
    const ratingsSec = document.getElementById('ratingsSection');
    ratingsSec.innerHTML = `<div class="ratings-title">Critic Ratings</div>` +
      d.Ratings.map(r => {
        let pct = 0;
        if (r.Value.includes('/10')) pct = parseFloat(r.Value)*10;
        else if (r.Value.includes('/100')) pct = parseFloat(r.Value);
        else if (r.Value.includes('%')) pct = parseFloat(r.Value);
        return `<div class="rating-bar-row">
          <span class="rating-bar-label">${r.Source.replace('Internet Movie Database','IMDb').replace('Rotten Tomatoes','Rotten Tomatoes').replace('Metacritic','Metacritic')}</span>
          <div class="rating-bar-track"><div class="rating-bar-fill" style="width:0%" data-pct="${pct}"></div></div>
          <span class="rating-bar-val">${r.Value}</span>
        </div>`;
      }).join('');
    setTimeout(() => {
      ratingsSec.querySelectorAll('.rating-bar-fill').forEach(el => {
        el.style.width = el.dataset.pct + '%';
      });
    }, 80);
  }
}

function closeModal() {
  document.getElementById('modalBackdrop').classList.remove('open');
  document.body.style.overflow = '';
  currentMovieId = null;
}

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalBackdrop').addEventListener('click', e => { if(e.target === document.getElementById('modalBackdrop')) closeModal(); });
document.addEventListener('keydown', e => { if(e.key==='Escape') closeModal(); });

/* ─── WATCHLIST ───────────────────────────────── */
function toggleWatchlist(id, e) {
  if (e) { e.stopPropagation(); e.preventDefault(); }
  const idx = state.watchlist.indexOf(id);
  if (idx === -1) {
    state.watchlist.push(id);
    showToast('Added to watchlist', '#22C55E');
  } else {
    state.watchlist.splice(idx, 1);
    showToast('Removed from watchlist', '#E11D48');
  }
  localStorage.setItem('cine_watchlist', JSON.stringify(state.watchlist));
  document.getElementById('watchlistBtnText').textContent = state.watchlist.includes(id) ? 'In Watchlist ✓' : 'Add to Watchlist';
  document.querySelectorAll('.movie-save-btn').forEach(btn => {
    const card = btn.closest('.movie-card');
    const onClickStr = btn.getAttribute('onclick') || '';
    if (onClickStr.includes(id)) {
      const isSaved = state.watchlist.includes(id);
      btn.classList.toggle('saved', isSaved);
      btn.setAttribute('aria-label', `${isSaved?'Remove from':'Add to'} watchlist`);
      btn.querySelector('svg').setAttribute('fill', isSaved ? 'currentColor' : 'none');
    }
  });
}

/* ─── SHARE ───────────────────────────────────── */
function shareMovie() {
  const d = state.currentDetail;
  if (!d) return;
  if (navigator.share) {
    navigator.share({ title: d.Title, text: `Check out "${d.Title}" (${d.Year})`, url: `https://www.imdb.com/title/${d.imdbID}` });
  } else {
    navigator.clipboard.writeText(`https://www.imdb.com/title/${d.imdbID}`).then(() => showToast('IMDB link copied!', '#3B82F6'));
  }
}

/* ─── TOAST ───────────────────────────────────── */
function showToast(msg, color = '#22C55E') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span class="toast-dot" style="background:${color}"></span>${msg}`;
  container.appendChild(toast);
  requestAnimationFrame(() => { requestAnimationFrame(() => toast.classList.add('show')); });
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 2800);
}

/* ─── SEARCH ──────────────────────────────────── */
const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');

searchInput.addEventListener('input', () => {
  const val = searchInput.value.trim();
  searchClear.style.display = val ? 'flex' : 'none';
  clearTimeout(searchDebounce);
  if (val.length >= 2) {
    searchDebounce = setTimeout(() => {
      state.query = val;
      state.page = 1;
      state.searchMode = true;
      document.getElementById('sectionTitleText').textContent = `Results for "${val}"`;
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      loadMovies(val, 1, false);
    }, 400);
  } else if (val.length === 0) {
    searchClear.style.display = 'none';
  }
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.style.display = 'none';
  state.searchMode = false;
  state.query = 'avengers';
  state.page = 1;
  document.getElementById('sectionTitleText').textContent = 'Popular Movies';
  document.querySelector('.cat-btn[data-query="avengers"]').classList.add('active');
  loadMovies('avengers', 1, false);
});

/* ─── CATEGORIES ──────────────────────────────── */
document.getElementById('categoryBar').addEventListener('click', e => {
  const btn = e.target.closest('.cat-btn');
  if (!btn) return;
  document.querySelectorAll('.cat-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
  btn.classList.add('active');
  btn.setAttribute('aria-selected','true');
  const query = btn.dataset.query;
  state.query = query;
  state.page = 1;
  state.searchMode = false;
  searchInput.value = '';
  searchClear.style.display = 'none';
  document.getElementById('sectionTitleText').textContent = btn.textContent.trim() + ' Movies';
  loadMovies(query, 1, false);
});

/* ─── TYPE PILLS ──────────────────────────────── */
document.querySelectorAll('.nav-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.nav-pill').forEach(p => { p.classList.remove('active'); p.setAttribute('aria-selected','false'); });
    pill.classList.add('active');
    pill.setAttribute('aria-selected','true');
    state.type = pill.dataset.type;
    state.page = 1;
    loadMovies(state.query, 1, false);
  });
});

/* ─── LOAD MORE ───────────────────────────────── */
function loadMore() {
  state.page++;
  loadMovies(state.query, state.page, true);
}

/* ─── INIT ────────────────────────────────────── */
loadHero();
loadMovies('avengers', 1, false);
