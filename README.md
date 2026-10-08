# Team Tasks — Version 1

An internal app for assigning work, breaking it into subtasks of any depth, tracking what is blocked and why, and keeping a permanent history of everything that has been completed.

**Stack:** Next.js 15 (App Router, TypeScript) · Supabase (Postgres, Auth, Row Level Security) · Vercel

---

## 1. Set up Supabase (about 10 minutes)

1. Create a project at [supabase.com](https://supabase.com).
2. **Apply the database.** Open **SQL Editor** and run these three files in order:
   1. `supabase/migrations/20261008000001_schema.sql`
   2. `supabase/migrations/20261008000002_functions.sql`
   3. `supabase/migrations/20261008000003_views_rls.sql`

   If you use the Supabase CLI instead, run `supabase link` and then `supabase db push`.
3. **Turn off public sign-ups.** Go to **Authentication → Sign In / Providers → Email** and switch off *Allow new users to sign up*. Only managers create accounts.
4. **Create your own login.** Go to **Authentication → Users → Add user**, enter your email and a password, and tick *Auto confirm*.
5. Copy the keys from **Project Settings → API**. You need the Project URL, the `anon` key and the `service_role` key.

## 2. Run locally

```bash
cp .env.example .env.local     # then paste the three keys
npm install
npm run dev                    # http://localhost:3000
```

Sign in with the user you created in step 4. Because no manager exists yet, the app asks for your name and makes you the **first manager**. This one-time step locks itself once a manager exists.

Next, open **Settings → + Add employee** and add each person. If you give them a login email and a temporary password, they can sign in and update their own tasks from their phone.

## 3. Deploy to Vercel

1. Push this folder to a GitHub repository and import it in Vercel.
2. Add these environment variables:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key (server only; never prefix it with `NEXT_PUBLIC_`) |
   | `APP_TIMEZONE` | `Asia/Riyadh` |

3. Deploy. In Supabase, go to **Authentication → URL Configuration** and set the **Site URL** to your Vercel URL.

> **Timezone:** "Completed today" and all date filters use the business timezone. If you change `APP_TIMEZONE`, also change `public.app_timezone()` in the first migration so the two match.

---

## How it works

### Everything is a task
There is one `tasks` table. `parent_task_id = null` marks a main job; any other value makes the task a child. Depth is unlimited.

- `path` (all ancestors plus the task itself) and `root_task_id` are filled in by a trigger. They make breadcrumbs, whole-tree queries and the "is a parent closed?" check fast, without recursive queries.
- A task's parent is fixed when it is created, so a task can never end up inside itself.

### Current state and history are separate
- `tasks` holds **current state**: status, the current blocked reason, `completed_at`, `completed_by`.
- `task_history` is the **append-only lifecycle**. A trigger rejects every UPDATE, DELETE and TRUNCATE, even with the service key.
- The **History** page is a *query* on `tasks where status = 'done'`. Nothing is copied or moved.

### Every change goes through a database function
The browser can read data (filtered by RLS) but cannot insert, update or delete rows directly. Each action is one Postgres function that, in a single transaction:

1. checks permission,
2. locks the task row,
3. updates the state, and
4. appends the history event.

| Function | Who | Records |
|---|---|---|
| `create_task` | Manager: anything. Employee: subtasks under their own tasks | `TASK_CREATED` / `SUBTASK_CREATED`, `TASK_ASSIGNED` |
| `set_task_status` | Manager, or the person assigned | `TASK_STATUS_CHANGED`, `TASK_BLOCKED` (reason required), `TASK_BLOCK_REASON_CHANGED`, `TASK_UNBLOCKED` |
| `complete_task` | Manager, or the person assigned | `TASK_COMPLETED`. Returns the list of unfinished subtasks unless forced |
| `reopen_task` | Manager | `TASK_REOPENED`. The earlier completion event stays |
| `cancel_task` | Manager | `TASK_CANCELLED`. For tasks created by mistake; nothing is deleted |
| `update_task_details` | Manager | `TASK_TITLE_CHANGED`, `TASK_DESCRIPTION_CHANGED` |
| `reassign_task` | Manager | `TASK_REASSIGNED`. Unfinished subtasks owned by the same person move with it |

`started_at` is set the first time a task goes In progress and is never overwritten.

### Job Done with unfinished subtasks
Subtasks are **never** marked Done automatically. If unfinished subtasks exist, the user sees them listed with *Cancel / Review subtasks / Complete parent anyway*. If the parent is completed anyway, those subtasks keep their real status but leave active work, because their parent is closed. They come back automatically if the parent is reopened.

### KPIs
- **Jobs** are main tasks (management workload). **Tasks** are every level (execution workload).
- "Jobs with blocked work" counts jobs that contain a blocked task at any depth.
- The Blocked page and the sidebar count list every blocked task at any level, with its path, reason and how long it has been blocked.

### Security
- **RLS:** managers can read everything. An employee can read any task tree they are assigned to, or have acted on, which keeps their history visible after a reassignment.
- **Service-role key:** used only in `lib/supabase/admin.ts`, on the server, to create or disable login accounts.
- **Nothing is deleted:** deactivating an employee bans their login and keeps all of their history. Employees and tasks cannot be deleted at all.

---

## Project layout

```
app/
  login/  setup/                       sign-in and first-manager setup
  (app)/layout.tsx                     sidebar and auth guard
  (app)/page.tsx                       dashboard
  (app)/employees/[id]/                employee workspace
  (app)/tasks/  (app)/tasks/[id]/      active tasks; task page (any depth; completed view)
  (app)/blocked/ history/ activity/ search/ settings/
components/                            TaskRow, TaskControls (status, Job Done, dialogs), Activity, Sidebar, Modal, ThemeToggle
lib/
  actions.ts                           server actions → database functions
  queries.ts                           read queries (views)
  auth.ts  format.ts  types.ts
  supabase/                            server, middleware and admin clients
supabase/
  migrations/                          schema, functions, views + RLS
  tests/                               scenario test against plain Postgres
middleware.ts
```

## Testing the database

The scenario test runs against a plain local Postgres 16, using a small stand-in for Supabase's `auth` schema:

```bash
createdb tasks_test
psql -d tasks_test -f supabase/tests/00_local_supabase_stub.sql
for f in supabase/migrations/*.sql; do psql -d tasks_test -v ON_ERROR_STOP=1 -f $f; done
psql -d tasks_test -f supabase/tests/10_scenario.sql
```

It covers:
- bootstrap of the first manager,
- creating subtasks,
- blocking (reason required, reason changes),
- the Job Done warning and forced completion,
- reopening and cancelling,
- reassignment cascading to subtasks,
- RLS visibility,
- refused direct writes,
- the append-only history,
- the no-delete rules.

## Not in Version 1 (by design)
Chat, comments, attachments, notifications, Kanban, Gantt charts, calendars, priorities, time sheets, analytics, and moving tasks between parents.
