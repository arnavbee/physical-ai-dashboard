// Application State
let allFeedItems = [];
let filteredFeedItems = [];
let activeCategory = 'all';
let activeKeyword = null;
let searchQuery = '';
let activeTimeWindow = 'all';
let selectedId = null;

// Auto-Refresh Configuration
const CACHE_DURATION_SEC = 15 * 60; // 15 minutes
let countdownSeconds = CACHE_DURATION_SEC;
let countdownTimer = null;

// Category ACCENT Tag Mapping
const SOURCE_TAGS = {
  'Ramp Vendor Reports': ['tag-ramp', 'Ramp Spend'],
  'Harmonic Hot 25': ['tag-harmonic', 'Harmonic 25'],
  'a16z Build': ['tag-a16z', 'a16z Build'],
  'Founders You Should Know': ['tag-fysk', 'FYSK Pitch'],
  'Next Play': ['tag-nextplay', 'Next Play'],
  'YC Startup Directory': ['tag-yc', 'YC Batch'],
  'Early Days Substack': ['tag-earlydays', 'Early Days']
};

const KEYWORD_MAP = {
  'agent': ['agent', 'ai', 'machine learning', 'neural', 'model', 'llm', 'intelligence', 'gpt', 'parser', 'perplexity'],
  'saas': ['saas', 'software', 'spend', 'vendor', 'subscription', 'seat', 'billing', 'linear', 'figma', 'notion', 'slack'],
  'developer': ['developer', 'tool', 'api', 'database', 'infrastructure', 'wasm', 'code', 'programming', 'posthog', 'sentry', 'retool', 'supabase', 'vercel', 'git'],
  'robot': ['robot', 'hardware', 'embodied', 'coordination', 'manipulation', 'locomotion', 'humanoid', 'physical', 'sensory', 'tactile', 'figure'],
  'fintech': ['fintech', 'finance', 'billing', 'spend', 'transaction', 'ledger', 'bank', 'reconciliation', 'payment', 'card'],
  'bio': ['bio', 'health', 'protein', 'gravity', 'clinical', 'medical', 'cell', 'cellular', 'chemical']
};

// Main Fetch Feed Controller
async function fetchFeedData(force = false) {
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) refreshBtn.classList.add('spinning');
  
  const feedContent = document.getElementById('feed-content');
  if (allFeedItems.length === 0) {
    feedContent.innerHTML = `
      <div class="loading-state">
        <div class="loader-grid">
          ${Array(8).fill('<div class="loader-cell"></div>').join('')}
        </div>
        <div class="loading-text">SYNCING WITH EMBEDDED VENTURE INTELLIGENCE SERVER...</div>
      </div>`;
  }

  try {
    const url = force ? '/api/startup-feed?refresh=true' : '/api/startup-feed';
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
        selectFeedItem(firstItem.link);
      }
      
      resetCountdown();
    } else {
      throw new Error(result.message || 'Unknown response error');
    }
  } catch (err) {
    console.error('Fetch Feed Failed:', err);
    feedContent.innerHTML = `
      <div class="error-state">
        <div style="font-size: 14px; font-weight: bold; margin-bottom: 8px; color: var(--pink)">⚠ PIPELINE CONNECTION FAILURE</div>
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
  const el = document.getElementById('last-updated');
  if (el) el.textContent = timeStr;
}

// Update Cache Status Indicators
function updateCacheStatus(sourceType) {
  const cacheVal = document.getElementById('stat-cache-status');
  if (!cacheVal) return;
  if (sourceType === 'cache' || sourceType === 'cache_retained') {
    cacheVal.textContent = 'CACHED';
    cacheVal.style.color = 'var(--blue)';
  } else {
    cacheVal.textContent = 'FRESH';
    cacheVal.style.color = 'var(--cyan)';
  }
}

// Check if content matches keyword based on mapped terms
function matchKeyword(item, kw) {
  const text = (item.title + ' ' + item.summary).toLowerCase();
  const terms = KEYWORD_MAP[kw] || [kw];
  return terms.some(term => text.includes(term));
}

// Update counts on the left sidebar categories
function updateCategoryCounts() {
  // Total
  const countAllEl = document.getElementById('count-all');
  if (countAllEl) countAllEl.textContent = allFeedItems.length;
  
  // Specific Categories
  const categories = ['market-reports', 'talent-jobs', 'pitch-showcases', 'startup-directories', 'substack-insights'];
  categories.forEach(cat => {
    const count = allFeedItems.filter(item => item.cats.includes(cat)).length;
    const elId = 'count-' + cat.split('-')[1];
    const el = document.getElementById(elId);
    if (el) el.textContent = count;
  });

  // Keyword counts
  const keywords = ['agent', 'saas', 'developer', 'robot', 'fintech', 'bio'];
  keywords.forEach(kw => {
    const count = allFeedItems.filter(item => matchKeyword(item, kw)).length;
    const el = document.getElementById('kw-' + kw);
    if (el) el.textContent = count;
  });
}

// Update Status Bar Values
function updateStatsPanel() {
  const countEl = document.getElementById('stat-count');
  if (countEl) countEl.textContent = allFeedItems.length;
  const subEl = document.getElementById('stat-sub');
  if (subEl) subEl.textContent = `Aggregated Records`;
  
  if (allFeedItems.length > 0) {
    const latestItem = allFeedItems[0];
    const latestEl = document.getElementById('stat-latest');
    if (latestEl) latestEl.textContent = formatDateRelative(latestItem.published);
  }
}

// Filter Controller
function applyFilters() {
  let items = [...allFeedItems];

  // 0. Time Window Filter
  if (activeTimeWindow !== 'all') {
    const now = new Date();
    const cutoffDate = new Date();
    const days = parseInt(activeTimeWindow);
    if (!isNaN(days)) {
      cutoffDate.setDate(now.getDate() - days);
      items = items.filter(item => {
        const pubDate = new Date(item.published);
        return !isNaN(pubDate) && pubDate >= cutoffDate;
      });
    }
  }

  // 1. Category Filter
  if (activeCategory !== 'all') {
    items = items.filter(item => item.cats.includes(activeCategory));
  }

  // 2. Keyword Filter
  if (activeKeyword) {
    items = items.filter(item => matchKeyword(item, activeKeyword));
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
  const activeLabel = activeKeyword ? activeKeyword.toUpperCase() : (activeCategory === 'all' ? 'ALL SOURCES' : activeCategory.toUpperCase().replace('-', ' '));
  const filterValEl = document.getElementById('stat-filter');
  if (filterValEl) filterValEl.textContent = activeLabel;
  const filteredEl = document.getElementById('stat-filtered');
  if (filteredEl) filteredEl.textContent = `Showing ${filteredFeedItems.length} matching`;

  renderFeedList();
  if (activeView === 'chart') {
    renderTrendChart();
  }
}

// Render the feed cards
function renderFeedList() {
  const container = document.getElementById('feed-content');
  if (!container) return;
  
  if (filteredFeedItems.length === 0) {
    container.innerHTML = `
      <div class="no-results">
        NO PIPELINE RECORDS MATCHED YOUR FILTER CRITERIA
      </div>`;
    return;
  }

  const html = filteredFeedItems.map((item, idx) => {
    const [tagClass, label] = SOURCE_TAGS[item.source] || ['tag-general', item.source];
    
    // Extra category tags mapping
    const extraCats = item.cats.filter(c => c !== 'substack-insights' && c !== 'market-reports');
    const extraTagsHtml = extraCats.map(c => {
      if (c === 'talent-jobs') return `<span class="paper-tag tag-nextplay">Jobs</span>`;
      if (c === 'pitch-showcases') return `<span class="paper-tag tag-yc">Pitches</span>`;
      return '';
    }).join('');

    const uniqueId = item.link;
    const isSelected = uniqueId === selectedId;

    return `
      <div class="paper-card ${isSelected ? 'selected' : ''}" 
           onclick="selectFeedItem('${uniqueId}')"
           style="animation-delay: ${idx * 0.02}s">
        <div class="paper-meta">
          <span class="paper-id">${item.source.toUpperCase()}</span>
          <span class="paper-tag ${tagClass}">${label}</span>
          ${extraTagsHtml}
          <span class="paper-date">${formatDateRelative(item.published)}</span>
        </div>
        <div class="paper-title">${escapeHtml(item.title)}</div>
        <div class="paper-authors">${escapeHtml(item.authors.slice(0, 3).join(', '))}${item.authors.length > 3 ? ` +${item.authors.length - 3}` : ''}</div>
        <div class="paper-abstract">${escapeHtml(item.summary.replace(/<[^>]*>/g, ''))}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

// Renders the specific interactive custom modules in detail pane
function selectFeedItem(uniqueId) {
  selectedId = uniqueId;
  
  // Highlight card in list
  document.querySelectorAll('.paper-card').forEach(card => {
    const clickAttr = card.getAttribute('onclick');
    if (clickAttr && clickAttr.includes(uniqueId)) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });

  const item = allFeedItems.find(i => i.link === uniqueId);
  if (!item) return;

  const detailContainer = document.getElementById('detail-content');
  if (!detailContainer) return;
  
  const [tagClass, label] = SOURCE_TAGS[item.source] || ['tag-general', item.source];
  const tagsHtml = `<span class="paper-tag ${tagClass}">${label}</span>` + 
    item.cats.map(c => {
      if (c === 'market-reports') return `<span class="paper-tag tag-ramp">Report</span>`;
      if (c === 'talent-jobs') return `<span class="paper-tag tag-nextplay">Talent / Jobs</span>`;
      if (c === 'pitch-showcases') return `<span class="paper-tag tag-yc">Pitch</span>`;
      if (c === 'startup-directories') return `<span class="paper-tag tag-yc">Directory</span>`;
      return '';
    }).filter(Boolean).join('');

  // Generate dynamic custom rendering content based on data payload
  let customHtml = '';
  if (item.customData) {
    const data = item.customData;
    if (data.type === 'ramp-spend') {
      customHtml = `
        <div class="detail-section-label">Spend Metrics &amp; Growth</div>
        <div class="ramp-spend-container">
          <div class="ramp-metric-row">
            <div class="ramp-metric-card">
              <div class="ramp-metric-num">${data.totalSpendGrowth}</div>
              <div class="ramp-metric-label">Spend Growth</div>
            </div>
            <div class="ramp-metric-card">
              <div class="ramp-metric-num">${data.duplicateReduction}</div>
              <div class="ramp-metric-label">Dupes Reduction</div>
            </div>
            <div class="ramp-metric-card">
              <div class="ramp-metric-num">${data.avgSeatPrice}</div>
              <div class="ramp-metric-label">Avg Seat Cost</div>
            </div>
          </div>
          
          <div class="ramp-chart-title">Software Categories Market Share</div>
          ${data.categoryShare.map(cat => `
            <div class="ramp-bar-row">
              <div class="ramp-bar-meta">
                <span class="ramp-bar-label">${escapeHtml(cat.name)}</span>
                <span class="ramp-bar-val">${cat.share}%</span>
              </div>
              <div class="ramp-bar-bg">
                <div class="ramp-bar-fill" style="width: ${cat.share}%"></div>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="detail-section-label">Fastest Growing Tech Vendors</div>
        <div class="newsletter-jobs-list" style="margin-bottom: 20px;">
          ${data.growthVendors.map(vendor => `
            <div class="newsletter-job-item">
              <div class="n-job-title" style="color: var(--pink)">${escapeHtml(vendor.name)}</div>
              <div class="n-job-meta">
                Category: <span style="color: var(--text-dim)">${escapeHtml(vendor.category)}</span> · Growth: <span style="color: var(--green); font-weight: bold;">+${vendor.growth}</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } else if (data.type === 'harmonic-hot25') {
      customHtml = `
        <div class="detail-section-label">Venture Index Metrics</div>
        <div class="ramp-spend-container">
          <div class="ramp-metric-row" style="border: none; padding-bottom: 0;">
            <div class="ramp-metric-card">
              <div class="ramp-metric-num" style="color: var(--cyan)">${data.quarter}</div>
              <div class="ramp-metric-label">Release Batch</div>
            </div>
            <div class="ramp-metric-card">
              <div class="ramp-metric-num" style="color: var(--cyan)">${data.avgGrowthRate}</div>
              <div class="ramp-metric-label">Avg Velocity</div>
            </div>
            <div class="ramp-metric-card">
              <div class="ramp-metric-num" style="color: var(--cyan)">${data.totalFundingRaised}</div>
              <div class="ramp-metric-label">Total Raised</div>
            </div>
          </div>
        </div>

        <div class="detail-section-label">Harmonic Hot 25 Standout Rankings</div>
        <div class="harmonic-hot25-container">
          <table class="harmonic-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Company</th>
                <th>Sector</th>
                <th>Growth Velocity</th>
              </tr>
            </thead>
            <tbody>
              ${data.startups.map(s => `
                <tr>
                  <td class="h-rank">#${s.rank}</td>
                  <td class="h-name">
                    <span style="display: block;">${escapeHtml(s.name)}</span>
                    <a href="https://${s.site}" target="_blank" style="color: var(--cyan); font-size: 8px; text-decoration: none; margin-right: 8px;">${escapeHtml(s.site)} ↗</a>
                    <button class="tracker-add-btn" style="font-size: 8px; padding: 1px 4px; line-height: 1; display: inline-block;" onclick="addStartupToTracker('${escapeHtml(s.name)}', '${escapeHtml(s.site)}', 'Harmonic Q2 2026', '${escapeHtml(s.sector)}')">+ track</button>
                  </td>
                  <td class="h-sector">${escapeHtml(s.sector)}</td>
                  <td class="h-growth">
                    <div class="h-growth-wrap">
                      <span class="h-growth-num">+${s.growth}%</span>
                      <div class="h-progress">
                        <div class="h-progress-fill" style="width: ${Math.min(100, s.growth)}%; background: ${s.growth > 80 ? 'var(--pink)' : (s.growth > 50 ? 'var(--cyan)' : 'var(--green)')}"></div>
                      </div>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (data.type === 'yc-directory') {
      customHtml = `
        <div class="detail-section-label">Batch Aggregate Data</div>
        <div class="ramp-spend-container">
          <div class="ramp-metric-row" style="border: none; padding-bottom: 0;">
            <div class="ramp-metric-card">
              <div class="ramp-metric-num" style="color: var(--green)">${data.batch}</div>
              <div class="ramp-metric-label">YC Batch</div>
            </div>
            <div class="ramp-metric-card">
              <div class="ramp-metric-num" style="color: var(--green)">${data.totalStartups}</div>
              <div class="ramp-metric-label">Total Startups</div>
            </div>
            <div class="ramp-metric-card">
              <div class="ramp-metric-num" style="color: var(--green)">Live</div>
              <div class="ramp-metric-label">Hiring Status</div>
            </div>
          </div>
        </div>

        <div class="detail-section-label">Curated Batch Highlights</div>
        <div class="yc-directory-container">
          ${data.featuredCompanies.map(c => `
            <div class="yc-startup-card">
              <div class="yc-startup-header">
                <span class="yc-startup-name">${escapeHtml(c.name)}</span>
                <span class="yc-startup-stage">${escapeHtml(c.stage)}</span>
              </div>
              <div class="yc-startup-desc">${escapeHtml(c.description)}</div>
              <div class="yc-startup-footer">
                <span class="yc-startup-meta">Sector: <strong style="color: var(--text-dim)">${escapeHtml(c.sector)}</strong> · Size: ${escapeHtml(c.size)}</span>
                <div style="display: flex; gap: 6px; align-items: center;">
                  <button class="tracker-add-btn" style="font-size: 9px; padding: 2px 8px; border: 1px solid var(--green-mid); background: var(--green-dim); color: var(--green);" onclick="addStartupToTracker('${escapeHtml(c.name)}', '${escapeHtml(c.site)}', 'YC ${data.batch}', '${escapeHtml(c.description)}')">Track</button>
                  <a href="https://${c.site}" target="_blank" class="yc-startup-link">Apply ↗</a>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  } else {
    // If it's a Substack RSS feed, we can try to extract structured jobs/pitch lists if possible
    const summaryLower = item.summary.toLowerCase();
    if (summaryLower.includes('role') || summaryLower.includes('advisor') || summaryLower.includes('co-founder') || summaryLower.includes('opportunity')) {
      // Try to parse some jobs out of the HTML content
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = item.summary;
      const listItems = Array.from(tempDiv.querySelectorAll('li')).slice(0, 6);
      if (listItems.length > 0) {
        customHtml = `
          <div class="detail-section-label">Extracted Role Openings / Highlights</div>
          <div class="newsletter-jobs-list">
            ${listItems.map(li => {
              const text = li.textContent.trim();
              let title = text.split('–')[0] || text.split('-')[0] || text;
              let description = text.replace(title, '').replace(/^[–\-:\s]+/, '');
              if (!description) {
                description = 'Open Opportunity. Click source link to apply.';
              }
              return `
                <div class="newsletter-job-item">
                  <div class="n-job-title">${escapeHtml(title.substring(0, 60))}</div>
                  <div class="n-job-meta" style="line-height: 1.4;">
                    ${escapeHtml(description.substring(0, 150))}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }
    }
  }

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
          <div class="label">INDEX SOURCE</div>
          <div class="value" style="color: var(--cyan); font-weight: bold;">${escapeHtml(item.source)}</div>
        </div>
      </div>

      ${customHtml}

      <div class="detail-section-label">Abstract / Overview</div>
      <div class="detail-abstract">${item.summary}</div>

      <div class="action-buttons">
        <a href="${item.link}" target="_blank" class="open-btn">↗ OPEN ORIGINAL RELEASE</a>
        <button class="add-tracker-import-btn" onclick="importStartupToTracker('${escapeHtml(item.title)}', '${item.link}', '${escapeHtml(item.source)}')">✚ ADD ARTICLE TO PIPELINE</button>
        <button class="abs-btn" onclick="shareItem('${escapeHtml(item.title)}')">⎋ SHARE DEAL INTEL</button>
      </div>
    </div>
  `;
}

function shareItem(title) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(`Venture Intel: "${title}"`);
    alert('Venture Intel title copied to clipboard!');
  } else {
    alert(`Deal Intel: "${title}"`);
  }
}

// Category selection
function setCategory(cat, el) {
  activeCategory = cat;
  activeKeyword = null; // reset keyword filter when switching categories
  
  document.querySelectorAll('.sidebar [data-cat]').forEach(e => e.classList.remove('active'));
  document.querySelectorAll('.sidebar [data-kw]').forEach(e => e.classList.remove('active'));
  
  el.classList.add('active');
  
  const label = cat === 'all' ? 'LATEST ENTRIES' : `SOURCE TYPE: ${cat.toUpperCase().replace('-', ' ')}`;
  const titleEl = document.getElementById('feed-title-label');
  if (titleEl) titleEl.textContent = label;
  
  applyFilters();
}

// Keyword selection
function setKeyword(kw, el) {
  if (activeKeyword === kw) {
    activeKeyword = null;
    el.classList.remove('active');
  } else {
    activeKeyword = kw;
    activeCategory = 'all'; // reset category filter
    
    document.querySelectorAll('.sidebar [data-cat]').forEach(e => e.classList.remove('active'));
    document.querySelectorAll('.sidebar [data-kw]').forEach(e => e.classList.remove('active'));
    
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
      const el = document.getElementById('stat-next');
      if (el) el.textContent = `countdown: ${minutes}m ${secs}s`;
    }
  }, 1000);
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  loadTrackerData();
  fetchFeedData(false);
});

// Chart View & Data Controllers
let activeView = 'feed';
let trendChartInstance = null;
let maxTrendChartInstance = null;

const sourcesList = [
  'Ramp Vendor Reports',
  'Harmonic Hot 25',
  'a16z Build',
  'Founders You Should Know',
  'Next Play',
  'YC Startup Directory',
  'Early Days Substack'
];

const sourceChartLabels = {
  'Ramp Vendor Reports': 'Ramp reports',
  'Harmonic Hot 25': 'Harmonic 25',
  'a16z Build': 'a16z Build',
  'Founders You Should Know': 'FYSK Pitches',
  'Next Play': 'Next Play',
  'YC Startup Directory': 'YC batch list',
  'Early Days Substack': 'Early Days Substack'
};

let chartActiveSources = ['a16z Build', 'Next Play', 'Early Days Substack']; // Default active datasets

function switchView(view) {
  activeView = view;
  
  // Containers
  const feedViewWrap = document.getElementById('feed-view-container');
  const chartContainer = document.getElementById('chart-view-container');
  const trackerContainer = document.getElementById('tracker-workspace-container');
  
  // Sidebars
  const discoverySidebar = document.getElementById('sidebar-discovery-views');
  const trackerSidebar = document.getElementById('sidebar-tracker-views');
  
  // Right Sidebar (details)
  const discoveryDetail = document.getElementById('detail-discovery-views');
  const trackerDetail = document.getElementById('detail-tracker-views');
  
  // Tabs
  const feedTabBtn = document.getElementById('tab-btn-feed');
  const chartTabBtn = document.getElementById('tab-btn-chart');
  const trackerTabBtn = document.getElementById('tab-btn-tracker');

  // Reset active tab styles
  [feedTabBtn, chartTabBtn, trackerTabBtn].forEach(btn => {
    if (btn) btn.classList.remove('active');
  });

  if (view === 'feed') {
    if (feedViewWrap) feedViewWrap.style.display = 'block';
    if (chartContainer) chartContainer.style.display = 'none';
    if (trackerContainer) trackerContainer.style.display = 'none';
    
    if (discoverySidebar) discoverySidebar.style.display = 'block';
    if (trackerSidebar) trackerSidebar.style.display = 'none';
    
    if (discoveryDetail) discoveryDetail.style.display = 'flex';
    if (trackerDetail) trackerDetail.style.display = 'none';
    
    if (feedTabBtn) feedTabBtn.classList.add('active');
    
    updateStatsPanel();
  } else if (view === 'chart') {
    if (feedViewWrap) feedViewWrap.style.display = 'none';
    if (chartContainer) chartContainer.style.display = 'flex';
    if (trackerContainer) trackerContainer.style.display = 'none';
    
    if (discoverySidebar) discoverySidebar.style.display = 'block';
    if (trackerSidebar) trackerSidebar.style.display = 'none';
    
    if (discoveryDetail) discoveryDetail.style.display = 'flex';
    if (trackerDetail) trackerDetail.style.display = 'none';
    
    if (chartTabBtn) chartTabBtn.classList.add('active');
    renderTrendChart();
  } else if (view === 'tracker') {
    if (feedViewWrap) feedViewWrap.style.display = 'none';
    if (chartContainer) chartContainer.style.display = 'none';
    if (trackerContainer) trackerContainer.style.display = 'flex';
    
    if (discoverySidebar) discoverySidebar.style.display = 'none';
    if (trackerSidebar) trackerSidebar.style.display = 'block';
    
    if (discoveryDetail) discoveryDetail.style.display = 'none';
    if (trackerDetail) trackerDetail.style.display = 'block';
    
    if (trackerTabBtn) trackerTabBtn.classList.add('active');
    
    renderTrackerList();
    renderTrackerWorkspace();
    updateTrackerStats();
    
    // Update stats bar active filter
    document.getElementById('stat-filter').textContent = 'PSYCHO JOB PIPELINE';
    document.getElementById('stat-filtered').textContent = `Tracking ${trackedStartups.length} startups`;
  }
}

function getMonday(d) {
  d = new Date(d);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
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
    const monKey = mon.toISOString().split('T')[0];

    if (!weeksMap[monKey]) {
      weeksMap[monKey] = {
        date: mon,
        counts: {}
      };
      sourcesList.forEach(s => {
        weeksMap[monKey].counts[s] = 0;
      });
    }

    if (weeksMap[monKey].counts[item.source] !== undefined) {
      weeksMap[monKey].counts[item.source]++;
    }
  });

  const sortedWeekKeys = Object.keys(weeksMap).sort();
  
  const labels = sortedWeekKeys.map(k => {
    const d = weeksMap[k].date;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  });

  const datasets = {};
  sourcesList.forEach(s => {
    datasets[s] = [];
  });

  sortedWeekKeys.forEach(k => {
    const counts = weeksMap[k].counts;
    sourcesList.forEach(s => {
      datasets[s].push(counts[s]);
    });
  });

  return { labels, datasets };
}

function renderCustomLegendPills() {
  const containers = [
    document.getElementById('chart-legend-pills'),
    document.getElementById('modal-chart-legend-pills')
  ];

  containers.forEach(container => {
    if (!container) return;

    const pillsHtml = sourcesList.map(s => {
      const isActive = chartActiveSources.includes(s);
      const label = sourceChartLabels[s];
      let accentClass = '';
      if (s.includes('Ramp')) accentClass = 'ramp';
      else if (s.includes('Harmonic')) accentClass = 'harmonic';
      else if (s.includes('YC')) accentClass = 'yc';
      else accentClass = 'substack';

      return `
        <button class="legend-pill ${accentClass} ${isActive ? 'active' : ''}" 
                onclick="toggleSourceDataset('${s}')">
          ${isActive ? '●' : '○'} ${label}
        </button>
      `;
    }).join('');

    container.innerHTML = pillsHtml;
  });
}

function toggleSourceDataset(s) {
  const index = chartActiveSources.indexOf(s);
  if (index > -1) {
    if (chartActiveSources.length > 1) {
      chartActiveSources.splice(index, 1);
    }
  } else {
    chartActiveSources.push(s);
  }
  
  renderCustomLegendPills();
  renderTrendChart();
  
  if (document.getElementById('chart-modal').style.display !== 'none') {
    renderMaximizedTrendChart();
  }
}

function renderTrendChart() {
  const canvas = document.getElementById('trendChart');
  if (!canvas) return;

  const { labels, datasets } = generateChartData();

  if (trendChartInstance) {
    trendChartInstance.destroy();
  }

  renderCustomLegendPills();

  const datasetColors = {
    'Ramp Vendor Reports': '#ff2e93',
    'Harmonic Hot 25': '#00f0ff',
    'a16z Build': '#bd59ff',
    'Founders You Should Know': '#0088ff',
    'Next Play': '#ffe600',
    'YC Startup Directory': '#00e5a0',
    'Early Days Substack': '#bd59ff'
  };

  const chartDatasets = chartActiveSources.map(s => {
    return {
      label: sourceChartLabels[s],
      data: datasets[s] || [],
      borderColor: datasetColors[s],
      backgroundColor: datasetColors[s] + '15',
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
        legend: { display: false },
        tooltip: {
          backgroundColor: '#05070a',
          titleColor: '#00f0ff',
          bodyColor: '#e1e7f0',
          titleFont: { family: 'IBM Plex Mono' },
          bodyFont: { family: 'IBM Plex Mono' },
          borderColor: '#1a2233',
          borderWidth: 1
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(0, 240, 255, 0.1)' },
          ticks: {
            color: '#8fa2bd',
            font: { family: 'IBM Plex Mono', size: 9 }
          }
        },
        y: {
          grid: { color: 'rgba(0, 240, 255, 0.1)' },
          ticks: {
            color: '#8fa2bd',
            precision: 0,
            font: { family: 'IBM Plex Mono', size: 9 }
          }
        }
      }
    }
  });
}

function renderMaximizedTrendChart() {
  const canvas = document.getElementById('maxTrendChart');
  if (!canvas) return;

  const { labels, datasets } = generateChartData();

  if (maxTrendChartInstance) {
    maxTrendChartInstance.destroy();
  }

  const datasetColors = {
    'Ramp Vendor Reports': '#ff2e93',
    'Harmonic Hot 25': '#00f0ff',
    'a16z Build': '#bd59ff',
    'Founders You Should Know': '#0088ff',
    'Next Play': '#ffe600',
    'YC Startup Directory': '#00e5a0',
    'Early Days Substack': '#bd59ff'
  };

  const chartDatasets = chartActiveSources.map(s => {
    return {
      label: sourceChartLabels[s],
      data: datasets[s] || [],
      borderColor: datasetColors[s],
      backgroundColor: datasetColors[s] + '10',
      borderWidth: 3,
      tension: 0.35,
      pointRadius: 5,
      pointHoverRadius: 8,
      fill: false
    };
  });

  maxTrendChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: chartDatasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#05070a',
          titleColor: '#00f0ff',
          bodyColor: '#e1e7f0',
          titleFont: { family: 'IBM Plex Mono', size: 11 },
          bodyFont: { family: 'IBM Plex Mono', size: 11 },
          borderColor: '#1a2233',
          borderWidth: 1
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(0, 240, 255, 0.1)' },
          ticks: {
            color: '#8fa2bd',
            font: { family: 'IBM Plex Mono', size: 10 }
          }
        },
        y: {
          grid: { color: 'rgba(0, 240, 255, 0.1)' },
          ticks: {
            color: '#8fa2bd',
            precision: 0,
            font: { family: 'IBM Plex Mono', size: 10 }
          }
        }
      }
    }
  });
}

function toggleMaximizeChart(isOpen) {
  const modal = document.getElementById('chart-modal');
  if (!modal) return;

  if (isOpen) {
    modal.style.display = 'flex';
    renderCustomLegendPills();
    renderMaximizedTrendChart();
  } else {
    modal.style.display = 'none';
    if (maxTrendChartInstance) {
      maxTrendChartInstance.destroy();
      maxTrendChartInstance = null;
    }
  }
}

function setTimeWindow(val) {
  activeTimeWindow = val;
  applyFilters();
}

// ==========================================
// PSYCHO JOB TRACKER ENGINE
// ==========================================

let trackedStartups = [];
let selectedTrackedId = null;

function loadTrackerData() {
  const saved = localStorage.getItem('psycho_job_tracker_data');
  if (saved) {
    try {
      trackedStartups = JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse tracker data:', e);
      trackedStartups = [];
    }
  } else {
    // Seed default mock startups to look premium and guide the user
    trackedStartups = [
      {
        id: 'mock-1',
        name: 'Figure',
        website: 'figure.ai',
        source: 'Harmonic Hot 25',
        desc: 'Building next-generation autonomous humanoid robots for manufacturing, logistics, and retail applications.',
        founderTwitter: 'adcock_brett',
        founderEmail: 'brett@figure.ai',
        followedFounders: true,
        followedTeam: true,
        hasOSCodebase: false,
        deepResearchCompleted: true,
        researchNotes: 'Spotted on Harmonic Hot 25 index with a headcount growth rate of +45% in Q2 2026. Brett Adcock is the founder. They have a closed codebase, but they release regular demo videos. Focus on observing control issues and bipedal mechanics in their demo logs.',
        interactionNotes: 'Replied to Brett Adcock\'s tweet about bimanual dexterity: suggested an approach to reinforcement learning policies for peg-in-hole insertion. Received a like from He He (Core Roboticist).',
        valueDocLink: 'https://notion.so/figure-humanoid-manipulation-pitch',
        pitchStatus: 'interviewing',
        reachoutDMDate: '2026-07-12',
        reachoutDone: true
      },
      {
        id: 'mock-2',
        name: 'Physical Intelligence',
        website: 'physicalintelligence.company',
        source: 'Harmonic Hot 25',
        desc: 'Developing general-purpose artificial intelligence and foundation models to control robotic hardware.',
        founderTwitter: 'karol_hausman',
        founderEmail: 'contact@pi.co',
        followedFounders: true,
        followedTeam: false,
        hasOSCodebase: false,
        deepResearchCompleted: false,
        researchNotes: 'Harmonic rank #2, Series A ($70M). Sourcing team members from followers list of @Physical_Intel.',
        interactionNotes: 'Asked Karol Hausman a question regarding zero-shot cross-embodiment policies on Twitter. Awaiting response.',
        valueDocLink: '',
        pitchStatus: 'drafting',
        reachoutDMDate: '',
        reachoutDone: false
      }
    ];
    saveTrackerData();
  }
}

function saveTrackerData() {
  localStorage.setItem('psycho_job_tracker_data', JSON.stringify(trackedStartups));
  updateTrackerStats();
}

function updateTrackerStats() {
  const total = trackedStartups.length;
  
  const followedCount = trackedStartups.filter(s => s.followedFounders).length;
  const osCount = trackedStartups.filter(s => s.hasOSCodebase).length;
  const pitchedCount = trackedStartups.filter(s => s.pitchStatus !== 'not-pitching' && s.pitchStatus !== 'drafting').length;

  const totalEl = document.getElementById('tracker-stat-total');
  const followedEl = document.getElementById('tracker-stat-followed');
  const osEl = document.getElementById('tracker-stat-os');
  const pitchedEl = document.getElementById('tracker-stat-pitched');

  if (totalEl) totalEl.textContent = total;
  if (followedEl) followedEl.textContent = `${followedCount} / ${total}`;
  if (osEl) osEl.textContent = `${osCount} / ${total}`;
  if (pitchedEl) pitchedEl.textContent = `${pitchedCount} / ${total}`;
}

function addStartupToTracker(name, website, source, desc = '') {
  // Check duplicate
  const exists = trackedStartups.find(s => s.name.toLowerCase() === name.toLowerCase());
  if (exists) {
    alert(`"${name}" is already in your Job Tracker!`);
    selectedTrackedId = exists.id;
    switchView('tracker');
    return;
  }

  const newStartup = {
    id: 'startup-' + Date.now(),
    name: name,
    website: website || '',
    source: source || 'Self-Found',
    desc: desc || '',
    founderTwitter: '',
    founderEmail: '',
    followedFounders: false,
    followedTeam: false,
    hasOSCodebase: false,
    deepResearchCompleted: false,
    researchNotes: '',
    interactionNotes: '',
    valueDocLink: '',
    pitchStatus: 'not-pitching',
    reachoutDMDate: '',
    reachoutDone: false
  };

  trackedStartups.push(newStartup);
  saveTrackerData();
  selectedTrackedId = newStartup.id;
  renderTrackerList();
  renderTrackerWorkspace();
  
  alert(`"${name}" has been added to your Psycho Job Tracker targets!`);
  switchView('tracker');
}

function importStartupToTracker(title, link, source) {
  let name = title;
  let website = '';
  
  const cleanTitle = title.toLowerCase();
  if (cleanTitle.includes('ramp saas spend report')) {
    name = 'Ramp';
    website = 'ramp.com';
  } else if (cleanTitle.includes('ramp monthly vendor report')) {
    name = 'Ramp';
    website = 'ramp.com';
  } else {
    // Strip prefixes
    name = title.replace(/^yc\s+[ws]\d+\s+batch:\s*/i, '')
                .replace(/^harmonic\s+hot\s+25:\s*/i, '')
                .replace(/top breakout.*/i, '')
                .trim();
  }

  addStartupToTracker(name, website, source, title);
}

function deleteStartupFromTracker(id) {
  if (confirm('Are you sure you want to remove this startup from your tracking pipeline?')) {
    trackedStartups = trackedStartups.filter(s => s.id !== id);
    saveTrackerData();
    if (selectedTrackedId === id) {
      selectedTrackedId = trackedStartups.length > 0 ? trackedStartups[0].id : null;
    }
    renderTrackerList();
    renderTrackerWorkspace();
  }
}

function updateStartupField(id, field, value) {
  const startup = trackedStartups.find(s => s.id === id);
  if (startup) {
    startup[field] = value;
    saveTrackerData();
    
    if (field === 'name' || field === 'pitchStatus' || field === 'website') {
      renderTrackerList();
    }
  }
}

function renderTrackerList() {
  const container = document.getElementById('tracker-list-container');
  if (!container) return;

  if (trackedStartups.length === 0) {
    container.innerHTML = `
      <div class="no-results" style="border: none; padding: 30px 10px; font-size: 10px;">
        NO TARGETS TRACKED.<br>ADD ONE MANUALLY OR FROM THE FEEDS ABOVE.
      </div>
    `;
    return;
  }

  const html = trackedStartups.map(startup => {
    const isSelected = startup.id === selectedTrackedId;
    let statusClass = 'badge-not-pitching';
    let statusLabel = 'Discovery';
    
    if (startup.pitchStatus === 'drafting') { statusClass = 'badge-drafting'; statusLabel = 'Drafting'; }
    else if (startup.pitchStatus === 'pitched') { statusClass = 'badge-pitched'; statusLabel = 'Pitched'; }
    else if (startup.pitchStatus === 'interviewing') { statusClass = 'badge-interviewing'; statusLabel = 'Interview'; }
    else if (startup.pitchStatus === 'offer') { statusClass = 'badge-offer'; statusLabel = 'Offer'; }
    else if (startup.pitchStatus === 'archived') { statusClass = 'badge-archived'; statusLabel = 'Archived'; }

    return `
      <div class="tracker-item-card ${isSelected ? 'selected' : ''}" onclick="selectTrackedStartup('${startup.id}')">
        <div class="tracker-item-name">${escapeHtml(startup.name)}</div>
        <div class="tracker-item-meta">
          <span>${escapeHtml(startup.website || 'no site')}</span>
          <span class="tracker-status-badge ${statusClass}">${statusLabel}</span>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

function selectTrackedStartup(id) {
  selectedTrackedId = id;
  renderTrackerList();
  renderTrackerWorkspace();
}

function renderTrackerWorkspace() {
  const container = document.getElementById('tracker-workspace-content');
  if (!container) return;

  const startup = trackedStartups.find(s => s.id === selectedTrackedId);
  if (!startup) {
    container.innerHTML = `
      <div class="tracker-workspace-empty">
        <div class="detail-empty-icon" style="width: 60px; height: 60px;">
          <svg width="24" height="24" viewBox="0 0 20 20" fill="none">
            <rect x="3" y="3" width="14" height="16" rx="2" stroke="#536b8c" stroke-width="1.2"/>
            <path d="M6 7h8M6 10h8M6 13h5" stroke="#536b8c" stroke-width="1.2" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="detail-empty-text" style="font-size: 11px; letter-spacing: 0.1em; line-height: 1.8;">
          SELECT A TARGET STARTUP FROM THE LEFT PANEL<br>OR ADD A NEW ONE TO INITIATE RECONNAISSANCE.
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="tracker-workspace-panel">
      <!-- Section 1: Basic Recon -->
      <div class="tracker-section">
        <div class="tracker-section-title">
          <span>Step 1 &amp; 2: Basic Intelligence &amp; Digital Recon</span>
          <span style="font-size: 8px; color: var(--text-muted); font-weight: normal;">Source: ${escapeHtml(startup.source)}</span>
        </div>
        <div class="tracker-form-grid">
          <div class="tracker-form-group">
            <label class="tracker-label">Company Name</label>
            <input type="text" class="tracker-input" value="${escapeHtml(startup.name)}" oninput="updateStartupField('${startup.id}', 'name', this.value)">
          </div>
          <div class="tracker-form-group">
            <label class="tracker-label">Website Domain</label>
            <input type="text" class="tracker-input" value="${escapeHtml(startup.website)}" placeholder="e.g. figure.ai" oninput="updateStartupField('${startup.id}', 'website', this.value)">
          </div>
          <div class="tracker-form-group">
            <label class="tracker-label">Founder Twitter / X handles</label>
            <input type="text" class="tracker-input" value="${escapeHtml(startup.founderTwitter)}" placeholder="e.g. adcock_brett, karol_hausman" oninput="updateStartupField('${startup.id}', 'founderTwitter', this.value)">
          </div>
          <div class="tracker-form-group">
            <label class="tracker-label">Founders' Emails</label>
            <input type="text" class="tracker-input" value="${escapeHtml(startup.founderEmail)}" placeholder="e.g. brett@figure.ai" oninput="updateStartupField('${startup.id}', 'founderEmail', this.value)">
          </div>
          <div class="tracker-form-group full-width">
            <label class="tracker-label">Brief Description / Mission</label>
            <textarea class="tracker-textarea" oninput="updateStartupField('${startup.id}', 'desc', this.value)">${escapeHtml(startup.desc)}</textarea>
          </div>
          <div class="tracker-form-group full-width">
            <label class="tracker-label">Digital Footprint Progress Check</label>
            <div class="tracker-checkbox-list">
              <label class="tracker-checkbox-row">
                <input type="checkbox" ${startup.followedFounders ? 'checked' : ''} onchange="updateStartupField('${startup.id}', 'followedFounders', this.checked)">
                <span>Followed Founders on Twitter/X (Essential)</span>
              </label>
              <label class="tracker-checkbox-row">
                <input type="checkbox" ${startup.followedTeam ? 'checked' : ''} onchange="updateStartupField('${startup.id}', 'followedTeam', this.checked)">
                <span>Followed Core Team / Engineers (from company follower list)</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- Section 2: Codebase & Research -->
      <div class="tracker-section">
        <div class="tracker-section-title">Step 3: Rawdogg &amp; Deep Research</div>
        <div class="tracker-checkbox-list" style="margin-bottom: 14px;">
          <label class="tracker-checkbox-row">
            <input type="checkbox" ${startup.hasOSCodebase ? 'checked' : ''} onchange="updateStartupField('${startup.id}', 'hasOSCodebase', this.checked)">
            <span style="color: var(--green); font-weight: bold;">★ OPEN SOURCE CODEBASE FOUND (JACKPOT!)</span>
          </label>
          <label class="tracker-checkbox-row">
            <input type="checkbox" ${startup.deepResearchCompleted ? 'checked' : ''} onchange="updateStartupField('${startup.id}', 'deepResearchCompleted', this.checked)">
            <span>Deep Research Phase Completed</span>
          </label>
        </div>
        <div class="tracker-form-group">
          <label class="tracker-label">Reconnaissance Notes (Problems faced, tech stack, codebase insights)</label>
          <textarea class="tracker-textarea" style="min-height: 100px;" placeholder="What software do they use? What issues are they running into? How can you help?" oninput="updateStartupField('${startup.id}', 'researchNotes', this.value)">${escapeHtml(startup.researchNotes)}</textarea>
        </div>
      </div>

      <!-- Section 3: Value Pitching -->
      <div class="tracker-section">
        <div class="tracker-section-title">Step 4 &amp; 5: Value Pitching &amp; Outreach</div>
        <div class="tracker-form-grid">
          <div class="tracker-form-group">
            <label class="tracker-label">Pipeline Status</label>
            <select class="tracker-select" onchange="updateStartupField('${startup.id}', 'pitchStatus', this.value)">
              <option value="not-pitching" ${startup.pitchStatus === 'not-pitching' ? 'selected' : ''}>Not Pitching (Researching)</option>
              <option value="drafting" ${startup.pitchStatus === 'drafting' ? 'selected' : ''}>Drafting Value Document</option>
              <option value="pitched" ${startup.pitchStatus === 'pitched' ? 'selected' : ''}>Value Pitch Sent</option>
              <option value="interviewing" ${startup.pitchStatus === 'interviewing' ? 'selected' : ''}>Interviewing / In Conversations</option>
              <option value="offer" ${startup.pitchStatus === 'offer' ? 'selected' : ''}>Offer Received</option>
              <option value="archived" ${startup.pitchStatus === 'archived' ? 'selected' : ''}>Archived / Postponed</option>
            </select>
          </div>
          <div class="tracker-form-group">
            <label class="tracker-label">Value Document / Pitch Link (Notion/GitHub)</label>
            <input type="text" class="tracker-input" value="${escapeHtml(startup.valueDocLink)}" placeholder="e.g. https://notion.so/my-value-deck" oninput="updateStartupField('${startup.id}', 'valueDocLink', this.value)">
          </div>
          <div class="tracker-form-group full-width">
            <label class="tracker-label">Interaction Log (Comments, suggestions, question threads)</label>
            <textarea class="tracker-textarea" placeholder="List dates and summaries of comments, ideas suggested, and cold emails sent..." oninput="updateStartupField('${startup.id}', 'interactionNotes', this.value)">${escapeHtml(startup.interactionNotes)}</textarea>
          </div>
          <div class="tracker-form-group">
            <label class="tracker-label">Reachout Date</label>
            <input type="date" class="tracker-input" value="${escapeHtml(startup.reachoutDMDate)}" onchange="updateStartupField('${startup.id}', 'reachoutDMDate', this.value)">
          </div>
          <div class="tracker-form-group" style="justify-content: center;">
            <label class="tracker-checkbox-row" style="margin-top: 15px;">
              <input type="checkbox" ${startup.reachoutDone ? 'checked' : ''} onchange="updateStartupField('${startup.id}', 'reachoutDone', this.checked)">
              <span>Out-of-band DM/Email Pitch Completed</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="tracker-row-actions">
        <button class="tracker-btn-danger" onclick="deleteStartupFromTracker('${startup.id}')">REMOVE TARGET</button>
        <button class="tracker-btn-save" onclick="alert('All changes saved! LocalStorage sync active.')">FORCE SYNC STATUS</button>
      </div>
    </div>
  `;
}

// Modal Toggle Handlers
function toggleAddModal(isOpen) {
  const modal = document.getElementById('tracker-add-modal');
  if (!modal) return;
  modal.style.display = isOpen ? 'flex' : 'none';
  
  if (isOpen) {
    document.getElementById('modal-add-name').value = '';
    document.getElementById('modal-add-site').value = '';
    document.getElementById('modal-add-source').value = 'Self-Found';
    document.getElementById('modal-add-desc').value = '';
  }
}

function saveNewStartupFromModal() {
  const name = document.getElementById('modal-add-name').value.trim();
  const site = document.getElementById('modal-add-site').value.trim();
  const source = document.getElementById('modal-add-source').value.trim();
  const desc = document.getElementById('modal-add-desc').value.trim();

  if (!name) {
    alert('Please enter a company name.');
    return;
  }

  addStartupToTracker(name, site, source, desc);
  toggleAddModal(false);
}
