#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DATAFORSEO_API_BASE = "https://api.dataforseo.com";

const PRICE_USD = {
  googleOrganicLiveAdvancedTop10: 0.003,
  googleAiModeLiveAdvancedTop10: 0.003,
  onPageBasicPage: 0.000125,
  onPageJsRenderedPage: 0.0015,
  onPageBrowserRenderedPage: 0.00425,
  labsRequest: 0.01,
  labsReturnedItem: 0.0001,
};

export const PRICING_NOTES = [
  {
    label: "DataForSEO minimum payment",
    note: "DataForSEO currently lists a $50 minimum account payment/top-up.",
    url: "https://dataforseo.com/pricing",
  },
  {
    label: "Google Organic SERP live advanced",
    note: "Estimated at $0.003 per top-10 live advanced SERP task.",
    url: "https://dataforseo.com/pricing/serp/google-organic-serp-api",
  },
  {
    label: "Google AI Mode SERP live advanced",
    note: "Estimated at $0.003 per top-10 live advanced SERP task.",
    url: "https://dataforseo.com/pricing/serp/google-ai-mode-serp-api",
  },
  {
    label: "OnPage API",
    note: "Estimated from listed per-page rates and the current JS+resource crawl shape: basic $0.000125, JS $0.0015, browser $0.00425.",
    url: "https://dataforseo.com/pricing/on-page/onpage-api",
  },
  {
    label: "DataForSEO Labs Google",
    note: "Estimated at $0.01 per request plus $0.0001 per returned item.",
    url: "https://dataforseo.com/pricing/dataforseo-labs/dataforseo-google-api",
  },
];

const DEFAULT_KEYWORDS = [
  "ai legal counsel",
  "anthropic claude enterprise legal review",
  "data processing agreement ai vendor",
  "gdpr ai procurement legal",
  "enterprise ai legal risk",
];

function usage() {
  return `Usage:
  pnpm seo:dataforseo -- --mode baseline --domain compound.law --keywords "ai legal counsel,gdpr ai procurement" --dry-run
  pnpm seo:dataforseo -- --mode baseline --domain compound.law --keywords-file tmp/seo-keywords.txt --include-serp --live --max-spend-usd 2
  pnpm seo:dataforseo -- --mode baseline --preset growth --domain compound.law --keywords-file tmp/seo-keywords.txt --live --max-spend-usd 10

Modes:
  baseline   Build a baseline SEO/GEO intelligence plan and optionally run live SERP tasks.
  estimate   Print the same plan without live calls.

Flags:
  --preset <baseline|growth|technical|content|visibility>
                                  Turn on endpoint bundles. Default: baseline
  --domain <domain>                 Domain to measure. Default: compound.law
  --keywords <a,b,c>                Comma-separated seed keywords.
  --keywords-file <path>            Plain text, CSV-ish, or JSON array of keywords.
  --location-code <number>          DataForSEO location code. Default: env or 2840 (United States)
  --language-code <code>            DataForSEO language code. Default: env or en
  --device <desktop|mobile|both>    Device mix. Default: desktop
  --depth <number>                  SERP depth. Default: 10
  --max-spend-usd <number>          Hard stop before any live call. Default: 5
  --estimated-pages <number>        Pages for OnPage cost estimates. Default: 500
  --labs-item-limit <number>        Returned Labs rows to budget per keyword. Default: 50
  --include-serp / --no-serp        Include Google Organic SERP. Default: include
  --include-ai-mode                 Include Google AI Mode SERP estimate and live call.
  --include-on-page                 Include OnPage crawl estimate. Live crawl is not run yet.
  --on-page-rendering <basic|js|browser>
  --on-page-task-id <id>            Fetch OnPage pages for a completed task.
  --on-page-page-limit <number>     Pages to fetch for --on-page-task-id. Default: 100
  --check-on-page-ready             Fetch completed OnPage task IDs.
  --include-labs                    Include Labs keyword ideas.
  --include-keyword-suggestions     Include Labs keyword suggestions.
  --include-ranked-keywords         Include Labs ranked keywords for the domain.
  --include-competitors             Include Labs domain competitors.
  --live                            Execute supported live calls. Requires DATAFORSEO_LOGIN/PASSWORD.
  --dry-run                         Force no live calls.
  --output <path>                   Write JSON result. Default: tmp/dataforseo-baseline-<date>.json
  --help`;
}

function readFlagValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

export function parseArgs(argv) {
  const today = new Date().toISOString().slice(0, 10);
  let explicitKeywordInput = false;
  let explicitSerp = false;
  const options = {
    help: false,
    mode: "baseline",
    preset: "baseline",
    domain: "compound.law",
    keywords: [],
    keywordsFile: null,
    locationCode: Number(process.env.DATAFORSEO_DEFAULT_LOCATION_CODE ?? 2840),
    languageCode: process.env.DATAFORSEO_DEFAULT_LANGUAGE_CODE ?? "en",
    device: "desktop",
    depth: 10,
    maxSpendUsd: 5,
    estimatedPages: 500,
    labsItemLimit: 50,
    includeSerp: true,
    includeAiMode: false,
    includeOnPage: false,
    onPageRendering: "basic",
    onPageTaskId: null,
    onPagePageLimit: 100,
    checkOnPageReady: false,
    includeLabs: false,
    includeKeywordSuggestions: false,
    includeRankedKeywords: false,
    includeCompetitors: false,
    live: false,
    dryRun: true,
    output: `tmp/dataforseo-baseline-${today}.json`,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--":
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--mode":
        options.mode = readFlagValue(argv, index, arg);
        index += 1;
        break;
      case "--preset":
        options.preset = readFlagValue(argv, index, arg);
        index += 1;
        break;
      case "--domain":
        options.domain = normalizeDomain(readFlagValue(argv, index, arg));
        index += 1;
        break;
      case "--keywords":
        options.keywords.push(...parseKeywordText(readFlagValue(argv, index, arg)));
        explicitKeywordInput = true;
        index += 1;
        break;
      case "--keywords-file":
        options.keywordsFile = readFlagValue(argv, index, arg);
        explicitKeywordInput = true;
        index += 1;
        break;
      case "--location-code":
        options.locationCode = parsePositiveInteger(readFlagValue(argv, index, arg), arg);
        index += 1;
        break;
      case "--language-code":
        options.languageCode = readFlagValue(argv, index, arg).trim();
        index += 1;
        break;
      case "--device":
        options.device = readFlagValue(argv, index, arg);
        index += 1;
        break;
      case "--depth":
        options.depth = parsePositiveInteger(readFlagValue(argv, index, arg), arg);
        index += 1;
        break;
      case "--max-spend-usd":
        options.maxSpendUsd = parsePositiveNumber(readFlagValue(argv, index, arg), arg);
        index += 1;
        break;
      case "--estimated-pages":
        options.estimatedPages = parsePositiveInteger(readFlagValue(argv, index, arg), arg);
        index += 1;
        break;
      case "--labs-item-limit":
        options.labsItemLimit = parsePositiveInteger(readFlagValue(argv, index, arg), arg);
        index += 1;
        break;
      case "--include-serp":
        options.includeSerp = true;
        explicitSerp = true;
        break;
      case "--no-serp":
        options.includeSerp = false;
        explicitSerp = true;
        break;
      case "--include-ai-mode":
        options.includeAiMode = true;
        break;
      case "--include-on-page":
        options.includeOnPage = true;
        break;
      case "--on-page-rendering":
        options.onPageRendering = readFlagValue(argv, index, arg);
        index += 1;
        break;
      case "--on-page-task-id":
        options.onPageTaskId = readFlagValue(argv, index, arg).trim();
        index += 1;
        break;
      case "--on-page-page-limit":
        options.onPagePageLimit = parsePositiveInteger(readFlagValue(argv, index, arg), arg);
        index += 1;
        break;
      case "--check-on-page-ready":
        options.checkOnPageReady = true;
        break;
      case "--include-labs":
        options.includeLabs = true;
        break;
      case "--include-keyword-suggestions":
        options.includeKeywordSuggestions = true;
        break;
      case "--include-ranked-keywords":
        options.includeRankedKeywords = true;
        break;
      case "--include-competitors":
        options.includeCompetitors = true;
        break;
      case "--live":
        options.live = true;
        options.dryRun = false;
        break;
      case "--dry-run":
        options.dryRun = true;
        options.live = false;
        break;
      case "--output":
        options.output = readFlagValue(argv, index, arg);
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  applyPreset(options);

  const onPageResultOnly =
    (options.checkOnPageReady || options.onPageTaskId) &&
    !explicitSerp &&
    !explicitKeywordInput &&
    !options.includeAiMode &&
    !options.includeOnPage &&
    !options.includeLabs &&
    !options.includeKeywordSuggestions &&
    !options.includeRankedKeywords &&
    !options.includeCompetitors;
  if (onPageResultOnly) {
    options.includeSerp = false;
  }

  if (!["baseline", "estimate"].includes(options.mode)) {
    throw new Error("--mode must be one of: baseline, estimate");
  }
  if (!["baseline", "growth", "technical", "content", "visibility"].includes(options.preset)) {
    throw new Error("--preset must be one of: baseline, growth, technical, content, visibility");
  }
  if (!["desktop", "mobile", "both"].includes(options.device)) {
    throw new Error("--device must be one of: desktop, mobile, both");
  }
  if (!["basic", "js", "browser"].includes(options.onPageRendering)) {
    throw new Error("--on-page-rendering must be one of: basic, js, browser");
  }
  if (!options.languageCode) {
    throw new Error("--language-code cannot be empty");
  }
  if (!Number.isInteger(options.locationCode) || options.locationCode <= 0) {
    throw new Error("--location-code must be a positive integer");
  }

  return options;
}

function applyPreset(options) {
  switch (options.preset) {
    case "growth":
      options.includeSerp = true;
      options.includeAiMode = true;
      options.includeLabs = true;
      options.includeKeywordSuggestions = true;
      options.includeRankedKeywords = true;
      options.includeCompetitors = true;
      options.includeOnPage = true;
      options.onPageRendering = options.onPageRendering === "basic" ? "js" : options.onPageRendering;
      break;
    case "technical":
      options.includeSerp = false;
      options.includeOnPage = true;
      options.onPageRendering = options.onPageRendering === "basic" ? "js" : options.onPageRendering;
      break;
    case "content":
      options.includeSerp = true;
      options.includeLabs = true;
      options.includeKeywordSuggestions = true;
      options.includeCompetitors = true;
      break;
    case "visibility":
      options.includeSerp = true;
      options.includeAiMode = true;
      options.includeRankedKeywords = true;
      options.includeCompetitors = true;
      break;
    default:
      break;
  }
}

function parsePositiveNumber(value, flag) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive number`);
  }
  return parsed;
}

function parsePositiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

export function normalizeDomain(value) {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

export function parseKeywordText(text) {
  return unique(
    text
      .split(/\r?\n|,/)
      .map((keyword) => keyword.trim())
      .filter(Boolean),
  );
}

export function parseKeywordInput({ keywords = [], keywordsFile = null } = {}) {
  const fromFile = keywordsFile ? readKeywordsFile(keywordsFile) : [];
  const combined = unique([...keywords, ...fromFile]);
  return combined.length > 0 ? combined : DEFAULT_KEYWORDS;
}

function readKeywordsFile(filePath) {
  const absolutePath = resolve(filePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Keyword file not found: ${filePath}`);
  }

  const text = readFileSync(absolutePath, "utf8").trim();
  if (!text) return [];

  if (text.startsWith("[")) {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      throw new Error("Keyword JSON file must contain an array");
    }
    return unique(parsed.map((keyword) => String(keyword).trim()).filter(Boolean));
  }

  return parseKeywordText(text);
}

function unique(values) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function resolveDevices(device) {
  return device === "both" ? ["desktop", "mobile"] : [device];
}

function roundUsd(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function estimatePlanCost({ keywords, options }) {
  const devices = resolveDevices(options.device);
  const breakdown = [];

  if (options.includeSerp) {
    const units = keywords.length * devices.length;
    breakdown.push({
      endpoint: "serp.google.organic.live.advanced",
      units,
      unitCostUsd: PRICE_USD.googleOrganicLiveAdvancedTop10,
      estimatedCostUsd: roundUsd(units * PRICE_USD.googleOrganicLiveAdvancedTop10),
      status: "live-supported",
    });
  }

  if (options.includeAiMode) {
    const units = keywords.length * devices.length;
    breakdown.push({
      endpoint: "serp.google.ai_mode.live.advanced",
      units,
      unitCostUsd: PRICE_USD.googleAiModeLiveAdvancedTop10,
      estimatedCostUsd: roundUsd(units * PRICE_USD.googleAiModeLiveAdvancedTop10),
      status: "live-supported",
    });
  }

  if (options.includeOnPage) {
    const unitCostUsd =
      options.onPageRendering === "browser"
        ? PRICE_USD.onPageBrowserRenderedPage
        : options.onPageRendering === "js"
          ? PRICE_USD.onPageJsRenderedPage
          : PRICE_USD.onPageBasicPage;
    breakdown.push({
      endpoint: `on_page.${options.onPageRendering}`,
      units: options.estimatedPages,
      unitCostUsd,
      estimatedCostUsd: roundUsd(options.estimatedPages * unitCostUsd),
      status: "live-supported",
    });
  }

  if (options.includeLabs) {
    const units = keywords.length;
    const estimatedReturnedItems = keywords.length * options.labsItemLimit;
    breakdown.push({
      endpoint: "dataforseo_labs.google.keyword_and_competitor_research",
      units,
      unitCostUsd: PRICE_USD.labsRequest,
      returnedItems: estimatedReturnedItems,
      returnedItemCostUsd: PRICE_USD.labsReturnedItem,
      estimatedCostUsd: roundUsd(
        units * PRICE_USD.labsRequest + estimatedReturnedItems * PRICE_USD.labsReturnedItem,
      ),
      status: "live-supported",
    });
  }

  if (options.includeKeywordSuggestions) {
    const units = keywords.length;
    const estimatedReturnedItems = keywords.length * options.labsItemLimit;
    breakdown.push({
      endpoint: "dataforseo_labs.google.keyword_suggestions",
      units,
      unitCostUsd: PRICE_USD.labsRequest,
      returnedItems: estimatedReturnedItems,
      returnedItemCostUsd: PRICE_USD.labsReturnedItem,
      estimatedCostUsd: roundUsd(
        units * PRICE_USD.labsRequest + estimatedReturnedItems * PRICE_USD.labsReturnedItem,
      ),
      status: "live-supported",
    });
  }

  if (options.includeRankedKeywords) {
    breakdown.push({
      endpoint: "dataforseo_labs.google.ranked_keywords",
      units: 1,
      unitCostUsd: PRICE_USD.labsRequest,
      returnedItems: options.labsItemLimit,
      returnedItemCostUsd: PRICE_USD.labsReturnedItem,
      estimatedCostUsd: roundUsd(PRICE_USD.labsRequest + options.labsItemLimit * PRICE_USD.labsReturnedItem),
      status: "live-supported",
    });
  }

  if (options.includeCompetitors) {
    breakdown.push({
      endpoint: "dataforseo_labs.google.competitors_domain",
      units: 1,
      unitCostUsd: PRICE_USD.labsRequest,
      returnedItems: options.labsItemLimit,
      returnedItemCostUsd: PRICE_USD.labsReturnedItem,
      estimatedCostUsd: roundUsd(PRICE_USD.labsRequest + options.labsItemLimit * PRICE_USD.labsReturnedItem),
      status: "live-supported",
    });
  }

  return {
    totalEstimatedCostUsd: roundUsd(
      breakdown.reduce((sum, line) => sum + line.estimatedCostUsd, 0),
    ),
    breakdown,
  };
}

export function buildSerpTasks({ keywords, options, endpoint }) {
  const devices = resolveDevices(options.device);
  return keywords.flatMap((keyword) =>
    devices.map((device) => ({
      keyword,
      location_code: options.locationCode,
      language_code: options.languageCode,
      device,
      depth: options.depth,
      tag: `${endpoint}:${normalizeDomain(options.domain)}:${device}:${keyword}`,
    })),
  );
}

export function buildBaselinePlan({ keywords, options }) {
  const plannedRequests = [];

  if (options.includeSerp) {
    plannedRequests.push({
      name: "Google Organic SERP visibility",
      method: "POST",
      endpoint: "/v3/serp/google/organic/live/advanced",
      liveSupported: true,
      apiCallShape: "one task per live API call",
      tasks: buildSerpTasks({ keywords, options, endpoint: "organic" }),
      expectedOutput: [
        "Top organic URLs",
        "Compound ranking positions",
        "SERP features and competitor domains",
      ],
    });
  }

  if (options.includeAiMode) {
    plannedRequests.push({
      name: "Google AI Mode visibility",
      method: "POST",
      endpoint: "/v3/serp/google/ai_mode/live/advanced",
      liveSupported: true,
      apiCallShape: "one task per live API call",
      tasks: buildSerpTasks({ keywords, options, endpoint: "ai_mode" }),
      expectedOutput: [
        "AI Mode cited sources",
        "Prompt-level visibility gaps",
        "Competitor sources appearing in generative answers",
      ],
    });
  }

  if (options.includeOnPage) {
    plannedRequests.push({
      name: "OnPage crawl",
      method: "POST",
      endpoint: "/v3/on_page/task_post",
      liveSupported: true,
      tasks: [
        {
          target: normalizeDomain(options.domain),
          max_crawl_pages: options.estimatedPages,
          enable_javascript: options.onPageRendering !== "basic",
          enable_browser_rendering: options.onPageRendering === "browser",
          load_resources: options.onPageRendering !== "basic",
          respect_sitemap: true,
        },
      ],
      expectedOutput: [
        "Technical crawl errors",
        "Indexability blockers",
        "Internal linking and metadata issues",
      ],
    });
  }

  if (options.checkOnPageReady) {
    plannedRequests.push({
      name: "OnPage completed task list",
      method: "GET",
      endpoint: "/v3/on_page/tasks_ready",
      liveSupported: true,
      tasks: [],
      expectedOutput: [
        "Completed OnPage task IDs ready for page-level retrieval",
      ],
    });
  }

  if (options.onPageTaskId) {
    plannedRequests.push({
      name: "OnPage pages",
      method: "POST",
      endpoint: "/v3/on_page/pages",
      liveSupported: true,
      tasks: [
        {
          id: options.onPageTaskId,
          limit: options.onPagePageLimit,
        },
      ],
      expectedOutput: [
        "Page-level technical SEO findings",
        "Status codes, canonical signals, metadata, and internal link data",
      ],
    });
  }

  if (options.includeLabs) {
    plannedRequests.push({
      name: "Labs keyword ideas",
      method: "POST",
      endpoint: "/v3/dataforseo_labs/google/keyword_ideas/live",
      liveSupported: true,
      tasks: keywords.map((keyword) => ({
        keywords: [keyword],
        location_code: options.locationCode,
        language_code: options.languageCode,
        limit: options.labsItemLimit,
      })),
      expectedOutput: [
        "Keyword expansion candidates",
        "Intent and demand hints",
        "Competitor content opportunities",
      ],
    });
  }

  if (options.includeKeywordSuggestions) {
    plannedRequests.push({
      name: "Labs keyword suggestions",
      method: "POST",
      endpoint: "/v3/dataforseo_labs/google/keyword_suggestions/live",
      liveSupported: true,
      tasks: keywords.map((keyword) => ({
        keyword,
        location_code: options.locationCode,
        language_code: options.languageCode,
        limit: options.labsItemLimit,
      })),
      expectedOutput: [
        "Adjacent query candidates",
        "Question and long-tail demand",
        "Content cluster expansion inputs",
      ],
    });
  }

  if (options.includeRankedKeywords) {
    plannedRequests.push({
      name: "Labs ranked keywords",
      method: "POST",
      endpoint: "/v3/dataforseo_labs/google/ranked_keywords/live",
      liveSupported: true,
      tasks: [
        {
          target: normalizeDomain(options.domain),
          location_code: options.locationCode,
          language_code: options.languageCode,
          limit: options.labsItemLimit,
        },
      ],
      expectedOutput: [
        "Keywords where Compound already ranks",
        "Ranking URLs and positions",
        "Low-hanging-fruit refresh targets",
      ],
    });
  }

  if (options.includeCompetitors) {
    plannedRequests.push({
      name: "Labs domain competitors",
      method: "POST",
      endpoint: "/v3/dataforseo_labs/google/competitors_domain/live",
      liveSupported: true,
      tasks: [
        {
          target: normalizeDomain(options.domain),
          location_code: options.locationCode,
          language_code: options.languageCode,
          limit: options.labsItemLimit,
        },
      ],
      expectedOutput: [
        "Organic competitors by keyword intersection",
        "Domains to mine for content gaps",
        "Visibility baselines against legal AI competitors",
      ],
    });
  }

  const costEstimate = estimatePlanCost({ keywords, options });

  return {
    generatedAt: new Date().toISOString(),
    mode: options.mode,
    preset: options.preset,
    domain: normalizeDomain(options.domain),
    dryRun: options.dryRun || !options.live,
    inputs: {
      keywords,
      locationCode: options.locationCode,
      languageCode: options.languageCode,
      device: options.device,
      depth: options.depth,
      estimatedPages: options.estimatedPages,
      labsItemLimit: options.labsItemLimit,
      onPageTaskId: options.onPageTaskId,
      onPagePageLimit: options.onPagePageLimit,
      includedEndpoints: {
        serp: options.includeSerp,
        aiMode: options.includeAiMode,
        onPage: options.includeOnPage,
        onPageReady: options.checkOnPageReady,
        onPagePages: Boolean(options.onPageTaskId),
        labs: options.includeLabs,
        keywordSuggestions: options.includeKeywordSuggestions,
        rankedKeywords: options.includeRankedKeywords,
        competitors: options.includeCompetitors,
      },
    },
    guardrails: {
      maxSpendUsd: options.maxSpendUsd,
      hardStopTriggered: costEstimate.totalEstimatedCostUsd > options.maxSpendUsd,
      credentialEnvVars: ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"],
      secretHandling: "Credentials are read from env only and never written to output.",
    },
    costEstimate,
    pricingNotes: PRICING_NOTES,
    plannedRequests,
    liveResults: [],
    unsupportedLiveRequests: plannedRequests
      .filter((request) => !request.liveSupported)
      .map((request) => request.endpoint),
    paperclipNextActions: [
      "Attach this JSON output to the SEO Automation project issue or plan document.",
      "Create follow-up issues only for pages or keywords with quantified opportunity and clear owner.",
      "Keep DataForSEO spend caps on every run; use GSC data as the source of truth for owned-site performance.",
    ],
  };
}

export function createDataForSeoAuthHeader({ login, password }) {
  if (!login || !password) {
    throw new Error("DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are required for --live");
  }
  return `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
}

export async function callDataForSeo({
  endpoint,
  tasks,
  method = "POST",
  login = process.env.DATAFORSEO_LOGIN,
  password = process.env.DATAFORSEO_PASSWORD,
  fetchImpl = fetch,
}) {
  const request = {
    method,
    headers: {
      Authorization: createDataForSeoAuthHeader({ login, password }),
      "Content-Type": "application/json",
    },
  };
  if (method !== "GET") {
    request.body = JSON.stringify(tasks);
  }

  const response = await fetchImpl(`${DATAFORSEO_API_BASE}${endpoint}`, request);

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`DataForSEO returned non-JSON response: ${error.message}`);
  }

  if (!response.ok || Number(payload.status_code ?? 0) >= 40000) {
    const message = payload.status_message ?? response.statusText;
    throw new Error(`DataForSEO request failed for ${endpoint}: ${message}`);
  }

  return payload;
}

export function normalizeSerpResponse(payload) {
  const rows = [];

  for (const task of payload.tasks ?? []) {
    for (const result of task.result ?? []) {
      const keyword = result.keyword ?? task.data?.keyword ?? task.data?.tag ?? null;
      for (const item of result.items ?? []) {
        rows.push({
          keyword,
          type: item.type ?? null,
          rankGroup: item.rank_group ?? null,
          rankAbsolute: item.rank_absolute ?? null,
          domain: item.domain ?? null,
          url: item.url ?? null,
          title: item.title ?? null,
          description: item.description ?? null,
          breadcrumb: item.breadcrumb ?? null,
        });
      }
    }
  }

  return rows;
}

function taskInput(task, key) {
  return task.data?.[key] ?? task[key] ?? null;
}

export function normalizeLabsResponse(payload) {
  const rows = [];

  for (const task of payload.tasks ?? []) {
    const seedKeyword = taskInput(task, "keyword") ?? task.data?.keywords?.[0] ?? null;
    const target = taskInput(task, "target") ?? null;
    for (const result of task.result ?? []) {
      for (const item of result.items ?? []) {
        const keywordData = item.keyword_data ?? item;
        const keywordInfo = keywordData.keyword_info ?? item.keyword_info ?? {};
        const serpItem = item.ranked_serp_element?.serp_item ?? item.serp_item ?? item;
        rows.push({
          seedKeyword,
          target,
          keyword: keywordData.keyword ?? item.keyword ?? null,
          locationCode: keywordData.location_code ?? item.location_code ?? null,
          languageCode: keywordData.language_code ?? item.language_code ?? null,
          searchVolume: keywordInfo.search_volume ?? null,
          cpc: keywordInfo.cpc ?? null,
          competition: keywordInfo.competition ?? null,
          competitionLevel: keywordInfo.competition_level ?? null,
          rankAbsolute: serpItem.rank_absolute ?? null,
          rankGroup: serpItem.rank_group ?? null,
          domain: item.domain ?? serpItem.domain ?? null,
          url: serpItem.url ?? item.url ?? null,
          title: serpItem.title ?? item.title ?? null,
          intersections: item.intersections ?? null,
          avgPosition: item.avg_position ?? item.avg_rank ?? null,
        });
      }
    }
  }

  return rows;
}

export function normalizeOnPageResponse(payload) {
  const rows = [];

  for (const task of payload.tasks ?? []) {
    for (const result of task.result ?? []) {
      for (const item of result.items ?? []) {
        rows.push({
          url: item.url ?? null,
          statusCode: item.status_code ?? item.resource_type_status_code ?? null,
          title: item.meta?.title ?? item.title ?? null,
          description: item.meta?.description ?? item.description ?? null,
          canonical: item.meta?.canonical ?? item.canonical ?? null,
          checks: item.checks ?? null,
          pageTiming: item.page_timing ?? null,
          internalLinksCount: item.links_internal ?? item.internal_links_count ?? null,
          externalLinksCount: item.links_external ?? item.external_links_count ?? null,
          size: item.size ?? null,
        });
      }
      if (Array.isArray(result.items) && result.items.length === 0 && result.id) {
        rows.push({ taskId: result.id, status: result.status ?? null });
      }
    }
  }

  return rows;
}

function normalizeGenericTaskResponse(payload) {
  return (payload.tasks ?? []).map((task) => ({
    id: task.id ?? null,
    statusCode: task.status_code ?? null,
    statusMessage: task.status_message ?? null,
    cost: Number(task.cost ?? 0),
    data: task.data ?? null,
    result: task.result ?? null,
  }));
}

export async function runLiveRequests(plan, options, callDataForSeoImpl = callDataForSeo) {
  const supported = plan.plannedRequests.filter((request) => request.liveSupported);

  for (const request of supported) {
    let payloads = [];
    if (request.method === "GET") {
      payloads = [
        await callDataForSeoImpl({
          endpoint: request.endpoint,
          tasks: [],
          method: "GET",
        }),
      ];
    } else if (request.endpoint.includes("/serp/")) {
      for (const task of request.tasks) {
        payloads.push(
          await callDataForSeoImpl({
            endpoint: request.endpoint,
            tasks: [task],
          }),
        );
      }
    } else {
      payloads = [
        await callDataForSeoImpl({
          endpoint: request.endpoint,
          tasks: request.tasks,
        }),
      ];
    }

    plan.liveResults.push({
      endpoint: request.endpoint,
      taskCount: request.tasks.length,
      apiCalls: payloads.length,
      statusCodes: payloads.map((payload) => payload.status_code ?? null),
      statusMessages: payloads.map((payload) => payload.status_message ?? null),
      cost: roundUsd(
        payloads.reduce((sum, payload) => sum + Number(payload.cost ?? 0), 0),
      ),
      serpRows: request.endpoint.includes("/serp/")
        ? payloads.flatMap((payload) => normalizeSerpResponse(payload))
        : [],
      labsRows: request.endpoint.includes("/dataforseo_labs/")
        ? payloads.flatMap((payload) => normalizeLabsResponse(payload))
        : [],
      onPageRows: request.endpoint.includes("/on_page/")
        ? payloads.flatMap((payload) => normalizeOnPageResponse(payload))
        : [],
      rawTasks: payloads.flatMap((payload) => normalizeGenericTaskResponse(payload)),
    });
  }

  if (options.includeOnPage) {
    plan.paperclipNextActions.push(
      "For OnPage crawls, save returned task IDs and run --check-on-page-ready or --on-page-task-id before creating technical fix issues.",
    );
  }
}

function writeJson(filePath, payload) {
  const absolutePath = resolve(filePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return absolutePath;
}

export async function main(argv = process.argv.slice(2), { log = console.log, error = console.error } = {}) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      log(usage());
      return 0;
    }

    if (options.mode === "estimate") {
      options.live = false;
      options.dryRun = true;
    }

    const keywords = parseKeywordInput(options);
    const plan = buildBaselinePlan({ keywords, options });

    if (plan.guardrails.hardStopTriggered) {
      throw new Error(
        `Estimated DataForSEO cost $${plan.costEstimate.totalEstimatedCostUsd} exceeds --max-spend-usd $${options.maxSpendUsd}.`,
      );
    }

    if (options.live && !options.dryRun) {
      if (!process.env.DATAFORSEO_LOGIN || !process.env.DATAFORSEO_PASSWORD) {
        throw new Error("DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are required for --live");
      }
      await runLiveRequests(plan, options);
    }

    const outputPath = writeJson(options.output, plan);
    log(
      `DataForSEO ${options.live && !options.dryRun ? "live" : "dry-run"} ${options.mode} written to ${outputPath}`,
    );
    log(`Estimated spend: $${plan.costEstimate.totalEstimatedCostUsd}`);
    return 0;
  } catch (caught) {
    error(caught instanceof Error ? caught.message : String(caught));
    return 1;
  }
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  process.exit(await main());
}
