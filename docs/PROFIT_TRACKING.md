# Rose Legacy — Net Profit Tracking

Documentation of the real net-profit feature added across the Rose Legacy apps.
This feature turns "how much did I collect?" (revenue) into "how much did I
actually make?" (net profit) by capturing the real cost behind each job and
subtracting fixed monthly overhead.

_Last updated: 2026-09-20_

---

## 1. The problem it solves

Invoices only showed a single total charged to the client. There was no way to
see net profit, because materials, helper pay, and monthly overhead were never
subtracted. The dashboards showed **revenue** but labeled/felt like **profit** —
misleading numbers. This feature captures the real cost per job and computes
true net profit.

**Net profit formula (per job):**

```
Charged (invoice total)
  − Materials
  − Helpers (per hour, or a flat per-day/per-job price)
  − Your own labor  ← only when it's set as a personal salary (see §4)
  = Job gross profit / "stays in the business"
```

**Monthly:**

```
Sum of paid jobs' gross  −  fixed monthly overhead  =  Net profit for the month
```

Overhead is only charged to months that actually had paid work, so empty months
don't show a misleading negative.

---

## 2. Architecture (shared database)

Both apps read/write the **same Supabase project** — `Rose Legacy Managment`
(project ref `wrlwhnjqnsfkpyihumqd`). So cost data captured in the invoice app
shows up automatically in the work-management dashboard. No double entry.

| App | Repo | Role in this feature |
|-----|------|----------------------|
| Invoice app | `handsfree8/invoice-2.0` (Vercel `invoice-2-0`) | **Captures** cost per invoice + overhead; shows net profit in its KPI panel |
| Work management | `handsfree8/Rose-legacy-work-managment` (Vercel `rose-legacy-work-management`) | **Reads** the shared data; shows net profit on its Dashboard |

Two new tables hold everything; **no existing table was modified**.

---

## 3. Database schema (new, additive)

Applied via Supabase migrations. Existing tables (`invoices`, `invoice_items`,
`tickets`, `properties`, …) were never altered.

### `job_costs` — the cost behind each invoice

```sql
create table public.job_costs (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid references public.invoices(id) on delete cascade,
  user_id      uuid default auth.uid() references auth.users(id) on delete set null,
  materials    jsonb not null default '[]',   -- [{desc, amount}]
  my_hours     numeric not null default 0,
  my_rate      numeric not null default 50,   -- min labor rate
  helpers      jsonb not null default '[]',   -- [{name, mode:'hour'|'flat', hours, rate, flat}]
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One cost record per invoice (required for the app's upsert on invoice_id)
alter table public.job_costs
  add constraint job_costs_invoice_id_key unique (invoice_id);
```

### `overhead_settings` — fixed monthly costs + labor mode

```sql
create table public.overhead_settings (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid default auth.uid() references auth.users(id) on delete set null,
  items              jsonb not null default '[]',   -- [{label, amount}]
  effective_from     date not null default current_date,
  own_labor_as_cost  boolean not null default false, -- see §4
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
```

### Security (RLS)

Both tables have RLS enabled with the same `authenticated_full_access` policy the
rest of the schema uses (full access for the `authenticated` role only — the
`anon` role reads nothing). The work-management dashboard reads via the
server-side **admin (service-role)** client, which is how it already reads
`invoices`/`tickets`.

Migrations applied (in order):
1. `add_profit_tracking_module` — creates both tables + RLS + updated_at trigger.
2. `fix_job_costs_invoice_unique_constraint` — replaced a partial unique index
   with a full `unique(invoice_id)` constraint so `upsert(onConflict: 'invoice_id')` works.
3. `add_own_labor_mode_to_overhead` — adds `own_labor_as_cost`.

---

## 4. Own labor: capital vs. salary (the toggle)

Christopher runs the business as a side business alongside a full-time job, so he
does **not** currently pay himself a wage — his labor stays in the business as
reinvested capital. So by default his own labor is **not** subtracted from profit;
it's shown as a "reinvested capital / shadow wage" reference.

A toggle in the overhead settings — **"Count my labor as a personal salary
(real cost)"** — flips this:

- **OFF (default, current phase):** own labor is retained capital, not deducted.
  Headline reads _"Stays in the business."_
- **ON (future, when running the business full-time):** own labor is deducted as
  a real cost. Headline reads _"Net profit."_

The setting lives in `overhead_settings.own_labor_as_cost` and both apps respect it.

Materials and helpers are **always** deducted (real cash out of pocket).

---

## 5. Invoice app (`invoice-2.0`) — status: ✅ in production

Files changed: `index.html`, `app.js`, `style.css`.

- **Per-invoice cost capture:** a **Cost / Profit** button on each invoice in the
  history opens a modal to enter materials, your hours × rate ($50 min), and
  helpers (each either **Hourly** or **Flat rate** per day/job). Saved to
  `job_costs` (upsert by `invoice_id`). Button shows **✓ Cost** once captured.
- **Fixed costs:** an **Adjust fixed costs** panel edits `overhead_settings`
  (insurance, tools, vehicle…) plus the labor-mode toggle.
- **KPI panel upgrade:** the previously revenue-only "Monthly Profit" panel now
  has a real **Net Profit band** (this month, net year, fixed costs, and a
  coverage note of how many paid invoices have costs captured), and a **Net
  Profit** column in the 12-month breakdown.
- UI is in English to match the rest of the app.

Merged to `main` and promoted to production by Christopher.

---

## 6. Work-management app (`Rose-legacy-work-managment`) — status: 🚧 in review

Branch: `feature/dashboard-profit-v2` (based on current `origin/master`).

Files changed: `lib/kpis.ts`, `app/dashboard/page.tsx`, `app/dashboard/charts.tsx`.

- `lib/kpis.ts`: `profitByMonth()` now also takes `job_costs` + `overhead_settings`
  and computes per-month `cost` and `net`, plus summary `netThisMonth`, `netYtd`,
  `overheadMonthly`, `ownLaborAsCost`, and coverage counts. New exported types
  `JobCostRow`, `OverheadRow`.
- `app/dashboard/page.tsx`: fetches `job_costs` + `overhead_settings` (admin
  client) and passes them to `profitByMonth`. Section renamed
  "Revenue" → "Revenue & Net Profit".
- `app/dashboard/charts.tsx`: `ProfitSection` gains a **Net Profit band** above
  the existing revenue KPIs (this month, net year, fixed costs, coverage). The
  revenue KPIs and 12-month chart are unchanged.

### ⚠️ Open item

The `feature/dashboard-profit-v2` Vercel **preview build failed** and the exact
cause was still being diagnosed when this doc was written. Local checks that
passed: `tsc --noEmit` (whole project) and `eslint` on the three changed files.
Local `next build` could not be used to confirm because this environment cannot
reach Google Fonts (it fails at font fetch, before reaching app code). **Next
step: read the actual Vercel build log for deployment `4d0ab5d` to find the
real error, fix, and re-push.** Do NOT merge until the preview builds green.

### 🧹 Cleanup

An earlier branch, `feature/dashboard-net-profit`, was built on a **3-month-stale
local copy** of this repo (before login, the Dashboard tab, Users, Tenants, etc.
existed). **It must NOT be merged** — merging would revert 116 commits of
production work. Delete that branch/PR on GitHub. The local `master` has since
been fast-forwarded to `origin/master`.

---

## 7. How the two apps connect

1. In the **invoice app**, mark an invoice **Paid** and capture its cost
   (materials, helpers, your hours).
2. Set your **fixed monthly costs** once (either app's data is shared).
3. **Net profit** appears in both the invoice app KPI panel and the
   work-management **Dashboard** — same numbers, because it's the same database.

The more paid invoices have costs captured, the more exact the net figure; the
coverage note in each app shows the ratio.
