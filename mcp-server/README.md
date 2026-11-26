# ServiceForge Dispatcher MCP Server

A local MCP server that gives a dispatcher agent structured access to ServiceForge — technician availability (with the 45-minute travel buffer), parts stock, and part reservations — over stdio.

## Prerequisites

- Node.js 18+
- ServiceForge backend running (`mvn spring-boot:run` from `backend/`)

## Build & run

```bash
cd mcp-server
npm install      # already done if node_modules/ exists
npm run build    # tsc → dist/
npm start        # node dist/index.js
```

For development without a build step:

```bash
npm run dev      # tsx src/index.ts
```

## Connecting to a host

Paste this into your MCP host config (Claude Desktop, VS Code Copilot, etc.):

```json
{
  "mcpServers": {
    "serviceforge-dispatch": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/absolute/path/to/ServiceForge/mcp-server",
      "env": {
        "SERVICEFORGE_BASE_URL": "http://localhost:8080"
      }
    }
  }
}
```

`SERVICEFORGE_BASE_URL` defaults to `http://localhost:8080` if omitted.

### Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "serviceforge-dispatch": {
      "command": "node",
      "args": ["/absolute/path/to/ServiceForge/mcp-server/dist/index.js"],
      "env": {
        "SERVICEFORGE_BASE_URL": "http://localhost:8080"
      }
    }
  }
}
```

### VS Code (`.vscode/mcp.json`)

```json
{
  "inputs": [],
  "servers": {
    "serviceforge-dispatch": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/mcp-server/dist/index.js"],
      "env": {
        "SERVICEFORGE_BASE_URL": "http://localhost:8080"
      }
    }
  }
}
```

## What the server exposes

### Tools (model calls these)

| Tool | When to use | Side effect? |
|---|---|---|
| `get_technician_availability` | Dispatcher asks whether a technician (by ID) or any technician with a skill is free for a window. Applies the 45-minute travel buffer. | No |
| `get_part_stock` | Dispatcher asks how many units of a SKU are available after existing reservations. Input is a SKU — resolve name → SKU from the catalog resource first. | No |
| `reserve_part_for_job` | Dispatcher has explicitly confirmed they want to hold stock for a job. Only write operation. | Yes — POST to ServiceForge |

### Resources (host injects these)

| URI | What it is |
|---|---|
| `serviceforge://catalog/parts` | Current parts catalog: SKU, name, quantity on hand, reserved, available. Use to resolve a part name to a SKU. |
| `serviceforge://session/dispatch-brief` | Generated brief of open jobs this afternoon (12:00–20:00 today), assigned technicians, and parts inventory snapshot. Inject at session start. |

### Prompts (user invokes)

| Name | Argument | What it does |
|---|---|---|
| `prep-job-dispatch` | `jobId` (required) | Step-by-step dispatch workflow: read the brief → check technician availability → identify and check parts → summarise and confirm → reserve only after yes. |

## Seeded data

**Technicians** (from MockDataStore):

| ID | Name | Skills | Region |
|---|---|---|---|
| 1 | Jordan Reyes | HVAC, Electrical | North |
| 2 | Priya Nair | Plumbing, HVAC | South |
| 3 | Sam Okafor | Electrical, Appliance | East |

**Parts catalog** (from MockDataStore):

| SKU | Name | On Hand |
|---|---|---|
| `CMP-CLUTCH` | Compressor Clutch | 3 |
| `HVAC-FILTER` | HVAC Air Filter | 15 |
| `ELEC-BREAKER` | Circuit Breaker 20A | 8 |
| `PLMB-VALVE` | Shutoff Valve 3/4in | 5 |

> There is no `compressor clutch` by another name — `CMP-CLUTCH` is the canonical SKU. If you don't see it in `GET /api/parts`, the backend needs to be restarted so the in-memory store re-seeds.

**Jobs seeded today**:

| ID | Customer | Technician | Window | Skill |
|---|---|---|---|---|
| 1 | Acme Corp | Jordan Reyes | 09:00–11:00 | HVAC |
| 2 | Northwind Traders | Jordan Reyes | 14:00–15:30 | Electrical |
| 3 | Globex | Priya Nair | 10:00–12:00 | Plumbing |
| 4 | Riverside Clinic | Sam Okafor | 15:30–17:00 | Electrical |

Job 4 (Riverside Clinic, 15:30–17:00) is the "job this afternoon" in the original prompt. Use it to demonstrate the full dispatch flow.

## The 45-minute travel buffer

Encoded in `TechnicianAvailabilityService.TRAVEL_BUFFER_MINUTES = 45` in the backend and replicated identically in the MCP server's `hasConflict()` function. A technician is available for window [wStart, wEnd] only if no existing job has an effective blocked interval [job.start − 45 min, job.end + 45 min] that overlaps [wStart, wEnd].

This means Jordan Reyes (job 2 ending 15:30) is blocked until 16:15 due to the outbound travel buffer. Sam Okafor (job 4 starting 15:30) is blocked from 14:45 onwards due to the inbound buffer.

## Error responses

The server maps ServiceForge HTTP errors to actionable model messages:

- **404**: `"Unknown sku 'XYZ'. Known SKUs: CMP-CLUTCH (Compressor Clutch), ..."` — model can recover by correcting the SKU.
- **409**: `"Insufficient stock for CMP-CLUTCH: requested 2, available 1."` — model can offer to reserve 1 instead.
- **400**: `"Invalid request: quantity must be ≥ 1 and jobId must be provided."` — model can re-prompt the dispatcher.
- **Backend down**: `"ServiceForge at http://localhost:8080 did not respond: ... Is mvn spring-boot:run up?"` — model can tell the dispatcher rather than hanging.
