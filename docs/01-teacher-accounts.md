# 01 — Teacher accounts with Mitty Google sign-in (design, not built)

_Status: BUILT 2026-10-26 with every §7 recommendation (see DECISIONS.md).
Ryan's §4 dashboard steps are done. The classic anonymous key flow still runs
alongside, on purpose, until real sign-ins are confirmed._

## 1. Goal

Teachers sign in with their Mitty Google account instead of juggling a class
code plus a teacher key. Once signed in, a teacher:

- owns their classes and gives each a label ("Period 3 · Freshman PE");
- sees every workout generated under their classes, grouped by day, plus the
  reviews;
- keeps a library of the workouts they generated themselves (sample previews,
  later whole-class workouts) and files any of them under one or more of
  their labeled classes.

Students keep the current flow: class code, no account (see §7 decision 1).

## 2. What we already know works at Mitty (evidence, not assumption)

The Mitty Business Club portal (`~/treasury-club-dashboard`,
mittybusinessclub.vercel.app) runs exactly this stack: Supabase Auth with the
Google provider, restricted to the two school domains. It had 116 profiles on
2026-10-26, about 20 of them students who signed themselves in.

- **Domains:** faculty `@mitty.com`, students `@mittymonarch.com`.
- **Students can sign in** to a third-party app that asks only for basic
  Google info. Google blocks under-18 Workspace users from *unconfigured*
  apps unless the school allows basic Sign-in-with-Google apps
  ([Google admin help](https://support.google.com/a/answer/13288950)). The
  club portal's student sign-ins show Mitty allows it. Inferred, not checked
  with Mitty IT: a new app with the same basic scopes gets the same treatment.
- **The `hd` parameter is a hint only.** The club portal passes `hd: '*'` so
  Google's chooser hides personal Gmail accounts, then enforces the domain on
  the server. We do the same, plus a database hook (§3).

## 3. Design

### Sign-in flow (Next 16 App Router)

- `@supabase/ssr` for cookie sessions. Session refresh runs in `proxy.ts`
  (Next 16 renamed `middleware.ts` to `proxy.ts`; verified in the bundled
  Next docs).
- `/login` → `supabase.auth.signInWithOAuth({ provider: "google",
  options: { redirectTo: <site>/auth/callback, queryParams: { hd: "*" } } })`.
- `/auth/callback` exchanges the code, re-checks the email domain, and
  redirects to `/teacher`.

### Three layers of domain enforcement

1. Google chooser hint: `hd: "*"`.
2. **Before User Created hook** (Postgres function): rejects any email not on
   `mitty.com` or `mittymonarch.com`, so no outside account is ever created.
3. Callback check plus RLS: only `profiles.role in ('teacher','admin')` can
   touch teacher data, and the role is set server-side, never by the client.

### Roles

- `@mitty.com` → `teacher` automatically on first sign-in.
- `@mittymonarch.com` → `student` (no dashboard for now).
- Ryan's own `@mittymonarch.com` account → `admin`, set by one SQL update after
  his first sign-in.

### Schema (one migration)

```sql
profiles        (id uuid pk = auth.users.id, email, display_name,
                 role text check in ('teacher','student','admin'), created_at)
pe_classes      + owner_id uuid null references auth.users, + label text,
                 + archived boolean default false
workouts        + created_by uuid null references auth.users   -- teacher-made
class_workouts  (class_id uuid references pe_classes, workout_id text
                 references workouts, added_by uuid, added_at,
                 primary key (class_id, workout_id))        -- the grouping
```

- A trigger on `auth.users` insert creates the `profiles` row with the role
  from the email domain.
- RLS policies (teacher reads go through a user-scoped client, so a bug in a
  route cannot leak another teacher's class):
  - `pe_classes`: owner can select / update; insert sets `owner_id = auth.uid()`.
  - `workouts`: owner of the class (`class_code`) or `created_by = auth.uid()`
    can select.
  - `class_workouts`: owner of the class can insert / delete / select.
- Student routes keep using the service role exactly as today.

### Migrating the existing classes

- The teacher key stays only as a **claim** mechanism: a signed-in teacher
  enters a class code + teacher key once and becomes its owner.
- New classes created while signed in are owned from the start and need no key.
- The 16 unclaimed legacy classes: the first signed-in teacher to claim one
  with its code owns it (same rule as the teacher key today).

### Teacher dashboard (`/teacher`)

- Class list with labels, student-workout counts per day, average rating.
- Class page: settings (today's form plus the AI check), **Filed workouts**
  (from `class_workouts`), **Student workouts** grouped by day (read-only),
  reviews, and the daily report.
- **My workouts**: everything the teacher generated, each with
  "File under…" (multi-select of their classes).

## 4. What Ryan does (dashboards; the plugins cannot do these)

1. **Google Cloud Console** — create a new project "PE.AI" (the consent
   screen shows the project's app name, so reusing the club's project would
   say "Mitty Business Club"). APIs & Services → OAuth consent screen:
   External, app name PE.AI, scopes `openid`, `email`, `profile` only, publish
   to production. Credentials → OAuth client ID → Web application:
   - Authorized redirect URI:
     `https://btdfzxcrbmcynpnrhzzz.supabase.co/auth/v1/callback`
   - Copy the client ID and secret. Mirror whatever the club project used;
     `~/treasury-club-dashboard` `docs/DEPLOYMENT.md` § "Google OAuth client"
     has the steps that worked.
2. **Supabase → Authentication → Sign In / Providers → Google**: enable,
   paste client ID + secret. While there, **disable the Email provider** —
   with email sign-up on, someone could register `anything@mitty.com` with a
   password, and the domain hook alone would let it through.
3. **Supabase → Authentication → URL Configuration**:
   - Site URL `https://pe-ai.vercel.app`
   - Redirect URLs: `https://pe-ai.vercel.app/**`,
     `https://pe-*-ryanonline1234s-projects.vercel.app/**` (previews),
     `http://localhost:3000/**`
4. **Supabase → Authentication → Hooks → Before User Created** → Postgres →
   `public.hook_restrict_signup_to_mitty` (created by the migration in §5).
   If the dashboard says the hook needs a paid plan, skip it: the callback
   check plus RLS still hold (that is all the club portal uses).
5. Sign in once on the preview, tell me, and I make your account `admin`.

## 5. What Claude does with the plugins

- **Supabase MCP**: apply the migration (profiles, owner columns,
  `class_workouts`, trigger, RLS policies, the hook function with
  `grant execute … to supabase_auth_admin`); run `get_advisors` for security
  and RLS gaps; generate TypeScript types; fetch the publishable key; set
  Ryan's role to `admin` after his first sign-in.
- **Vercel MCP**: add `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (production +
  preview), check deployments, read runtime logs if sign-in fails.
- **Code**: `@supabase/ssr` clients, `proxy.ts`, `/login`, `/auth/callback`,
  `/teacher` pages, claim-a-class flow, filing UI, tests of the RLS policies
  by querying as a non-owner.
- **Cannot do**: Google Cloud Console, the provider secret, URL
  configuration, or enabling the hook. The MCP has no auth-config tool, and
  doing it through the Management API would mean handing me a personal
  access token, which the dashboard clicks avoid.

## 6. Privacy

- Teacher accounts store a teacher's name and school email, nothing else.
- Students stay anonymous: no account, no email, first name optional,
  injuries never stored (same as today).
- If student sign-in is ever added, workouts become tied to a minor's school
  identity. That needs its own decision and probably a word with the teacher
  about school policy first.

## 7. Decisions (each with a recommendation)

1. **Who signs in.** Rec: teachers only for now; students keep class codes.
   Student sign-in adds a step on the gym floor and ties health-adjacent notes
   to a minor's identity, for little gain until the teacher asks for
   per-student tracking.
2. **Teacher key after accounts ship.** Rec: keep it only for claiming
   existing classes; new classes require sign-in.
3. **Grouping model.** Rec: many-to-many `class_workouts`, so one favourite
   workout can be filed under Period 2 and Period 4.
4. **Google Cloud project.** Rec: a new "PE.AI" project, not the club's.
5. **Ryan's access.** Rec: student-domain accounts can sign in; Ryan's is made
   `admin` by hand.
