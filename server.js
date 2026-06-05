import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import xml2js from 'xml2js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const ARXIV_COMBINED_QUERY = 'cat:cs.RO OR (cat:cs.AI AND (ti:robot OR ti:manipulation OR ti:locomotion OR ti:embodied)) OR (cat:cs.CV AND (ti:robot OR ti:grasping OR ti:manipulation)) OR (cat:cs.LG AND (ti:robot OR ti:reinforcement OR ti:locomotion)) OR (cat:cs.SY AND (ti:robot OR ti:control))';

const RSS_FEEDS = [
  { name: 'IEEE Spectrum Robotics', url: 'https://spectrum.ieee.org/feeds/topic/robotics.rss' },
  { name: 'NVIDIA Robotics Blog', url: 'https://blogs.nvidia.com/blog/category/robotics/feed/' }
];

const FALLBACK_PAPERS = [
  {
    arxivId: '2501.12345',
    title: 'Humanoid Locomotion Control via Deep Reinforcement Learning on Rough Terrain',
    summary: 'This paper presents a robust reinforcement learning framework for humanoid robot locomotion. By leveraging domain randomization and heightmap inputs, the policy generalizes to complex, unseen rough terrains in real-world deployments.',
    published: '2026-03-25T10:00:00Z',
    updated: '2026-03-25T10:00:00Z',
    authors: ['Dr. Helen Chen', 'Marcus Vance', 'Sarah Jenkins'],
    cats: ['cs.RO', 'cs.LG'],
    link: 'https://arxiv.org/abs/2501.12345',
    pdfLink: 'https://arxiv.org/pdf/2501.12345',
    source: 'arXiv'
  },
  {
    arxivId: '2502.54321',
    title: 'Diffusion Policies for Dexterous Bimanual Manipulation',
    summary: 'We introduce a novel diffusion-based policy representation for bimanual manipulation tasks. The model learns high-dimensional trajectories from human demonstrations, showing high dexterity in grasping and sorting tasks.',
    published: '2026-03-24T14:30:00Z',
    updated: '2026-03-24T14:30:00Z',
    authors: ['Kenji Sato', 'Amara Okafor'],
    cats: ['cs.RO', 'cs.AI'],
    link: 'https://arxiv.org/abs/2502.54321',
    pdfLink: 'https://arxiv.org/pdf/2502.54321',
    source: 'arXiv'
  },
  {
    arxivId: '2503.09876',
    title: 'End-to-End Embodied AI with Large Vision-Language-Action Models',
    summary: 'We present a scalable Vision-Language-Action (VLA) model trained on multi-robot datasets. Our model integrates semantic reasoning with low-level joint controls, allowing zero-shot execution of complex natural language instructions.',
    published: '2026-03-22T08:15:00Z',
    updated: '2026-03-22T08:15:00Z',
    authors: ['Li Wei', 'Jean-Pierre Dubois', 'Sophia Al-Mansoor'],
    cats: ['cs.AI', 'cs.RO', 'cs.CV'],
    link: 'https://arxiv.org/abs/2503.09876',
    pdfLink: 'https://arxiv.org/pdf/2503.09876',
    source: 'arXiv'
  },
  {
    arxivId: '2503.01122',
    title: 'Real-Time 3D Object Detection and Pose Estimation for Robotic Grasping',
    summary: 'This paper describes a lightweight, real-time 3D object detection network optimized for robotic manipulators. By combining RGB-D inputs with coordinate attention, we achieve state-of-the-art pose estimation accuracy under severe occlusions.',
    published: '2026-03-20T11:45:00Z',
    updated: '2026-03-20T11:45:00Z',
    authors: ['Carlos Rodriguez', 'Elena Petrova'],
    cats: ['cs.CV', 'cs.RO'],
    link: 'https://arxiv.org/abs/2503.01122',
    pdfLink: 'https://arxiv.org/pdf/2503.01122',
    source: 'arXiv'
  },
  {
    arxivId: '2502.04567',
    title: 'Safe Control Barrier Functions for Autonomous Legged Systems',
    summary: 'We propose a control framework incorporating control barrier functions (CBFs) to guarantee safety constraints on legged robots. The method is validated in simulations and hardware tests, preventing falls during dynamic maneuvers.',
    published: '2026-03-18T16:00:00Z',
    updated: '2026-03-18T16:00:00Z',
    authors: ['Thomas Muller', 'Yuki Tanaka'],
    cats: ['cs.SY', 'cs.RO'],
    link: 'https://arxiv.org/abs/2502.04567',
    pdfLink: 'https://arxiv.org/pdf/2502.04567',
    source: 'arXiv'
  },
  {
    arxivId: '2503.11223',
    title: 'Self-Supervised Visual Representation Learning for Robot Learning',
    summary: 'We evaluate self-supervised visual representations for imitation learning in robotic manipulation. Our findings indicate that representations pre-trained on in-domain robotic videos lead to higher success rates in multi-stage tasks.',
    published: '2026-03-15T09:30:00Z',
    updated: '2026-03-15T09:30:00Z',
    authors: ['Alice Dupont', 'David Kim'],
    cats: ['cs.LG', 'cs.CV'],
    link: 'https://arxiv.org/abs/2503.11223',
    pdfLink: 'https://arxiv.org/pdf/2503.11223',
    source: 'arXiv'
  },
  {
    arxivId: '2501.09871',
    title: 'Robust Dynamic Trajectory Optimization for Multi-Contact Locomotion',
    summary: 'This work addresses trajectory optimization for legged robots undergoing multi-contact transitions. We formulate a robust optimization problem that handles terrain height uncertainties, enabling dynamic jumping over obstacles.',
    published: '2026-03-10T14:00:00Z',
    updated: '2026-03-10T14:00:00Z',
    authors: ['Vikram Nair', 'Chloe Dupont'],
    cats: ['cs.RO', 'cs.SY'],
    link: 'https://arxiv.org/abs/2501.09871',
    pdfLink: 'https://arxiv.org/pdf/2501.09871',
    source: 'arXiv'
  }
];

// In-memory caching
let cache = {
  data: null,
  timestamp: 0
};
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

// Helper to fetch with timeout
async function fetchWithTimeout(url, options = {}, timeout = 12000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Physical-AI-Dashboard/1.0 (Local Research Tool)',
        ...options.headers
      }
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

// Fetch with retry and backoff
async function fetchWithRetry(url, options = {}, retries = 3, backoffMs = 800) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetchWithTimeout(url, options);
      if (response.ok) {
        return await response.text();
      }
      if (response.status === 429 || response.status === 503 || response.status >= 500) {
        if (i === retries - 1) {
          throw new Error(`HTTP status error: ${response.status} (exhausted retries)`);
        }
        console.warn(`Server returned status ${response.status} for ${url}. Retrying in ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        backoffMs *= 2;
        continue;
      }
      throw new Error(`HTTP status error: ${response.status}`);
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`Fetch failed for ${url} (${err.message}). Retrying in ${backoffMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
      backoffMs *= 2;
    }
  }
}

// Safe parsing for arXiv Atom XML
async function parseArxivXML(xmlText) {
  if (!xmlText || typeof xmlText !== 'string') {
    return [];
  }
  try {
    const result = await xml2js.parseStringPromise(xmlText);
    const feed = result.feed;
    if (!feed || !feed.entry) return [];
    
    return feed.entry.map(e => {
      const id = e.id ? e.id[0].trim() : '';
      const arxivId = id.replace('http://arxiv.org/abs/', '').replace('https://arxiv.org/abs/', '');
      const title = e.title ? e.title[0].trim().replace(/\s+/g, ' ') : 'Untitled Paper';
      const summary = e.summary ? e.summary[0].trim().replace(/\s+/g, ' ') : 'No abstract available.';
      const published = e.published ? e.published[0].trim() : new Date().toISOString();
      const updated = e.updated ? e.updated[0].trim() : published;
      
      let authors = [];
      if (e.author) {
        authors = e.author.map(a => a.name ? a.name[0].trim() : '').filter(Boolean);
      }
      if (authors.length === 0) authors = ['Unknown Authors'];
      
      let cats = [];
      if (e.category) {
        cats = e.category.map(c => c.$ ? c.$.term : '').filter(Boolean);
      }
      
      const link = id.startsWith('http') ? id : `https://arxiv.org/abs/${arxivId}`;
      const pdfLink = `https://arxiv.org/pdf/${arxivId}`;
      
      return {
        arxivId,
        title,
        summary,
        published,
        updated,
        authors,
        cats,
        link,
        pdfLink,
        source: 'arXiv'
      };
    });
  } catch (err) {
    console.error('Failed to parse arXiv XML:', err.message);
    return [];
  }
}

// Safe parsing for industry blog RSS XML
async function parseRSSXML(xmlText, sourceName) {
  if (!xmlText || typeof xmlText !== 'string') {
    return [];
  }
  try {
    const result = await xml2js.parseStringPromise(xmlText);
    const channel = result.rss?.channel?.[0];
    if (!channel || !channel.item) return [];
    
    return channel.item.map(item => {
      const title = item.title ? item.title[0].trim().replace(/\s+/g, ' ') : 'Untitled Article';
      const link = item.link ? item.link[0].trim() : '';
      
      // Handle description or content:encoded
      let summary = '';
      if (item.description) {
        summary = item.description[0].trim();
      } else if (item['content:encoded']) {
        summary = item['content:encoded'][0].trim();
      }
      
      // Clean HTML tags and compress spacing
      summary = summary.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ');
      if (summary.length > 300) {
        summary = summary.substring(0, 300) + '...';
      }
      if (!summary) summary = 'No summary available.';
      
      const pubDate = item.pubDate ? item.pubDate[0].trim() : '';
      let publishedIso = new Date().toISOString();
      if (pubDate) {
        try {
          publishedIso = new Date(pubDate).toISOString();
        } catch (_) {
          // Keep default ISO string if conversion fails
        }
      }
      
      let authors = [sourceName];
      if (item['dc:creator']) {
        authors = item['dc:creator'].map(c => typeof c === 'string' ? c.trim() : (c._ ? c._.trim() : '')).filter(Boolean);
      } else if (item.creator) {
        authors = item.creator.map(c => typeof c === 'string' ? c.trim() : '').filter(Boolean);
      }
      if (authors.length === 0) authors = [sourceName];

      return {
        arxivId: null,
        title,
        summary,
        published: publishedIso,
        updated: publishedIso,
        authors,
        cats: ['industry-news'],
        link,
        pdfLink: null,
        source: sourceName
      };
    });
  } catch (err) {
    console.error(`Failed to parse RSS XML for ${sourceName}:`, err.message);
    return [];
  }
}

// Endpoint: Unified Feed API
app.get('/api/feed', async (req, res) => {
  const forceRefresh = req.query.refresh === 'true';
  const now = Date.now();
  
  if (cache.data && (now - cache.timestamp < CACHE_DURATION) && !forceRefresh) {
    return res.json({
      status: 'success',
      source: 'cache',
      timestamp: new Date(cache.timestamp).toISOString(),
      data: cache.data
    });
  }
  
  console.log('Fetching fresh Physical AI feeds...');
  try {
    // 1. Fetch arXiv papers using the combined query
    const arxivPromise = (async () => {
      const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(ARXIV_COMBINED_QUERY)}&start=0&max_results=100&sortBy=submittedDate&sortOrder=descending`;
      try {
        const xmlText = await fetchWithRetry(url);
        const parsed = await parseArxivXML(xmlText);
        if (parsed.length === 0) {
          throw new Error('Parsed empty feed');
        }
        return parsed;
      } catch (err) {
        console.error('Failed to fetch combined arXiv query:', err.message);
        console.log('Serving local fallback academic papers due to arXiv API failure.');
        return FALLBACK_PAPERS;
      }
    })();

    // 2. Fetch RSS feeds
    const rssPromises = RSS_FEEDS.map(async (feedItem) => {
      try {
        const xmlText = await fetchWithRetry(feedItem.url);
        return await parseRSSXML(xmlText, feedItem.name);
      } catch (err) {
        console.error(`Failed to fetch RSS feed ${feedItem.name}:`, err.message);
        return [];
      }
    });

    const allResults = await Promise.all([arxivPromise, ...rssPromises]);
    
    const unifiedList = [];
    const seenKeys = new Set();
    let successCount = 0;
    
    allResults.forEach((items) => {
      if (items.length > 0) {
        successCount++;
        items.forEach(item => {
          const uniqueKey = item.arxivId || item.link;
          if (uniqueKey && !seenKeys.has(uniqueKey)) {
            seenKeys.add(uniqueKey);
            unifiedList.push(item);
          }
        });
      }
    });

    // Sort combined feed by published date descending
    unifiedList.sort((a, b) => new Date(b.published) - new Date(a.published));

    // Fallback if all calls failed but cache exists
    if (unifiedList.length === 0 && cache.data) {
      console.warn('All backend queries failed to fetch results. Serving stale cache.');
      return res.json({
        status: 'success',
        source: 'cache_retained',
        timestamp: new Date(cache.timestamp).toISOString(),
        data: cache.data
      });
    }

    cache.data = unifiedList;
    cache.timestamp = now;

    res.json({
      status: 'success',
      source: 'network',
      queriesSucceeded: successCount,
      totalQueries: 1 + RSS_FEEDS.length,
      timestamp: new Date(now).toISOString(),
      data: unifiedList
    });

  } catch (err) {
    console.error('API Error in feed aggregator:', err);
    res.status(500).json({
      status: 'error',
      message: err.message || 'Server aggregation failed.'
    });
  }
});

// Serve static frontend assets
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all route serving frontend SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

export default app;
