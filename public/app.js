// Application State
let allFeedItems = [];
let filteredFeedItems = [];
let activeCategory = 'all';
let activeKeyword = null;
let searchQuery = '';
let selectedId = null;

// Auto-Refresh Configuration
const CACHE_DURATION_SEC = 15 * 60; // 15 minutes
let countdownSeconds = CACHE_DURATION_SEC;
let countdownTimer = null;

// Category ACCENT Tag Mapping
const CAT_TAGS = {
  'cs.RO': ['tag-ro', 'cs.RO'],
  'cs.AI': ['tag-ai', 'cs.AI'],
  'cs.CV': ['tag-cv', 'cs.CV'],
  'cs.LG': ['tag-lg', 'cs.LG'],
  'cs.SY': ['tag-sy', 'cs.SY'],
  'industry-news': ['tag-industry', 'Industry']
};

// Main Fetch Feed Controller
async function fetchFeedData(force = false) {
  const refreshBtn = document.getElementById('refresh-btn');
  const refreshIcon = document.getElementById('refresh-icon');
  
  if (refreshBtn) refreshBtn.classList.add('spinning');
  
  // Show loading skeleton if first time loading
  const feedContent = document.getElementById('feed-content');
  if (allFeedItems.length === 0) {
    feedContent.innerHTML = `
      <div class="loading-state">
        <div class="loader-grid">
          ${Array(8).fill('<div class="loader-cell"></div>').join('')}
        </div>
        <div class="loading-text">SYNCING WITH EMBEDDED PHYSICAL AI DATABASE SERVER...</div>
      </div>`;
  }

  try {
    const url = force ? '/api/feed?refresh=true' : '/api/feed';
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    
    const result = await response.json();
    
    if (result.status === 'success') {
      allFeedItems = result.data || [];
      
      // Update metadata and status indicators
      updateLastUpdatedTime(result.timestamp);
      updateCacheStatus(result.source);
      updateCategoryCounts();
      updateStatsPanel();
      applyFilters();
      
      // Automatically select first item if none is selected
      if (allFeedItems.length > 0 && !selectedId) {
        const firstItem = allFeedItems[0];
        selectFeedItem(firstItem.arxivId || firstItem.link);
      }
      
      // Reset countdown timer
      resetCountdown();
    } else {
      throw new Error(result.message || 'Unknown response error');
    }
  } catch (err) {
    console.error('Fetch Feed Failed:', err);
    feedContent.innerHTML = `
      <div class="error-state">
        <div style="font-size: 14px; font-weight: bold; margin-bottom: 8px;">⚠ PIPELINE CONNECTION FAILURE</div>
        <div style="font-size: 11px; color: var(--text-dim); margin-bottom: 16px;">${escapeHtml(err.message)}</div>
        <button class="open-btn" onclick="fetchFeedData(true)" style="max-width: 200px; margin: 0 auto;">Retry Pipeline Connection</button>
      </div>`;
  } finally {
    if (refreshBtn) refreshBtn.classList.remove('spinning');
  }
}

// Update Clock & Status Timestamps
function updateLastUpdatedTime(timestampIso) {
  const dateObj = timestampIso ? new Date(timestampIso) : new Date();
  const timeStr = dateObj.toUTCString().split(' ')[4] + ' UTC';
  document.getElementById('last-updated').textContent = timeStr;
}

// Update Cache Status Indicators
function updateCacheStatus(sourceType) {
  const cacheVal = document.getElementById('stat-cache-status');
  if (sourceType === 'cache' || sourceType === 'cache_retained') {
    cacheVal.textContent = 'CACHED';
    cacheVal.style.color = 'var(--blue)';
  } else {
    cacheVal.textContent = 'FRESH';
    cacheVal.style.color = 'var(--green)';
  }
}

// Update counts on the left sidebar categories
function updateCategoryCounts() {
  // Total
  document.getElementById('count-all').textContent = allFeedItems.length;
  
  // Specific Categories
  const categories = ['cs.RO', 'cs.AI', 'cs.CV', 'cs.LG', 'cs.SY', 'industry-news'];
  categories.forEach(cat => {
    let count = 0;
    if (cat === 'industry-news') {
      count = allFeedItems.filter(item => item.cats.includes('industry-news') || item.source !== 'arXiv').length;
      document.getElementById('count-industry').textContent = count;
    } else {
      count = allFeedItems.filter(item => item.cats.includes(cat)).length;
      const elId = 'count-' + cat.split('.')[1];
      const el = document.getElementById(elId);
      if (el) el.textContent = count;
    }
  });

  // Keyword counts
  const keywords = ['humanoid', 'manipulation', 'reinforcement', 'locomotion', 'diffusion', 'grasping'];
  keywords.forEach(kw => {
    const count = allFeedItems.filter(item => {
      const matchText = (item.title + ' ' + item.summary).toLowerCase();
      return matchText.includes(kw);
    }).length;
    const el = document.getElementById('kw-' + kw);
    if (el) el.textContent = count;
  });
}

// Update Status Bar Values
function updateStatsPanel() {
  document.getElementById('stat-count').textContent = allFeedItems.length;
  document.getElementById('stat-sub').textContent = `Aggregated Items`;
  
  if (allFeedItems.length > 0) {
    // Latest item pub date
    const latestItem = allFeedItems[0];
    document.getElementById('stat-latest').textContent = formatDateRelative(latestItem.published);
  }
}

// Filter Controller
function applyFilters() {
  let items = [...allFeedItems];

  // 1. Category Filter
  if (activeCategory !== 'all') {
    if (activeCategory === 'industry-news') {
      items = items.filter(item => item.cats.includes('industry-news') || item.source !== 'arXiv');
    } else {
      items = items.filter(item => item.cats.includes(activeCategory));
    }
  }

  // 2. Keyword Filter
  if (activeKeyword) {
    items = items.filter(item => {
      const matchText = (item.title + ' ' + item.summary).toLowerCase();
      return matchText.includes(activeKeyword);
    });
  }

  // 3. Search Query Filter
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    items = items.filter(item => {
      const titleMatch = item.title.toLowerCase().includes(q);
      const summaryMatch = item.summary.toLowerCase().includes(q);
      const authorMatch = item.authors.some(auth => auth.toLowerCase().includes(q));
      return titleMatch || summaryMatch || authorMatch;
    });
  }

  filteredFeedItems = items;

  // Update Stats UI
  const activeLabel = activeKeyword ? activeKeyword.toUpperCase() : (activeCategory === 'all' ? 'ALL TOPICS' : activeCategory.toUpperCase());
  document.getElementById('stat-filter').textContent = activeLabel;
  document.getElementById('stat-filtered').textContent = `Showing ${filteredFeedItems.length} matching`;

  renderFeedList();
  if (activeView === 'chart') {
    renderTrendChart();
  }
}

// Render the feed cards
function renderFeedList() {
  const container = document.getElementById('feed-content');
  
  if (filteredFeedItems.length === 0) {
    container.innerHTML = `
      <div class="no-results">
        NO PIPELINE RECORDS MATCHED YOUR SELECTION CRITERIA
      </div>`;
    return;
  }

  const html = filteredFeedItems.map((item, idx) => {
    const primaryCat = determinePrimaryCategory(item.cats, item.source);
    const [tagClass, label] = CAT_TAGS[primaryCat] || ['tag-ro', primaryCat];
    
    // Additional tags
    const extraCats = item.cats.filter(c => c !== primaryCat && CAT_TAGS[c]).slice(0, 2);
    const extraTagsHtml = extraCats.map(c => {
      const [tc, lbl] = CAT_TAGS[c];
      return `<span class="paper-tag ${tc}">${lbl}</span>`;
    }).join('');

    const uniqueId = item.arxivId || item.link;
    const isSelected = uniqueId === selectedId;

    return `
      <div class="paper-card ${isSelected ? 'selected' : ''}" 
           onclick="selectFeedItem('${uniqueId}')"
           style="animation-delay: ${idx * 0.02}s">
        <div class="paper-meta">
          <span class="paper-id">${item.arxivId ? `arXiv:${item.arxivId}` : item.source.toUpperCase()}</span>
          <span class="paper-tag ${tagClass}">${label}</span>
          ${extraTagsHtml}
          <span class="paper-date">${formatDateRelative(item.published)}</span>
        </div>
        <div class="paper-title">${escapeHtml(item.title)}</div>
        <div class="paper-authors">${escapeHtml(item.authors.slice(0, 4).join(', '))}${item.authors.length > 4 ? ` +${item.authors.length - 4} more` : ''}</div>
        <div class="paper-abstract">${escapeHtml(item.summary)}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

// Select details item
function selectFeedItem(uniqueId) {
  selectedId = uniqueId;
  
  // Highlight selected card
  document.querySelectorAll('.paper-card').forEach(card => {
    // Safe check if custom onclick includes the unique ID
    const clickAttr = card.getAttribute('onclick');
    if (clickAttr && clickAttr.includes(uniqueId)) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });

  const item = allFeedItems.find(i => (i.arxivId === uniqueId || i.link === uniqueId));
  if (!item) return;

  const detailContainer = document.getElementById('detail-content');
  
  // Render tags in details
  const tagsHtml = item.cats.filter(c => CAT_TAGS[c]).map(c => {
    const [cls, lbl] = CAT_TAGS[c];
    return `<span class="paper-tag ${cls}">${lbl}</span>`;
  }).join('');

  // Handle PDF button depending on availability (only arXiv has PDFs directly)
  const pdfButtonHtml = item.pdfLink 
    ? `<a href="${item.pdfLink}" target="_blank" class="abs-btn">↓ DOWNLOAD PDF SPEC</a>` 
    : `<button class="abs-btn" disabled style="opacity: 0.5; cursor: not-allowed;">↓ NO PDF AVAILABLE</button>`;

  detailContainer.innerHTML = `
    <div class="detail-body">
      <div class="detail-tags">${tagsHtml}</div>
      <div class="detail-title">${escapeHtml(item.title)}</div>
      <div class="detail-authors">${escapeHtml(item.authors.join(' · '))}</div>
      
      <div class="detail-date-row">
        <div class="detail-date-cell">
          <div class="label">PUBLISHED / ACQUIRED</div>
          <div class="value">${formatDateFull(item.published)}</div>
        </div>
        <div class="detail-date-cell">
          <div class="label">FEED SOURCE</div>
          <div class="value" style="color: var(--green); font-weight: bold;">${escapeHtml(item.source)}</div>
        </div>
      </div>

      <div class="detail-section-label">ABSTRACT / TRANSCRIPT</div>
      <div class="detail-abstract">${escapeHtml(item.summary)}</div>

      <div class="action-buttons">
        <a href="${item.link}" target="_blank" class="open-btn">↗ OPEN REMOTE SOURCE</a>
        ${pdfButtonHtml}
      </div>
    </div>
  `;
}

// Categories helper
function determinePrimaryCategory(cats, source) {
  if (source !== 'arXiv') return 'industry-news';
  const order = ['cs.RO', 'cs.AI', 'cs.CV', 'cs.LG', 'cs.SY'];
  for (const o of order) {
    if (cats.includes(o)) return o;
  }
  return cats[0] || 'cs.RO';
}

// Category selection
function setCategory(cat, el) {
  activeCategory = cat;
  activeKeyword = null; // reset keyword filter when switching categories
  
  document.querySelectorAll('.sidebar [data-cat]').forEach(e => e.classList.remove('active'));
  document.querySelectorAll('.sidebar [data-kw]').forEach(e => e.classList.remove('active'));
  
  el.classList.add('active');
  
  // Update feed panel title label
  const label = cat === 'all' ? 'LATEST ENTRIES' : (cat === 'industry-news' ? 'INDUSTRY ARTICLES' : `TOPIC: ${cat.toUpperCase()}`);
  document.getElementById('feed-title-label').textContent = label;
  
  applyFilters();
}

// Keyword selection
function setKeyword(kw, el) {
  if (activeKeyword === kw) {
    // Toggle keyword off
    activeKeyword = null;
    el.classList.remove('active');
  } else {
    // Select keyword
    activeKeyword = kw;
    activeCategory = 'all'; // reset category filter
    
    document.querySelectorAll('.sidebar [data-cat]').forEach(e => e.classList.remove('active'));
    document.querySelectorAll('.sidebar [data-kw]').forEach(e => e.classList.remove('active'));
    
    // Highlight all topics category as active base
    const allTopicsEl = document.querySelector('.sidebar [data-cat="all"]');
    if (allTopicsEl) allTopicsEl.classList.add('active');
    
    el.classList.add('active');
  }
  
  applyFilters();
}

// Search callback
function onSearch() {
  searchQuery = document.getElementById('search-input').value;
  applyFilters();
}

// Date Formatters
function formatDateFull(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateRelative(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  const now = new Date();
  const diff = now - d;
  
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (hours < 0) return 'Just now';
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return formatDateFull(isoString);
}

// HTML Escaping Utility
function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Countdown Clock Management
function resetCountdown() {
  countdownSeconds = CACHE_DURATION_SEC;
  if (countdownTimer) clearInterval(countdownTimer);
  
  countdownTimer = setInterval(() => {
    countdownSeconds--;
    if (countdownSeconds <= 0) {
      clearInterval(countdownTimer);
      fetchFeedData(false); // background fetch
    } else {
      const minutes = Math.floor(countdownSeconds / 60);
      const secs = countdownSeconds % 60;
      document.getElementById('stat-next').textContent = `countdown: ${minutes}m ${secs}s`;
    }
  }, 1000);
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  fetchFeedData(false);
});

// Chart View & Data Controllers
let activeView = 'feed';
let trendChartInstance = null;

const keywordsList = ['humanoid', 'manipulation', 'reinforcement', 'locomotion', 'diffusion', 'grasping'];
const keywordLabels = {
  'humanoid': 'Humanoid Robots',
  'manipulation': 'Manipulation',
  'reinforcement': 'Reinforcement Learning',
  'locomotion': 'Locomotion',
  'diffusion': 'Diffusion Policy',
  'grasping': 'Grasping & Dexterity'
};

function switchView(view) {
  activeView = view;
  const feedContent = document.getElementById('feed-content');
  const chartContainer = document.getElementById('chart-view-container');
  const feedTabBtn = document.getElementById('tab-btn-feed');
  const chartTabBtn = document.getElementById('tab-btn-chart');

  if (view === 'feed') {
    feedContent.style.display = 'block';
    chartContainer.style.display = 'none';
    feedTabBtn.classList.add('active');
    chartTabBtn.classList.remove('active');
  } else {
    feedContent.style.display = 'none';
    chartContainer.style.display = 'flex';
    feedTabBtn.classList.remove('active');
    chartTabBtn.classList.add('active');
    renderTrendChart();
  }
}

function getMonday(d) {
  d = new Date(d);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function generateChartData() {
  const weeksMap = {};

  filteredFeedItems.forEach(item => {
    const pubDate = new Date(item.published);
    if (isNaN(pubDate)) return;
    const mon = getMonday(pubDate);
    const monKey = mon.toISOString().split('T')[0]; // YYYY-MM-DD

    if (!weeksMap[monKey]) {
      weeksMap[monKey] = {
        date: mon,
        counts: {
          'humanoid': 0,
          'manipulation': 0,
          'reinforcement': 0,
          'locomotion': 0,
          'diffusion': 0,
          'grasping': 0
        }
      };
    }

    const matchText = (item.title + ' ' + item.summary).toLowerCase();
    keywordsList.forEach(kw => {
      if (matchText.includes(kw)) {
        weeksMap[monKey].counts[kw]++;
      }
    });
  });

  // Sort weeks chronologically
  const sortedWeekKeys = Object.keys(weeksMap).sort();
  
  // Format labels: "May 12"
  const labels = sortedWeekKeys.map(k => {
    const d = weeksMap[k].date;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const datasets = {
    'humanoid': [],
    'manipulation': [],
    'reinforcement': [],
    'locomotion': [],
    'diffusion': [],
    'grasping': []
  };

  sortedWeekKeys.forEach(k => {
    const counts = weeksMap[k].counts;
    keywordsList.forEach(kw => {
      datasets[kw].push(counts[kw]);
    });
  });

  return { labels, datasets };
}

function renderTrendChart() {
  const canvas = document.getElementById('trendChart');
  if (!canvas) return;

  const { labels, datasets } = generateChartData();

  if (trendChartInstance) {
    trendChartInstance.destroy();
  }

  const datasetColors = {
    'humanoid': '#00e5a0',       // Green
    'manipulation': '#00b0ff',   // Blue
    'reinforcement': '#ff9100',  // Orange
    'locomotion': '#ff1744',     // Red
    'diffusion': '#d1c4e9',      // Purple
    'grasping': '#29b6f6'        // Light Blue
  };

  const chartDatasets = Object.keys(datasetColors).map(kw => {
    return {
      label: keywordLabels[kw],
      data: datasets[kw] || [],
      borderColor: datasetColors[kw],
      backgroundColor: datasetColors[kw] + '15',
      borderWidth: 2,
      tension: 0.3,
      pointRadius: 4,
      pointHoverRadius: 6,
      fill: false
    };
  });

  trendChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: chartDatasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: '#e8e5f0',
            font: {
              family: 'IBM Plex Mono',
              size: 10
            }
          }
        },
        tooltip: {
          backgroundColor: '#08070d',
          titleColor: '#00e5a0',
          bodyColor: '#e8e5f0',
          titleFont: { family: 'IBM Plex Mono' },
          bodyFont: { family: 'IBM Plex Mono' },
          borderColor: '#111520',
          borderWidth: 1
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(0, 229, 160, 0.15)'
          },
          ticks: {
            color: '#9c97b8',
            font: { family: 'IBM Plex Mono', size: 9 }
          }
        },
        y: {
          grid: {
            color: 'rgba(0, 229, 160, 0.15)'
          },
          ticks: {
            color: '#9c97b8',
            precision: 0,
            font: { family: 'IBM Plex Mono', size: 9 }
          }
        }
      }
    }
  });
}

