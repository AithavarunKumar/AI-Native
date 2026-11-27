#!/usr/bin/env python3
"""token_cost_estimator.py — Refund Agent, Assignment 1 Part C"""

# ── Parameters ───────────────────────────────────────────────────────
CHARS_PER_TOKEN = 4            # planning heuristic; not exact billing
SYS, KB, TKT    = 900, 5_000, 300   # character sizes per context zone
STEPS, OUT_T    = 6, 150       # loop steps; output tokens per step
TICKETS         = 8_000        # tickets per day
IN_RATE, OUT_R  = 3.00, 15.00  # USD per million tokens (input, output)

# ── Token counts ─────────────────────────────────────────────────────
BASE  = (SYS + KB + TKT) // CHARS_PER_TOKEN        # 1,550 tokens (fixed per step)
naive = sum(BASE + s * OUT_T for s in range(STEPS)) # 11,550 tokens/ticket
opt   = BASE + 5 * (BASE + OUT_T)                   # 10,050 tokens/ticket

# ── Daily costs ──────────────────────────────────────────────────────
out_cost = STEPS * OUT_T / 1e6 * OUT_R * TICKETS    # $108.00 (same both designs)
n_day    = naive / 1e6 * IN_RATE * TICKETS + out_cost
o_day    = opt   / 1e6 * IN_RATE * TICKETS + out_cost
savings  = n_day - o_day

# ── Output ───────────────────────────────────────────────────────────
print(f"Baseline input tokens/step : {BASE:,}")
print(f"Naive    tokens/ticket     : {naive:,}  →  ${n_day:,.2f}/day")
print(f"Optimised tokens/ticket    : {opt:,}  →  ${o_day:,.2f}/day")
print(f"Daily savings              : ${savings:.2f}  |  Annual: ${savings * 365:,.2f}")
print()
print("Assumption: 4 chars/token is a planning heuristic, not a billing-exact tokeniser.")
