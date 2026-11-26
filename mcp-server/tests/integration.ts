/**
 * Integration test: spawns the MCP server and sends real JSON-RPC messages over stdio.
 * Run with: npx tsx tests/integration.ts
 * Requires backend running on http://localhost:8080
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "../dist/index.js");

// ─── MCP stdio protocol helpers (SDK v1.32.2 uses newline-delimited JSON) ─────

function encode(msg: object): Buffer {
  return Buffer.from(JSON.stringify(msg) + "\n");
}

function parseMessages(buf: Buffer): object[] {
  return buf
    .toString()
    .split("\n")
    .filter((l) => l.trim())
    .flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
}

// ─── Test runner ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// ─── Start server and collect responses ───────────────────────────────────────

const server = spawn(process.execPath, [serverPath], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, SERVICEFORGE_BASE_URL: "http://localhost:8080" },
});

const responses: Map<number, object> = new Map();
let rawBuf = Buffer.alloc(0);

server.stdout.on("data", (chunk: Buffer) => {
  rawBuf = Buffer.concat([rawBuf, chunk]);
  for (const msg of parseMessages(rawBuf)) {
    const m = msg as { id?: number };
    if (m.id !== undefined) responses.set(m.id, msg);
  }
});

server.stderr.on("data", (d: Buffer) => {
  process.stderr.write(`[server] ${d}`);
});

function send(msg: object) {
  server.stdin.write(encode(msg));
}

function waitFor(id: number, timeoutMs = 5000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const poll = setInterval(() => {
      const r = responses.get(id);
      if (r) { clearInterval(poll); resolve(r as Record<string, unknown>); return; }
      if (Date.now() > deadline) { clearInterval(poll); reject(new Error(`Timeout waiting for id=${id}`)); }
    }, 50);
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function run() {
  // Give server a moment to boot
  await new Promise((r) => setTimeout(r, 1000));

  // 1. Initialize
  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test-client", version: "1.0" },
  }});
  const init = await waitFor(1, 10000);
  console.log("\n── initialize ──────────────────────────────");
  ok("server name is serviceforge-dispatch", (init as any).result?.serverInfo?.name === "serviceforge-dispatch");
  ok("tools capability advertised", !!(init as any).result?.capabilities?.tools);
  ok("resources capability advertised", !!(init as any).result?.capabilities?.resources);
  ok("prompts capability advertised", !!(init as any).result?.capabilities?.prompts);
  send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });

  // 2. List tools
  send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const toolsList = await waitFor(2);
  const tools: any[] = (toolsList as any).result?.tools ?? [];
  const toolNames = tools.map((t: any) => t.name);
  console.log("\n── tools/list ──────────────────────────────");
  ok("get_technician_availability present", toolNames.includes("get_technician_availability"));
  ok("get_part_stock present", toolNames.includes("get_part_stock"));
  ok("reserve_part_for_job present", toolNames.includes("reserve_part_for_job"));
  ok("exactly 3 tools", tools.length === 3, `got ${tools.length}`);

  const avail = tools.find((t: any) => t.name === "get_technician_availability");
  ok("availability tool has readOnlyHint", avail?.annotations?.readOnlyHint === true);
  const reserve = tools.find((t: any) => t.name === "reserve_part_for_job");
  ok("reserve tool readOnlyHint is false", reserve?.annotations?.readOnlyHint === false);

  // 3. List resources
  send({ jsonrpc: "2.0", id: 3, method: "resources/list", params: {} });
  const resourcesList = await waitFor(3);
  const resources: any[] = (resourcesList as any).result?.resources ?? [];
  const uris = resources.map((r: any) => r.uri);
  console.log("\n── resources/list ──────────────────────────");
  ok("catalog/parts resource present", uris.includes("serviceforge://catalog/parts"));
  ok("dispatch-brief resource present", uris.includes("serviceforge://session/dispatch-brief"));
  ok("exactly 2 resources", resources.length === 2, `got ${resources.length}`);

  // 4. List prompts
  send({ jsonrpc: "2.0", id: 4, method: "prompts/list", params: {} });
  const promptsList = await waitFor(4);
  const prompts: any[] = (promptsList as any).result?.prompts ?? [];
  const promptNames = prompts.map((p: any) => p.name);
  console.log("\n── prompts/list ────────────────────────────");
  ok("prep-job-dispatch present", promptNames.includes("prep-job-dispatch"));
  ok("exactly 1 prompt", prompts.length === 1, `got ${prompts.length}`);

  // 5. Tool: get_part_stock — known SKU
  send({ jsonrpc: "2.0", id: 5, method: "tools/call", params: {
    name: "get_part_stock",
    arguments: { sku: "CMP-CLUTCH" },
  }});
  const stockRes = await waitFor(5, 8000);
  const stockText = (stockRes as any).result?.content?.[0]?.text ?? "";
  const stock = JSON.parse(stockText);
  console.log("\n── get_part_stock (CMP-CLUTCH) ─────────────");
  ok("sku is CMP-CLUTCH", stock.sku === "CMP-CLUTCH");
  ok("quantityOnHand is 3", stock.quantityOnHand === 3);
  ok("available field present", typeof stock.available === "number");
  ok("isError not set", !(stockRes as any).result?.isError);

  // 6. Tool: get_part_stock — unknown SKU returns actionable error
  send({ jsonrpc: "2.0", id: 6, method: "tools/call", params: {
    name: "get_part_stock",
    arguments: { sku: "BOGUS-999" },
  }});
  const badStock = await waitFor(6, 8000);
  const badText: string = (badStock as any).result?.content?.[0]?.text ?? "";
  console.log("\n── get_part_stock (unknown SKU) ────────────");
  ok("isError set for unknown sku", (badStock as any).result?.isError === true);
  ok("error mentions 'BOGUS-999'", badText.includes("BOGUS-999"));
  ok("error lists known SKUs", badText.includes("CMP-CLUTCH"));

  // 7. Tool: get_technician_availability — by skill
  const now = new Date();
  const wStart = new Date(now); wStart.setHours(16, 0, 0, 0);
  const wEnd = new Date(now); wEnd.setHours(18, 0, 0, 0);
  send({ jsonrpc: "2.0", id: 7, method: "tools/call", params: {
    name: "get_technician_availability",
    arguments: {
      skill: "HVAC",
      windowStart: wStart.toISOString().slice(0, 19),
      windowEnd: wEnd.toISOString().slice(0, 19),
    },
  }});
  const availRes = await waitFor(7, 8000);
  const availText = (availRes as any).result?.content?.[0]?.text ?? "";
  const availData = JSON.parse(availText);
  console.log("\n── get_technician_availability (HVAC, 16-18h) ─");
  ok("isError not set", !(availRes as any).result?.isError);
  ok("travelBufferMinutes is 45", availData.travelBufferMinutes === 45);
  ok("available + unavailable arrays present",
    Array.isArray(availData.available) && Array.isArray(availData.unavailable));
  ok("only HVAC technicians returned",
    [...availData.available, ...availData.unavailable]
      .every((t: any) => (t.skills ?? []).includes("HVAC")));

  // 8. Tool: get_technician_availability — missing both filters
  send({ jsonrpc: "2.0", id: 8, method: "tools/call", params: {
    name: "get_technician_availability",
    arguments: { windowStart: wStart.toISOString().slice(0, 19), windowEnd: wEnd.toISOString().slice(0, 19) },
  }});
  const missingFilter = await waitFor(8, 8000);
  console.log("\n── get_technician_availability (no filter) ─");
  ok("isError when no technicianId or skill", (missingFilter as any).result?.isError === true);

  // 9. Resource: catalog/parts
  send({ jsonrpc: "2.0", id: 9, method: "resources/read", params: { uri: "serviceforge://catalog/parts" }});
  const catalogRes = await waitFor(9, 8000);
  const catalogText = (catalogRes as any).result?.contents?.[0]?.text ?? "";
  const catalog = JSON.parse(catalogText);
  console.log("\n── resource: catalog/parts ─────────────────");
  ok("returns array", Array.isArray(catalog));
  ok("CMP-CLUTCH in catalog", catalog.some((p: any) => p.sku === "CMP-CLUTCH"));
  ok("HVAC-FILTER in catalog", catalog.some((p: any) => p.sku === "HVAC-FILTER"));
  ok("each entry has available field", catalog.every((p: any) => typeof p.available === "number"));

  // 10. Resource: dispatch-brief
  send({ jsonrpc: "2.0", id: 10, method: "resources/read", params: { uri: "serviceforge://session/dispatch-brief" }});
  const briefRes = await waitFor(10, 8000);
  const briefText = (briefRes as any).result?.contents?.[0]?.text ?? "";
  const brief = JSON.parse(briefText);
  console.log("\n── resource: dispatch-brief ────────────────");
  ok("has openJobsThisAfternoon array", Array.isArray(brief.openJobsThisAfternoon));
  ok("has technicianRoster array", Array.isArray(brief.technicianRoster));
  ok("has partsSnapshot array", Array.isArray(brief.partsSnapshot));
  ok("technician roster has 3 entries", brief.technicianRoster.length === 3);
  ok("each technician has skills", brief.technicianRoster.every((t: any) => Array.isArray(t.skills)));

  // 11. Prompt: prep-job-dispatch
  send({ jsonrpc: "2.0", id: 11, method: "prompts/get", params: { name: "prep-job-dispatch", arguments: { jobId: "4" } }});
  const promptRes = await waitFor(11, 8000);
  const messages: any[] = (promptRes as any).result?.messages ?? [];
  console.log("\n── prompt: prep-job-dispatch ───────────────");
  ok("returns at least 1 message", messages.length >= 1);
  ok("message role is user", messages[0]?.role === "user");
  const promptText: string = messages[0]?.content?.text ?? "";
  ok("mentions job 4", promptText.includes("job 4"));
  ok("mentions dispatch-brief", promptText.includes("dispatch-brief"));
  ok("mentions reserve_part_for_job", promptText.includes("reserve_part_for_job"));
  ok("mentions confirmation step", promptText.toLowerCase().includes("confirm"));

  // 12. Tool: reserve_part_for_job — 409 insufficient stock
  send({ jsonrpc: "2.0", id: 12, method: "tools/call", params: {
    name: "reserve_part_for_job",
    arguments: { sku: "CMP-CLUTCH", jobId: 1, quantity: 99 },
  }});
  const over = await waitFor(12, 8000);
  const overText: string = (over as any).result?.content?.[0]?.text ?? "";
  console.log("\n── reserve_part_for_job (over-reserve) ─────");
  ok("isError set for insufficient stock", (over as any).result?.isError === true);
  ok("error mentions insufficient stock", overText.toLowerCase().includes("insufficient"));

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(44)}`);
  console.log(`Result: ${passed} passed, ${failed} failed`);
  server.kill();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Test runner error:", err);
  server.kill();
  process.exit(1);
});
