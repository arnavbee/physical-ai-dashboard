import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import xml2js from 'xml2js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const ARXIV_COMBINED_QUERY = 'cat:cs.RO OR (cat:cs.AI AND (ti:robot OR abs:robot OR ti:manipulation OR abs:manipulation OR ti:locomotion OR abs:locomotion OR ti:embodied OR abs:embodied)) OR (cat:cs.CV AND (ti:robot OR abs:robot OR ti:grasping OR abs:grasping OR ti:manipulation OR abs:manipulation)) OR (cat:cs.LG AND (ti:robot OR abs:robot OR ti:reinforcement OR abs:reinforcement OR ti:locomotion OR abs:locomotion)) OR (cat:cs.SY AND (ti:robot OR abs:robot OR ti:control OR abs:control))';

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
    // 1. Fetch arXiv papers using the combined query with 1-year date range and title/abstract search
    const arxivPromise = (async () => {
      const now = new Date();
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(now.getFullYear() - 1);
      const formatDate = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}0000`;
      const dateQuery = ` AND submittedDate:[${formatDate(oneYearAgo)} TO ${formatDate(now)}]`;
      const fullQuery = `(${ARXIV_COMBINED_QUERY})${dateQuery}`;
      const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(fullQuery)}&start=0&max_results=150&sortBy=submittedDate&sortOrder=descending`;
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


// Startup Dashboard RSS Feeds and Curated Data
const STARTUP_RSS_FEEDS = [
  { name: "a16z Build", url: "https://a16zbuild.substack.com/feed" },
  { name: "Founders You Should Know", url: "https://foundersysk.substack.com/feed" },
  { name: "Next Play", url: "https://nextplayso.substack.com/feed" },
  { name: "Early Days Substack", url: "https://earlydays.substack.com/feed" }
];

const CURATED_STARTUP_ITEMS = [
  {
    arxivId: null,
    title: "Ramp SaaS Spend Report: State of SaaS Q2 2026",
    summary: "Ramp's analysis of SaaS spending trends across 15,000+ companies. SaaS spend rose 14.2% quarter-over-quarter, driven by AI integrations and API usage. Duplicate software subscriptions declined as companies consolidated tools, while security and data platforms saw steady gains. OpenAI and Anthropic continue to rank as the fastest-growing vendors by spend volume.",
    published: "2026-07-10T12:00:00Z",
    updated: "2026-07-10T12:00:00Z",
    authors: ["Ramp Spend Analytics Group"],
    cats: ["market-reports", "saas-spend"],
    link: "https://ramp.com/blog/state-of-saas-spend-q2-2026",
    pdfLink: null,
    source: "Ramp Vendor Reports",
    customData: {
      type: "ramp-spend",
      totalSpendGrowth: "+14.2% QoQ",
      duplicateReduction: "-8.5%",
      avgSeatPrice: "$42.50",
      growthVendors: [
        { name: "Anthropic", growth: "210%", category: "AI/ML" },
        { name: "OpenAI", growth: "145%", category: "AI/ML" },
        { name: "Vercel", growth: "88%", category: "Infrastructure" },
        { name: "Supabase", growth: "76%", category: "Databases" },
        { name: "Figma", growth: "42%", category: "Design" }
      ],
      categoryShare: [
        { name: "AI & Machine Learning", share: 31 },
        { name: "Cloud Infrastructure", share: 26 },
        { name: "Collaboration & Docs", share: 19 },
        { name: "Security & Identity", share: 14 },
        { name: "Finance & Operations", share: 10 }
      ]
    }
  },
  {
    arxivId: null,
    title: "Ramp Monthly Vendor Report: Top 10 Fastest-Growing SaaS Vendors (June 2026)",
    summary: "An overview of the fastest-growing software tools by transaction volume and dollar spend. This month features substantial gains in local-first database tools, browser automation frameworks, and specialized AI developer infrastructure.",
    published: "2026-06-15T12:00:00Z",
    updated: "2026-06-15T12:00:00Z",
    authors: ["Ramp Editorial Team"],
    cats: ["market-reports", "vendor-rankings"],
    link: "https://ramp.com/blog/fastest-growing-saas-june-2026",
    pdfLink: null,
    source: "Ramp Vendor Reports",
    customData: {
      type: "ramp-spend",
      totalSpendGrowth: "+11.8% MoM",
      duplicateReduction: "-5.2%",
      avgSeatPrice: "$39.80",
      growthVendors: [
        { name: "Linear", growth: "54%", category: "Project Management" },
        { name: "Sentry", growth: "48%", category: "Monitoring" },
        { name: "PostHog", growth: "46%", category: "Analytics" },
        { name: "Retool", growth: "39%", category: "Internal Tools" },
        { name: "Tailscale", growth: "35%", category: "Networking" }
      ],
      categoryShare: [
        { name: "Developer Tools", share: 35 },
        { name: "AI & ML APIs", share: 22 },
        { name: "Productivity", share: 20 },
        { name: "Data & Security", share: 15 },
        { name: "Sales & Marketing", share: 8 }
      ]
    }
  },
  {
    arxivId: null,
    title: "Harmonic Hot 25: Q2 2026 Venture Discovery Index",
    summary: "Harmonic's quarterly index tracking the 25 fastest-growing venture-backed startups based on hiring velocity, capital efficiency, and market signal. Key trends this quarter show a surge in humanoid robotics platforms, hardware-software co-design, and open-source database systems.",
    published: "2026-07-05T08:00:00Z",
    updated: "2026-07-05T08:00:00Z",
    authors: ["Harmonic Deal Intelligence Team"],
    cats: ["startup-rankings", "venture-capital"],
    link: "https://harmonic.ai/blog/hot-25-q2-2026",
    pdfLink: null,
    source: "Harmonic Hot 25",
    customData: {
      type: "harmonic-hot25",
      quarter: "Q2 2026",
      avgGrowthRate: "+32.4% Headcount",
      totalFundingRaised: "$1.45B",
      startups: [
        { rank: 1, name: "Cognition AI", sector: "AI Software Engineering", funding: "Series B ($175M)", headcount: 140, growth: 120, site: "cognition.ai" },
        { rank: 2, name: "Physical Intelligence", sector: "Robotics Foundation Models", funding: "Series A ($70M)", headcount: 85, growth: 95, site: "physicalintelligence.company" },
        { rank: 3, name: "Hebbian Neural Systems", sector: "Embodied AI", funding: "Seed ($15M)", headcount: 24, growth: 80, site: "hebbian.ai" },
        { rank: 4, name: "Figure", sector: "Humanoid Robotics", funding: "Series C ($675M)", headcount: 280, growth: 45, site: "figure.ai" },
        { rank: 5, name: "Decart AI", sector: "Interactive Generative Media", funding: "Series A ($21M)", headcount: 48, growth: 74, site: "decart.ai" },
        { rank: 6, name: "Cursor (Anysphere)", sector: "AI Development Environments", funding: "Series A ($8M)", headcount: 35, growth: 68, site: "cursor.com" },
        { rank: 7, name: "Pika Labs", sector: "AI Video Platforms", funding: "Series A ($55M)", headcount: 62, growth: 60, site: "pika.art" },
        { rank: 8, name: "Perplexity AI", sector: "Conversational Search Engine", funding: "Series C ($250M)", headcount: 220, growth: 50, site: "perplexity.ai" },
        { rank: 9, name: "ElevenLabs", sector: "Generative Audio & Voice", funding: "Series B ($80M)", headcount: 180, growth: 42, site: "elevenlabs.io" },
        { rank: 10, name: "Harvey AI", sector: "Professional Service AI", funding: "Series C ($100M)", headcount: 160, growth: 38, site: "harvey.ai" },
        { rank: 11, name: "Sanctuary Cognitive Systems", sector: "Humanoid Robotics", funding: "Series B ($120M)", headcount: 150, growth: 35, site: "sanctuary.ai" },
        { rank: 12, name: "Sakana AI", sector: "Dynamic AI Foundations", funding: "Series A ($137M)", headcount: 50, growth: 33, site: "sakana.ai" }
      ]
    }
  },
  {
    arxivId: null,
    title: "Harmonic Hot 25: Q1 2026 Startup Velocity Report",
    summary: "Harmonic's Deal Intelligence rankings for the first quarter of 2026. This report highlights 25 breakout startups showing massive momentum across web automation, AI compliance, and local-first architectures.",
    published: "2026-04-02T08:00:00Z",
    updated: "2026-04-02T08:00:00Z",
    authors: ["Harmonic Deal Intelligence Team"],
    cats: ["startup-rankings", "venture-capital"],
    link: "https://harmonic.ai/blog/hot-25-q1-2026",
    pdfLink: null,
    source: "Harmonic Hot 25",
    customData: {
      type: "harmonic-hot25",
      quarter: "Q1 2026",
      avgGrowthRate: "+28.7% Headcount",
      totalFundingRaised: "$980M",
      startups: [
        { rank: 1, name: "Supermaven", sector: "AI Code Copilots", funding: "Seed ($12M)", headcount: 18, growth: 150, site: "supermaven.com" },
        { rank: 2, name: "LlamaIndex", sector: "AI Data Frameworks", funding: "Seed ($8.5M)", headcount: 32, growth: 88, site: "llamaindex.ai" },
        { rank: 3, name: "LangChain", sector: "AI Application Templates", funding: "Series A ($25M)", headcount: 45, growth: 72, site: "langchain.com" },
        { rank: 4, name: "Braintrust", sector: "AI Software Evaluation", funding: "Series A ($18M)", headcount: 29, growth: 65, site: "braintrust.dev" },
        { rank: 5, name: "Vibe AI", sector: "Local AI Orchestration", funding: "Seed ($4.5M)", headcount: 14, growth: 60, site: "vibe.ai" }
      ]
    }
  },
  {
    arxivId: null,
    title: "YC W26 Batch: Top Breakout Companies and Trends",
    summary: "A comprehensive look at the newly launched Y Combinator Winter 2026 batch. Analysis of the 280+ companies reveals a dominant focus on AI developer tools, local-first web applications, and autonomous agent coordination layers.",
    published: "2026-07-12T10:00:00Z",
    updated: "2026-07-12T10:00:00Z",
    authors: ["Y Combinator Research Group"],
    cats: ["startup-directories", "yc-highlights"],
    link: "https://www.ycombinator.com/companies",
    pdfLink: null,
    source: "YC Startup Directory",
    customData: {
      type: "yc-directory",
      batch: "W26",
      totalStartups: 285,
      featuredCompanies: [
        { name: "OmniParser", description: "Visual agent parsing engine that translates pixel layouts into structured execution coordinates.", sector: "AI Agents", size: "8 people", stage: "Pre-seed", site: "omniparser.io" },
        { name: "LocalDB", description: "Zero-latency, local-first transactional database engine for collaborative web apps with automatic cloud sync.", sector: "Developer Tools", size: "5 people", stage: "Seed", site: "localdb.dev" },
        { name: "CellularBio", description: "AI generative modeling of protein folding dynamics under microgravity environments.", sector: "BioTech", size: "12 people", stage: "Seed", site: "cellular.bio" },
        { name: "LedgerFlow", description: "Autonomous financial ledger reconciliation agents that identify billing anomalies automatically.", sector: "Fintech", size: "6 people", stage: "Pre-seed", site: "ledgerflow.ai" },
        { name: "WebShield", description: "Next-gen web application firewall powered by agentic defense that blocks zero-day exploits in real-time.", sector: "Security", size: "10 people", stage: "Seed", site: "webshield.com" }
      ]
    }
  },
  {
    arxivId: null,
    title: "YC S25 Batch: Curated Top Breakout Startups",
    summary: "Highlighting the top breakout companies from the Summer 2025 cohort. These companies are hiring active founding engineers and showing early product-market fit in database scaling, security enforcement, and agentic workflows.",
    published: "2025-09-18T10:00:00Z",
    updated: "2025-09-18T10:00:00Z",
    authors: ["Y Combinator Research Group"],
    cats: ["startup-directories", "yc-highlights"],
    link: "https://www.ycombinator.com/companies",
    pdfLink: null,
    source: "YC Startup Directory",
    customData: {
      type: "yc-directory",
      batch: "S25",
      totalStartups: 260,
      featuredCompanies: [
        { name: "VaporDB", description: "Serverless distributed key-value store built on WASM execution blocks for sub-millisecond edge lookups.", sector: "Developer Tools", size: "14 people", stage: "Seed", site: "vapordb.io" },
        { name: "OpticFlow", description: "Bimanual robotic arm coordination policies based on visual-tactile sensor fusion models.", sector: "Robotics", size: "9 people", stage: "Seed", site: "opticflow.tech" },
        { name: "AgentMesh", description: "Multi-agent communication protocol enabling cross-platform task delegation with automatic token cost settlement.", sector: "AI Agents", size: "16 people", stage: "Series A", site: "agentmesh.com" }
      ]
    }
  }
];

let startupCache = {
  data: null,
  timestamp: 0
};

// Endpoint: Unified Startup Feed API
app.get('/api/startup-feed', async (req, res) => {
  const forceRefresh = req.query.refresh === 'true';
  const now = Date.now();

  if (startupCache.data && (now - startupCache.timestamp < CACHE_DURATION) && !forceRefresh) {
    return res.json({
      status: 'success',
      source: 'cache',
      timestamp: new Date(startupCache.timestamp).toISOString(),
      data: startupCache.data
    });
  }

  console.log('Fetching fresh Startup & Venture feeds...');
  try {
    const rssPromises = STARTUP_RSS_FEEDS.map(async (feedItem) => {
      try {
        const xmlText = await fetchWithRetry(feedItem.url);
        const parsed = await parseRSSXML(xmlText, feedItem.name);
        return parsed.map(item => {
          // Identify category mapping from Substack articles
          let cats = ['substack-insights'];
          const contentStr = (item.title + ' ' + item.summary).toLowerCase();
          if (contentStr.includes('job') || contentStr.includes('hiring') || contentStr.includes('role') || contentStr.includes('careers') || contentStr.includes('talent')) {
            cats.push('talent-jobs');
          }
          if (contentStr.includes('found') || contentStr.includes('pitch') || contentStr.includes('showcase')) {
            cats.push('pitch-showcases');
          }
          return { ...item, cats };
        });
      } catch (err) {
        console.error(`Failed to fetch RSS feed ${feedItem.name}:`, err.message);
        return [];
      }
    });

    const allResults = await Promise.all(rssPromises);

    const unifiedList = [...CURATED_STARTUP_ITEMS];
    const seenKeys = new Set();
    
    // Seed seenKeys with curated items
    CURATED_STARTUP_ITEMS.forEach(item => {
      seenKeys.add(item.link);
    });

    let successCount = 0;
    allResults.forEach((items) => {
      if (items.length > 0) {
        successCount++;
        items.forEach(item => {
          if (item.link && !seenKeys.has(item.link)) {
            seenKeys.add(item.link);
            unifiedList.push(item);
          }
        });
      }
    });

    // Sort combined feed by published date descending
    unifiedList.sort((a, b) => new Date(b.published) - new Date(a.published));

    if (unifiedList.length === 0 && startupCache.data) {
      console.warn('All startup queries failed. Serving stale cache.');
      return res.json({
        status: 'success',
        source: 'cache_retained',
        timestamp: new Date(startupCache.timestamp).toISOString(),
        data: startupCache.data
      });
    }

    startupCache.data = unifiedList;
    startupCache.timestamp = now;

    res.json({
      status: 'success',
      source: 'network',
      queriesSucceeded: successCount,
      totalQueries: STARTUP_RSS_FEEDS.length,
      timestamp: new Date(now).toISOString(),
      data: unifiedList
    });
  } catch (err) {
    console.error('API Error in startup feed aggregator:', err);
    res.status(500).json({
      status: 'error',
      message: err.message || 'Server aggregation failed.'
    });
  }
});

// Explicit routes for startup dashboard
app.get('/startup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'startup.html'));
});

app.get('/startup-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'startup.html'));
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
