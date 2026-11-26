import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ServiceForgeClient, ServiceForgeError } from "./serviceforge.js";

const BASE_URL = process.env.SERVICEFORGE_BASE_URL ?? "http://localhost:8080";
const TRAVEL_BUFFER_MINUTES = 45;

const client = new ServiceForgeClient(BASE_URL);

const server = new McpServer({
  name: "serviceforge-dispatch",
  version: "1.0.0",
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasConflict(
  wStart: Date,
  wEnd: Date,
  jobStart: Date,
  jobEnd: Date
): boolean {
  const bufferMs = TRAVEL_BUFFER_MINUTES * 60 * 1000;
  const blockedStart = new Date(jobStart.getTime() - bufferMs);
  const blockedEnd = new Date(jobEnd.getTime() + bufferMs);
  // Overlap: proposed window starts before blocked end AND ends after blocked start
  return wStart < blockedEnd && wEnd > blockedStart;
}

function toolText(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function toolError(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    isError: true as const,
  };
}

// ─── Tool: get_technician_availability ────────────────────────────────────────

server.registerTool(
  "get_technician_availability",
  {
    description:
      "Use when the dispatcher asks whether a named technician (by ID) or any technician with a specific skill is free for a job window. Applies the 45-minute travel buffer — a technician is unavailable if any existing job overlaps the requested window expanded by 45 minutes on each side. Provide at least one of technicianId or skill.",
    inputSchema: {
      technicianId: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "Numeric technician ID. Provide this, skill, or both to narrow results."
        ),
      skill: z
        .string()
        .optional()
        .describe(
          "Required skill (e.g. 'HVAC', 'Electrical'). Returns all technicians who have this skill."
        ),
      windowStart: z
        .string()
        .describe(
          "ISO 8601 datetime for the start of the proposed job window (e.g. '2026-11-25T14:00:00')."
        ),
      windowEnd: z
        .string()
        .describe(
          "ISO 8601 datetime for the end of the proposed job window (e.g. '2026-11-25T16:00:00')."
        ),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ technicianId, skill, windowStart, windowEnd }) => {
    if (!technicianId && !skill) {
      return toolError(
        "Provide at least one of technicianId or skill to filter technicians."
      );
    }

    const wStart = new Date(windowStart);
    const wEnd = new Date(windowEnd);

    if (isNaN(wStart.getTime()) || isNaN(wEnd.getTime())) {
      return toolError(
        `Invalid datetime — use ISO 8601 format (e.g. '2026-11-25T14:00:00').`
      );
    }
    if (wEnd <= wStart) {
      return toolError("windowEnd must be after windowStart.");
    }

    let allTechnicians;
    try {
      allTechnicians = await client.getTechnicians();
    } catch (err) {
      return toolError(
        err instanceof Error ? err.message : "Failed to reach ServiceForge."
      );
    }

    let candidates = allTechnicians;
    if (technicianId !== undefined) {
      candidates = candidates.filter((t) => t.id === technicianId);
      if (candidates.length === 0) {
        return toolError(
          `No technician with id ${technicianId}. Known ids: ${allTechnicians.map((t) => t.id).join(", ")}.`
        );
      }
    }
    if (skill) {
      candidates = candidates.filter((t) =>
        (t.skills ?? []).some(
          (s) => s.toLowerCase() === skill.toLowerCase()
        )
      );
      if (candidates.length === 0) {
        const allSkills = [
          ...new Set(allTechnicians.flatMap((t) => t.skills ?? [])),
        ].join(", ");
        return toolError(
          `No technicians found with skill '${skill}'. Known skills: ${allSkills}.`
        );
      }
    }

    const results = await Promise.all(
      candidates.map(async (tech) => {
        let jobs;
        try {
          jobs = await client.getTechnicianJobs(tech.id);
        } catch (err) {
          return {
            technician: tech,
            available: false,
            reason:
              err instanceof Error ? err.message : "Failed to fetch jobs.",
            conflictingJobs: [] as typeof jobs,
          };
        }

        const conflicts = jobs.filter((job) => {
          const jobStart = new Date(job.startTime);
          const jobEnd = new Date(job.endTime);
          return hasConflict(wStart, wEnd, jobStart, jobEnd);
        });

        return {
          technician: tech,
          available: conflicts.length === 0,
          reason:
            conflicts.length > 0
              ? `Blocked by ${conflicts.length} job(s) (45-min buffer applied): ${conflicts
                  .map(
                    (j) =>
                      `job ${j.id} for ${j.customerName} [${j.startTime} – ${j.endTime}]`
                  )
                  .join("; ")}`
              : undefined,
          conflictingJobs: conflicts,
        };
      })
    );

    const available = results.filter((r) => r.available);
    const unavailable = results.filter((r) => !r.available);

    const output = {
      windowStart,
      windowEnd,
      travelBufferMinutes: TRAVEL_BUFFER_MINUTES,
      available: available.map((r) => ({
        id: r.technician.id,
        name: r.technician.name,
        skills: r.technician.skills,
        region: r.technician.region,
      })),
      unavailable: unavailable.map((r) => ({
        id: r.technician.id,
        name: r.technician.name,
        skills: r.technician.skills,
        reason: r.reason,
      })),
    };

    return toolText(JSON.stringify(output, null, 2));
  }
);

// ─── Tool: get_part_stock ─────────────────────────────────────────────────────

server.registerTool(
  "get_part_stock",
  {
    description:
      "Use when the dispatcher asks whether a part can be committed to a job, or how many units remain after existing reservations. Input must be a sku (e.g. 'CMP-CLUTCH'), not a free-text part name. If you only have a part name, resolve it first from the serviceforge://catalog/parts resource.",
    inputSchema: {
      sku: z
        .string()
        .min(1)
        .describe(
          "The part SKU (e.g. 'CMP-CLUTCH'). Resolve from the parts catalog resource if you only have a part name."
        ),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ sku }) => {
    try {
      const part = await client.getPart(sku);
      return toolText(JSON.stringify(part, null, 2));
    } catch (err) {
      if (err instanceof ServiceForgeError && err.statusCode === 404) {
        try {
          const allParts = await client.getParts();
          const known = allParts.map((p) => `${p.sku} (${p.name})`).join(", ");
          return toolError(
            `Unknown sku '${sku}'. Known SKUs: ${known}. Use the serviceforge://catalog/parts resource to browse by name.`
          );
        } catch {
          return toolError(
            `Unknown sku '${sku}'. Could not list alternatives — ServiceForge may be down.`
          );
        }
      }
      return toolError(
        err instanceof Error ? err.message : "Failed to reach ServiceForge."
      );
    }
  }
);

// ─── Tool: reserve_part_for_job ───────────────────────────────────────────────

server.registerTool(
  "reserve_part_for_job",
  {
    description:
      "Use only after the dispatcher has explicitly confirmed they want to hold stock for a specific job. This is the only write operation — it POSTs a reservation to ServiceForge. Always call get_part_stock first to confirm availability, and require human confirmation before calling this.",
    inputSchema: {
      sku: z
        .string()
        .min(1)
        .describe("The part SKU to reserve (e.g. 'CMP-CLUTCH')."),
      jobId: z
        .number()
        .int()
        .positive()
        .describe("The numeric ID of the job to reserve stock for."),
      quantity: z
        .number()
        .int()
        .min(1)
        .describe("Number of units to reserve. Must be at least 1."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  async ({ sku, jobId, quantity }) => {
    try {
      const reservation = await client.reservePart(sku, jobId, quantity);
      return toolText(
        JSON.stringify(
          {
            success: true,
            message: `Reserved ${quantity}× ${sku} for job ${jobId}.`,
            reservation,
          },
          null,
          2
        )
      );
    } catch (err) {
      if (err instanceof ServiceForgeError) {
        if (err.statusCode === 404) {
          return toolError(
            `Reservation failed — not found: ${err.message}. Verify sku and jobId are correct.`
          );
        }
        if (err.statusCode === 409) {
          return toolError(
            `Reservation failed — insufficient stock: ${err.message}.`
          );
        }
        if (err.statusCode === 400) {
          return toolError(
            `Reservation failed — invalid request: ${err.message}. quantity must be ≥ 1 and jobId must be provided.`
          );
        }
      }
      return toolError(
        err instanceof Error ? err.message : "Failed to reach ServiceForge."
      );
    }
  }
);

// ─── Resource: Parts Catalog ──────────────────────────────────────────────────

server.registerResource(
  "Parts Catalog",
  "serviceforge://catalog/parts",
  {
    description:
      "Current parts catalog with SKUs, names, quantity on hand, reserved units, and net available. Use this to resolve a part name to a SKU before calling get_part_stock or reserve_part_for_job.",
    mimeType: "application/json",
  },
  async (_uri) => {
    try {
      const parts = await client.getParts();
      return {
        contents: [
          {
            uri: "serviceforge://catalog/parts",
            mimeType: "application/json",
            text: JSON.stringify(parts, null, 2),
          },
        ],
      };
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to reach ServiceForge.";
      return {
        contents: [
          {
            uri: "serviceforge://catalog/parts",
            mimeType: "text/plain",
            text: `Error loading parts catalog: ${msg}`,
          },
        ],
      };
    }
  }
);

// ─── Resource: Dispatch Brief ─────────────────────────────────────────────────

server.registerResource(
  "Dispatch Brief",
  "serviceforge://session/dispatch-brief",
  {
    description:
      "Structured brief of open jobs this afternoon (12:00–20:00 today), assigned technicians, and parts inventory snapshot. Inject at session start so the agent has current dispatch state without additional tool calls. For live availability checks, use get_technician_availability.",
    mimeType: "application/json",
  },
  async (_uri) => {
    try {
      const [technicians, allParts] = await Promise.all([
        client.getTechnicians(),
        client.getParts(),
      ]);

      // Fetch each technician's jobs in parallel (avoids needing a /api/jobs endpoint)
      const techJobsList = await Promise.all(
        technicians.map((t) =>
          client.getTechnicianJobs(t.id).then((jobs) => ({ tech: t, jobs }))
        )
      );

      const now = new Date();
      const noonToday = new Date(now);
      noonToday.setHours(12, 0, 0, 0);
      const endOfDay = new Date(now);
      endOfDay.setHours(20, 0, 0, 0);

      const afternoonJobs = techJobsList.flatMap(({ tech, jobs }) =>
        jobs
          .filter((j) => {
            const start = new Date(j.startTime);
            return start >= noonToday && start <= endOfDay;
          })
          .map((j) => ({
            jobId: j.id,
            customerName: j.customerName,
            window: { start: j.startTime, end: j.endTime },
            status: j.status,
            assignedTechnician: { id: tech.id, name: tech.name, skills: tech.skills },
          }))
      );

      const brief = {
        generatedAt: now.toISOString(),
        window: {
          from: noonToday.toISOString(),
          to: endOfDay.toISOString(),
        },
        openJobsThisAfternoon: afternoonJobs,
        technicianRoster: technicians.map((t) => ({
          id: t.id,
          name: t.name,
          skills: t.skills,
          region: t.region,
        })),
        partsSnapshot: allParts.map((p) => ({
          sku: p.sku,
          name: p.name,
          available: p.available,
          reserved: p.reserved,
        })),
      };

      return {
        contents: [
          {
            uri: "serviceforge://session/dispatch-brief",
            mimeType: "application/json",
            text: JSON.stringify(brief, null, 2),
          },
        ],
      };
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to reach ServiceForge.";
      return {
        contents: [
          {
            uri: "serviceforge://session/dispatch-brief",
            mimeType: "text/plain",
            text: `Error generating dispatch brief: ${msg}`,
          },
        ],
      };
    }
  }
);

// ─── Prompt: prep-job-dispatch ────────────────────────────────────────────────

server.registerPrompt(
  "prep-job-dispatch",
  {
    description:
      "Invoke to prepare a full dispatch check for a specific job: guides the agent through reading dispatch state, checking technician availability, checking parts stock, and confirming before any reservation.",
    argsSchema: {
      jobId: z
        .string()
        .min(1)
        .describe("The job ID to prepare dispatch for (e.g. '4')."),
    },
  },
  async ({ jobId }) => {
    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Prepare a dispatch check for job ${jobId}. Follow these steps in order:

1. **Read the dispatch brief** — the host should already have serviceforge://session/dispatch-brief in context. If not, say so and stop — the brief is required to understand current assignments and avoid re-dispatching work already assigned.

2. **Find the job** — from the brief, locate job ${jobId}. Note its window (start/end), requiredSkill, assigned technician, and customer name. If job ${jobId} is not in the brief, it may be outside today's afternoon window; ask the dispatcher to confirm the job exists and its time window.

3. **Check technician availability** — call get_technician_availability with the job's window and requiredSkill as the skill filter. The tool enforces the 45-minute travel buffer. Report back:
   - Which technicians with the required skill are free for the window
   - Which are blocked and why (which existing jobs conflict, including buffer)

4. **Identify required parts** — based on the requiredSkill for job ${jobId}, determine likely needed parts:
   - HVAC jobs → check CMP-CLUTCH (compressor clutch) and HVAC-FILTER (air filter)
   - Electrical jobs → check ELEC-BREAKER (circuit breaker 20A)
   - Plumbing jobs → check PLMB-VALVE (shutoff valve 3/4in)
   - If the skill does not match any of the above or you are unsure, ask the dispatcher.

   Before calling get_part_stock, verify each SKU against serviceforge://catalog/parts.

5. **Check part stock** — call get_part_stock for each required part SKU. Report the available quantity after existing reservations.

6. **Summarise and ask for confirmation** — give the dispatcher a clear summary:
   - Available technicians for the window (name, skills, region)
   - Parts: in stock (sku, name, available units) vs. short
   - Ask explicitly: "Do you want to proceed? If so, confirm the technician and I will reserve the parts."

7. **Reserve only after explicit confirmation** — do NOT call reserve_part_for_job until the dispatcher says yes. After confirmation, call reserve_part_for_job for each part and report the reservation result.`,
          },
        },
      ],
    };
  }
);

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
