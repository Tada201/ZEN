# Antigravity IDE — Task Handoff Prompt Template

Use this prompt at the start of a new session (or when handing off to another agent/context) to give the coding agent complete situational awareness. Fill in every section. Leave no field blank — write `N/A` if not applicable.

---

## 1. PROJECT IDENTITY

**Project Name:**
> e.g., `acme-dashboard`

**Repository / Workspace Path:**
> e.g., `/home/user/projects/acme-dashboard` or `github.com/org/repo`

**Primary Language & Runtime:**
> e.g., TypeScript 5.4, Node 22, Python 3.12

**Framework / Stack:**
> e.g., Next.js 14 (App Router), Tailwind CSS, Prisma + PostgreSQL, Vitest

**Package Manager:**
> e.g., `pnpm` / `npm` / `yarn` / `uv` / `poetry`

**Key Config Files to Know About:**
> e.g., `tsconfig.json`, `.env.local`, `prisma/schema.prisma`, `docker-compose.yml`

---

## 2. TASK BEING HANDED OFF

**Task Title (one line):**
> e.g., `Implement CSV export for the reports page`

**Task Type:**
- [ ] New feature
- [ ] Bug fix
- [ ] Refactor
- [ ] Performance improvement
- [ ] Test coverage
- [ ] Documentation
- [ ] Infrastructure / DevOps
- [ ] Other: ___________

**Full Task Description:**
> Write a clear, complete description as if the receiving agent has never seen this task before.
> Include the "why" (business or technical motivation), not just the "what."

**Acceptance Criteria (must all be true for the task to be "done"):**
1.
2.
3.

**Out of Scope (explicitly state what NOT to do):**
>

---

## 3. CURRENT STATE

**What has already been done on this task:**
> Describe completed steps, decisions made, and any partial implementations.

**Files already created or modified:**
```
path/to/file.ts         — reason it was touched
path/to/another.ts      — reason it was touched
```

**Git branch / commit SHA (if applicable):**
> e.g., `feature/csv-export` @ `a3f9c12`

**Tests already written:**
> List any new test files or test cases added so far.

**Known issues or loose ends in the current state:**
>

---

## 4. WHERE TO START

**The very next action the agent should take:**
> Be precise. e.g., "Open `src/app/reports/page.tsx` and add a download button in the toolbar that triggers the `exportCSV` function defined in `src/lib/export.ts` (which still needs to be created)."

**Files to read first before touching anything:**
```
path/to/context-file.ts   — explains the data model
path/to/existing-util.ts  — contains helpers that must be reused
```

**Relevant existing patterns to follow:**
> e.g., "Follow the same data-fetching pattern as `src/app/invoices/page.tsx`. Use `useQuery` from React Query, not `useEffect`."

---

## 5. TECHNICAL CONSTRAINTS & GUARDRAILS

**Dependencies that MUST be used (do not introduce alternatives):**
> e.g., `zod` for validation, `date-fns` for dates, `shadcn/ui` components only

**Dependencies that must NOT be added:**
> e.g., `moment.js` (banned), `lodash` (use native alternatives)

**Code style rules:**
> e.g., "Functional components only. No `any` types. All async functions must have explicit return types."

**Performance requirements:**
> e.g., "CSV export must stream and not block the UI thread. Max memory: 50 MB."

**Security / Privacy constraints:**
> e.g., "Never log PII. All API routes require session auth middleware."

**API / service rate limits to be aware of:**
>

---

## 6. ENVIRONMENT & RUNNING THE PROJECT

**How to run the project locally:**
```bash
# install
pnpm install

# start dev server
pnpm dev

# run tests
pnpm test
```

**How to run only the relevant tests:**
```bash
# e.g.
pnpm test src/lib/export.test.ts
```

**Environment variables needed (no actual secrets — list names only):**
```
DATABASE_URL
NEXT_PUBLIC_API_BASE_URL
AWS_S3_BUCKET
```

**Where the `.env` / secrets file lives or how to obtain it:**
>

---

## 7. DOMAIN CONTEXT

**Key domain concepts the agent must understand:**
> e.g., "A 'Report' belongs to one 'Workspace'. Reports have a status of `draft | published | archived`. Only `published` reports can be exported."

**Data model summary (or link to schema):**
> Paste relevant Prisma/SQL schema, TypeScript types, or link to `schema.prisma`.

**External APIs or services involved:**
| Service | Purpose | Docs / Auth method |
|---------|---------|-------------------|
|         |         |                   |

---

## 8. DECISION LOG

Record every significant decision already made so the agent doesn't re-litigate them.

| Decision | Rationale | Alternatives Rejected |
|----------|-----------|-----------------------|
|          |           |                       |

---

## 9. BLOCKERS & OPEN QUESTIONS

List anything that is unresolved. The agent should attempt to resolve these or flag them if they cannot proceed.

| # | Question / Blocker | Owner | Priority |
|---|--------------------|-------|----------|
| 1 |                    |       | High / Med / Low |

---

## 10. RELATED CONTEXT

**Linked tickets / issues:**
> e.g., `JIRA-1042`, `GitHub Issue #88`

**Design mockups or specs:**
> Link to Figma, Notion, or paste a description.

**Relevant past PRs or commits to read for context:**
> e.g., `PR #45` — added the original reports table

**Slack / discussion threads (summarize key points):**
>

---

## 11. DEFINITION OF DONE

The agent must verify ALL of the following before declaring the task complete:

- [ ] Acceptance criteria from Section 2 are fully met
- [ ] All new code has passing unit/integration tests
- [ ] No TypeScript / linter errors (`pnpm lint && pnpm typecheck`)
- [ ] No regressions in existing tests (`pnpm test`)
- [ ] Code follows the patterns and constraints in Section 5
- [ ] No console errors or warnings in the browser/runtime
- [ ] Any new environment variables are documented in `.env.example`
- [ ] PR / commit message follows the project's convention: ___________

---

## 12. HANDOFF NOTES (free text)

> Use this section for anything that doesn't fit above — hunches, warnings, context about why a previous approach failed, or a message to the next person/agent.

---

*Template version: 1.0 — Antigravity IDE Task Handoff*