// ── UI ────────────────────────────────────────────────────
// All DOM interactions: search, now-playing, mode label,
// HUD meters, BPM flash, toast, fullscreen.

const SEARCH_PROXY = "https://bold-leaf-c65cprism.danielaraya54151.workers.dev";

export class UI {
  constructor({ onSongSelect, onModeChange }) {
    this._onSongSelect = onSongSelect;
    this._onModeChange = onModeChange;
    this._toastTimer = null;

    this._els = {
      search: document.getElementById("search"),
      searchBtn: document.getElementById("searchBtn"),
      results: document.getElementById("results"),
      errorToast: document.getElementById("errorToast"),
      modeLabel: document.getElementById("modeLabel"),
      modeDots: document.getElementById("modeDots"),
      btnNext: document.getElementById("btnNext"),
      btnPrev: document.getElementById("btnPrev"),
      btnHud: document.getElementById("btnHud"),
      btnFull: document.getElementById("btnFullscreen"),
      hud: document.getElementById("hud"),
      hBass: document.getElementById("hBass"),
      hMid: document.getElementById("hMid"),
      hHigh: document.getElementById("hHigh"),
      vBass: document.getElementById("vBass"),
      vMid: document.getElementById("vMid"),
      vHigh: document.getElementById("vHigh"),
      bpmVal: document.getElementById("bpmVal"),
      nowPlaying: document.getElementById("nowPlaying"),
      npCover: document.getElementById("npCover"),
      npFallback: document.getElementById("npCover-fallback"),
      npTitle: document.getElementById("npTitle"),
      npArtist: document.getElementById("npArtist"),
      aiLabel: document.getElementById("aiLabel"),
      idle: document.getElementById("idle"),
      modeSwitcher: document.getElementById('modeSwitcher'),
    };

    this._bind();
  }

  // ── Public API ─────────────────────────────────────────

  updateModeLabel(modes, index) {
    const { modeLabel, modeDots } = this._els;
    if (!modeLabel) return;
    modeLabel.textContent = modes[index];
    modeLabel.classList.remove("pop");
    void modeLabel.offsetWidth;
    modeLabel.classList.add("pop");
    modeDots.innerHTML = "";
    modes.forEach((_, i) => {
      const d = document.createElement("div");
      d.className = "mode-dot" + (i === index ? " active" : "");
      modeDots.appendChild(d);
    });
  }

  updateHUD(audio) {
    const { hBass, hMid, hHigh, vBass, vMid, vHigh, bpmVal } = this._els;
    hBass.style.width = (audio.bass / 255) * 100 + "%";
    hMid.style.width = (audio.mid / 255) * 100 + "%";
    hHigh.style.width = (audio.high / 255) * 100 + "%";
    vBass.textContent = Math.round(audio.bass);
    vMid.textContent = Math.round(audio.mid);
    vHigh.textContent = Math.round(audio.high);

    if (bpmVal && audio.bpm !== this._lastBpm) {
      bpmVal.textContent = audio.bpm;
      bpmVal.classList.remove("bpm-flash");
      void bpmVal.offsetWidth;
      bpmVal.classList.add("bpm-flash");
      this._lastBpm = audio.bpm;
    }
  }

  showNowPlaying(song, onImageLoad) {
    this._lastBpm = null;
    const { npTitle, npArtist, npCover, npFallback, nowPlaying, hud, idle } =
      this._els;
    npTitle.textContent = song.trackName;
    npArtist.textContent = song.artistName;
    nowPlaying.classList.add("visible");
    hud.classList.add("visible");
    idle.classList.add("hidden");

    const coverUrl = (song.artworkUrl100 || song.artworkUrl60).replace(
      "100x100",
      "600x600",
    );
    npCover.style.display = "";
    npFallback.classList.remove("visible");

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      npCover.src = img.src;
      npFallback.classList.remove("visible");
      onImageLoad(img);
    };
    img.onerror = () => {
      npCover.style.display = "none";
      npFallback.classList.add("visible");
    };
    img.src = coverUrl;
  }

  showAILabel(text) {
    const el = this._els.aiLabel;
    if (!el) return;
    el.textContent = text;
    el.classList.add("visible");
    clearTimeout(this._aiLabelTimer);
    this._aiLabelTimer = setTimeout(() => el.classList.remove("visible"), 4000);
  }

  showToast(msg) {
    const el = this._els.errorToast;
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove("show"), 3500);
  }

  // ── Private ────────────────────────────────────────────

  _bind() {
  const { search, searchBtn, results, btnNext, btnPrev, btnFull, btnHud } = this._els;

  searchBtn.addEventListener('click', () => this._doSearch());
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') this._doSearch();
  });
  document.addEventListener('click', (e) => {
    if (!results.contains(e.target) && e.target !== search && e.target !== searchBtn)
      results.classList.remove('open');
  });

  btnNext.addEventListener('click', () => this._onModeChange(1));
  btnPrev.addEventListener('click', () => this._onModeChange(-1));
  btnFull.addEventListener('click', () => this._toggleFullscreen());
  btnHud.addEventListener('click', () => this._toggleHud()); // ← esta línea faltaba

  document.addEventListener('keydown', (e) => {
    if (e.key === 'v' || e.key === 'V') this._onModeChange(1);
    if (e.key === 'b' || e.key === 'B') this._onModeChange(-1);
    if (e.key === 'f' || e.key === 'F') this._toggleFullscreen();
    if (e.key === 'h' || e.key === 'H') this._toggleHud(); // ← y esta
  });

  document.addEventListener('fullscreenchange', () => {
    const btn = this._els.btnFull;
    btn.textContent = '⛶';
    btn.title = document.fullscreenElement ? 'Exit fullscreen (F)' : 'Fullscreen (F)';
    btn.classList.toggle('active', !!document.fullscreenElement);
  });
}

  async _doSearch() {
    const q = this._els.search.value.trim();
    if (!q) return;

    const { searchBtn, results } = this._els;
    searchBtn.innerHTML = '<span class="search-spinner"></span>';
    searchBtn.disabled = true;
    results.innerHTML = "";
    results.classList.remove("open");

    let json = null;
    try {
      const res = await fetch(
        `${SEARCH_PROXY}?term=${encodeURIComponent(q)}&limit=50&country=US`,
      );
      json = await res.json();
    } catch (e) {
      this.showToast("Search failed. Check your connection.");
      searchBtn.textContent = "SEARCH";
      searchBtn.disabled = false;
      return;
    }

    searchBtn.textContent = "SEARCH";
    searchBtn.disabled = false;

    if (!json.results?.length) {
      results.innerHTML =
        '<div class="result" style="color:rgba(255,255,255,.3);cursor:default">No results</div>';
    } else {
      json.results.forEach((song) => {
        if (!song.previewUrl) return;
        const div = document.createElement("div");
        div.className = "result";
        div.innerHTML = `<img src="${song.artworkUrl60}" alt=""><div class="result-info"><div class="result-title">${song.trackName}</div><div class="result-artist">${song.artistName}</div></div><div class="result-play">▶</div>`;
        div.addEventListener("click", () => {
          results.classList.remove("open");
          results.innerHTML = "";
          this._onSongSelect(song);
        });
        results.appendChild(div);
      });
    }
    results.classList.add("open");
  }

  _toggleFullscreen() {
    if (!document.fullscreenElement)
      document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
  }

  _toggleHud() {
  const { hud, btnHud, nowPlaying, modeSwitcher } = this._els;
  const isShown = document.body.classList.contains('cinema');
  if (isShown) {
    document.body.classList.remove('cinema');
    btnHud?.classList.remove('active');
  } else {
    document.body.classList.add('cinema');
    btnHud?.classList.add('active');
  }
}
}
