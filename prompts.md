# IssueFlow – AI Interaction Log

## Model Used

**claude-sonnet-4-6** (Anthropic Claude Sonnet 4.6), accessed via the Claude Code CLI (VS Code extension).

---

## How AI Was Used

Claude was used as a pair-programming assistant throughout this assignment. The workflow was:

1. A high-level plan was produced in a single planning session that covered all milestones.
2. Each milestone was then implemented milestone-by-milestone, with the human explicitly approving each milestone before the AI proceeded to the next.
3. After each milestone, the human ran `npm test` and `npx tsc --noEmit` manually, performed manual API testing against the running server, and provided corrections or clarifications before sign-off.
4. All AI-generated code was reviewed line by line, tested against the live database, and corrected where needed. Several corrections were provided to the AI across milestones (see below).

---

## Main Planning Prompt

The initial session began with a comprehensive planning prompt that covered:

- Full README endpoint inventory
- Tech stack: NestJS 10 + TypeORM 0.3 + PostgreSQL + JWT + Multer + csv-parse/csv-stringify
- Architecture decisions: module structure, soft-delete, optimistic locking, global guards, audit log pattern
- Business rule constraints: status transition order, isOverdue computation, DONE-ticket update block, blocker-dependency check, auto-assignment tie-break, escalation scope
- Security constraints: passwordHash never in responses, JWT payloads, or audit log entries
- Deliverable files: run.md, prompts.md

The plan was reviewed and approved before any code was written.

---

## Milestone Workflow

Each milestone followed the same pattern:

```
Human: "Proceed to Milestone N only: <brief description>. Stop after Milestone N."
AI:    Implements milestone (entities, DTOs, service, controller, tests).
Human: Runs npm test + npx tsc --noEmit + manual API curl verification.
Human: Either approves ("Milestone N verified and ready") or provides corrections.
AI:    Applies corrections, reruns tests, confirms all pass.
Human: Approves, then triggers next milestone.
```

---

## Milestones Implemented with AI Assistance

| Milestone | Description |
|-----------|-------------|
| M0 | Project bootstrap — ConfigModule, TypeORM, ScheduleModule, global pipes/guards |
| M1 | Users module — CRUD, bcrypt password hashing, @Exclude on passwordHash |
| M2 | Auth module — JWT login/logout/me, global JwtAuthGuard + RolesGuard, deny-list |
| M3 | Projects module — CRUD, soft-delete, restore |
| M4 | Tickets module — CRUD, status transitions, isOverdue, optimistic locking |
| M5 | Comments module — nested CRUD, @mention parsing and validation |
| M6 | Audit log module — AuditLogService injected into all feature services |
| M7 | Ticket dependencies + file attachments — blocker check, Multer upload |
| M8 | CSV export/import — csv-stringify/csv-parse, isOverdue recomputed on export |
| M9 | Auto-assignment, workload endpoint, paginated mentions endpoint |
| M10 | Auto-escalation scheduler — @Cron, PRIORITY_NEXT map, AUTO_ESCALATE audit log |
| M11 | Final polish — run.md, prompts.md, verification checklist |

---

## Notable Human Corrections Applied

The following clarifications and corrections were provided during the session and incorporated into the implementation:

1. **isOverdue export**: AI initially exported `isOverdue` as `1`/`""` (csv-stringify boolean default). Human clarified it must be the explicit string `"true"` or `"false"`. Fixed by wrapping with `String(computeIsOverdue(...))`.

2. **isOverdue computation**: Human specified the exact formula — `dueDate != null && dueDate < now && status !== DONE` — and that it must always be recomputed from current state, not read from the stored column.

3. **Mentions response shape**: Human corrected the field name from `commentId` to `id` and required the `{ data, total, page }` wrapper with optional `page`/`pageSize` query parameters.

4. **Auto-assignment tie-break test**: Human specified the tie-break scenario must use `count=0` (both developers with zero open tickets, lowest userId wins) rather than a simulated count difference.

5. **DEVELOPER-only query in auto-assignment**: Human required an explicit test verifying that `userRepo.find` is called with `{ where: { role: UserRole.DEVELOPER } }`, so admins are excluded at the query level.

6. **M10 manual verification**: Human corrected the verification notes to (a) use the dynamically captured ticket id rather than a hardcoded `/tickets/1`, (b) use `action=AUTO_ESCALATE` not `action=ESCALATE`, and (c) include an explicit DONE-ticket non-escalation verification.

---

## Statement of Review

All AI-generated code was manually reviewed, corrected where needed, and tested against a live PostgreSQL database. Unit tests were inspected individually. The final implementation reflects both AI-generated scaffolding and human corrections applied throughout the milestone workflow.

I remain fully accountable for the submitted code and reviewed, tested, and understood all AI-generated changes before committing them.
