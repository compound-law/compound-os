import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildBaselinePlan,
  createDataForSeoAuthHeader,
  estimatePlanCost,
  normalizeLabsResponse,
  normalizeOnPageResponse,
  normalizeDomain,
  normalizeSerpResponse,
  parseArgs,
  parseKeywordInput,
  parseKeywordText,
  runLiveRequests,
} from "./dataforseo-seo-intelligence.mjs";

test("parseArgs defaults to a dry baseline with an organic SERP estimate", () => {
  const options = parseArgs([]);

  assert.equal(options.mode, "baseline");
  assert.equal(options.domain, "compound.law");
  assert.equal(options.includeSerp, true);
  assert.equal(options.live, false);
  assert.equal(options.dryRun, true);
  assert.equal(options.maxSpendUsd, 5);
});

test("parseArgs ignores pnpm argument separators", () => {
  const options = parseArgs(["--", "--mode", "estimate", "--keywords", "alpha"]);

  assert.equal(options.mode, "estimate");
  assert.deepEqual(options.keywords, ["alpha"]);
});

test("parseArgs enables live execution only when explicitly requested", () => {
  const options = parseArgs([
    "--domain",
    "https://www.example.com/path",
    "--keywords",
    "alpha,beta",
    "--device",
    "both",
    "--include-ai-mode",
    "--include-on-page",
    "--on-page-rendering",
    "browser",
    "--include-labs",
    "--live",
    "--max-spend-usd",
    "3.50",
  ]);

  assert.equal(options.domain, "example.com");
  assert.deepEqual(options.keywords, ["alpha", "beta"]);
  assert.equal(options.device, "both");
  assert.equal(options.includeAiMode, true);
  assert.equal(options.includeOnPage, true);
  assert.equal(options.onPageRendering, "browser");
  assert.equal(options.includeLabs, true);
  assert.equal(options.live, true);
  assert.equal(options.dryRun, false);
  assert.equal(options.maxSpendUsd, 3.5);
});

test("parseArgs growth preset enables broad DataForSEO surfaces", () => {
  const options = parseArgs(["--preset", "growth"]);

  assert.equal(options.includeSerp, true);
  assert.equal(options.includeAiMode, true);
  assert.equal(options.includeOnPage, true);
  assert.equal(options.includeLabs, true);
  assert.equal(options.includeKeywordSuggestions, true);
  assert.equal(options.includeRankedKeywords, true);
  assert.equal(options.includeCompetitors, true);
  assert.equal(options.onPageRendering, "js");
});

test("parseArgs disables default SERP for OnPage result-only commands", () => {
  assert.equal(parseArgs(["--check-on-page-ready"]).includeSerp, false);
  assert.equal(parseArgs(["--on-page-task-id", "task-1"]).includeSerp, false);
  assert.equal(parseArgs(["--check-on-page-ready", "--include-serp"]).includeSerp, true);
});

test("parseArgs rejects unknown flags and invalid option values", () => {
  assert.throws(() => parseArgs(["--wat"]), /Unknown argument/);
  assert.throws(() => parseArgs(["--device", "tablet"]), /--device must be one of/);
  assert.throws(() => parseArgs(["--depth", "0"]), /--depth must be a positive integer/);
  assert.throws(() => parseArgs(["--on-page-rendering", "fast"]), /--on-page-rendering/);
});

test("normalizeDomain strips protocol, www, path, and casing", () => {
  assert.equal(normalizeDomain("HTTPS://WWW.Compound.Law/pricing?x=1"), "compound.law");
});

test("parseKeywordText deduplicates comma and newline separated keywords", () => {
  assert.deepEqual(parseKeywordText("alpha, beta\nalpha\n gamma "), ["alpha", "beta", "gamma"]);
});

test("parseKeywordInput reads JSON keyword files", () => {
  const dir = mkdtempSync(join(tmpdir(), "dataforseo-keywords-"));
  const file = join(dir, "keywords.json");
  writeFileSync(file, JSON.stringify(["alpha", "beta", "alpha"]), "utf8");

  assert.deepEqual(parseKeywordInput({ keywords: ["gamma"], keywordsFile: file }), [
    "gamma",
    "alpha",
    "beta",
  ]);
});

test("estimatePlanCost includes endpoint-specific line items", () => {
  const options = {
    device: "both",
    includeSerp: true,
    includeAiMode: true,
    includeOnPage: true,
    onPageRendering: "js",
    estimatedPages: 100,
    includeLabs: true,
    labsItemLimit: 10,
  };

  const estimate = estimatePlanCost({ keywords: ["alpha", "beta"], options });

  assert.equal(estimate.breakdown.length, 4);
  assert.equal(estimate.breakdown[0].estimatedCostUsd, 0.012);
  assert.equal(estimate.breakdown[1].estimatedCostUsd, 0.012);
  assert.equal(estimate.breakdown[2].estimatedCostUsd, 0.15);
  assert.equal(estimate.breakdown[3].estimatedCostUsd, 0.022);
  assert.equal(estimate.totalEstimatedCostUsd, 0.196);
});

test("estimatePlanCost prices growth-oriented Labs surfaces", () => {
  const options = parseArgs([
    "--no-serp",
    "--include-labs",
    "--include-keyword-suggestions",
    "--include-ranked-keywords",
    "--include-competitors",
    "--labs-item-limit",
    "10",
  ]);

  const estimate = estimatePlanCost({ keywords: ["alpha", "beta"], options });

  assert.equal(estimate.breakdown.length, 4);
  assert.equal(estimate.totalEstimatedCostUsd, 0.066);
});

test("buildBaselinePlan marks hard stop when estimate exceeds max spend", () => {
  const options = {
    ...parseArgs(["--keywords", "alpha,beta", "--include-on-page", "--estimated-pages", "1000"]),
    maxSpendUsd: 0.01,
  };

  const plan = buildBaselinePlan({ keywords: ["alpha", "beta"], options });

  assert.equal(plan.guardrails.hardStopTriggered, true);
  assert.equal(plan.plannedRequests.some((request) => request.endpoint.includes("organic")), true);
  assert.equal(plan.plannedRequests.some((request) => request.endpoint.includes("on_page")), true);
});

test("createDataForSeoAuthHeader builds a basic auth header and validates inputs", () => {
  assert.equal(
    createDataForSeoAuthHeader({ login: "user@example.com", password: "secret" }),
    `Basic ${Buffer.from("user@example.com:secret").toString("base64")}`,
  );
  assert.throws(() => createDataForSeoAuthHeader({ login: "", password: "secret" }), /required/);
});

test("normalizeSerpResponse extracts organic rows from DataForSEO payloads", () => {
  const payload = JSON.parse(
    readFileSync(
      new URL("./fixtures/dataforseo-organic-response.fixture.json", import.meta.url),
      "utf8",
    ),
  );

  assert.deepEqual(normalizeSerpResponse(payload), [
    {
      keyword: "ai legal counsel",
      type: "organic",
      rankGroup: 1,
      rankAbsolute: 1,
      domain: "compound.law",
      url: "https://compound.law/",
      title: "Compound Law",
      description: "Legal support for AI companies.",
      breadcrumb: "https://compound.law",
    },
  ]);
});

test("runLiveRequests sends one live SERP task per DataForSEO API call", async () => {
  const options = parseArgs([
    "--keywords",
    "alpha,beta",
    "--include-ai-mode",
    "--live",
    "--max-spend-usd",
    "1",
  ]);
  const plan = buildBaselinePlan({ keywords: ["alpha", "beta"], options });
  const calls = [];

  await runLiveRequests(plan, options, async ({ endpoint, tasks }) => {
    calls.push({ endpoint, tasks });
    return {
      status_code: 20000,
      status_message: "Ok.",
      cost: 0.003,
      tasks: [
        {
          data: tasks[0],
          result: [
            {
              keyword: tasks[0].keyword,
              items: [],
            },
          ],
        },
      ],
    };
  });

  assert.equal(calls.length, 4);
  assert.equal(calls.every((call) => call.tasks.length === 1), true);
  assert.equal(plan.liveResults.length, 2);
  assert.equal(plan.liveResults[0].apiCalls, 2);
  assert.equal(plan.liveResults[0].cost, 0.006);
});

test("runLiveRequests batches Labs tasks in one API call", async () => {
  const options = parseArgs([
    "--no-serp",
    "--include-labs",
    "--include-keyword-suggestions",
    "--live",
    "--max-spend-usd",
    "1",
  ]);
  const plan = buildBaselinePlan({ keywords: ["alpha", "beta"], options });
  const calls = [];

  await runLiveRequests(plan, options, async ({ endpoint, tasks }) => {
    calls.push({ endpoint, tasks });
    return {
      status_code: 20000,
      status_message: "Ok.",
      cost: 0.03,
      tasks: tasks.map((task) => ({
        data: task,
        result: [
          {
            items: [
              {
                keyword_data: {
                  keyword: task.keyword ?? task.keywords?.[0],
                  keyword_info: { search_volume: 100, cpc: 2.5 },
                },
              },
            ],
          },
        ],
      })),
    };
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.tasks.length), [2, 2]);
  assert.equal(plan.liveResults[0].labsRows.length, 2);
});

test("normalizeLabsResponse maps common keyword and competitor fields", () => {
  const rows = normalizeLabsResponse({
    tasks: [
      {
        data: { keyword: "alpha" },
        result: [
          {
            items: [
              {
                keyword_data: {
                  keyword: "alpha tools",
                  location_code: 2840,
                  language_code: "en",
                  keyword_info: {
                    search_volume: 120,
                    cpc: 4.1,
                    competition_level: "medium",
                  },
                },
                ranked_serp_element: {
                  serp_item: {
                    rank_absolute: 7,
                    domain: "compound.law",
                    url: "https://compound.law/test",
                    title: "Test",
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(rows[0].seedKeyword, "alpha");
  assert.equal(rows[0].keyword, "alpha tools");
  assert.equal(rows[0].searchVolume, 120);
  assert.equal(rows[0].rankAbsolute, 7);
  assert.equal(rows[0].domain, "compound.law");
});

test("normalizeOnPageResponse maps page-level technical fields", () => {
  const rows = normalizeOnPageResponse({
    tasks: [
      {
        result: [
          {
            items: [
              {
                url: "https://compound.law/",
                status_code: 200,
                meta: {
                  title: "Compound",
                  description: "Legal ops",
                  canonical: "https://compound.law/",
                },
                checks: { no_title: false },
                page_timing: { time_to_interactive: 123 },
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(rows[0].url, "https://compound.law/");
  assert.equal(rows[0].statusCode, 200);
  assert.equal(rows[0].title, "Compound");
  assert.deepEqual(rows[0].checks, { no_title: false });
});
