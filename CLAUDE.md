# IssueFlow – CLAUDE.md

## Purpose

IssueFlow is a RESTful backend API for a ticket management platform (TDP 2026 Home Assignment).
It manages users, projects, tickets (issues), comments, audit logs, file attachments, and ticket dependencies using **NestJS 10 + TypeORM + PostgreSQL**.

The full API contract lives in [README.md](README.md). Setup and run instructions go in [run.md](run.md). AI interaction log goes in [prompts.md](prompts.md).

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | NestJS 10 (Express platform) |
| Language | TypeScript 5 |
| ORM | TypeORM 0.3 |
| Database | PostgreSQL (via Docker compose.yml) |
| Auth | JWT (to be implemented with `@nestjs/jwt` + `@nestjs/passport`) |
| File uploads | Multer |
| CSV | csv-parse + csv-stringify |
| Validation | class-validator + class-transformer |
| Testing | Jest + @nestjs/testing + supertest |

---

## Key Architecture Decisions

### Module structure
Each domain is its own NestJS feature module under `src/`. The expected layout is:

```
src/
  app.module.ts          # root module — imports all feature modules
  auth/                  # JWT login/logout/me, JwtAuthGuard, JwtStrategy
  users/                 # user CRUD + mentions endpoint
  projects/              # project CRUD + soft-delete + workload endpoint
  tickets/               # ticket CRUD + soft-delete + export/import + dependencies
  comments/              # comment CRUD + @mention parsing
  audit-log/             # append-only audit log entity + read endpoint
  attachments/           # file upload/delete with Multer
  common/                # shared guards, interceptors, pipes, decorators
```

Each feature module follows the NestJS convention:
- `*.module.ts` — imports, providers, exports
- `*.controller.ts` — HTTP routing, DTOs in/out
- `*.service.ts` — business logic, TypeORM repository calls
- `*.entity.ts` — TypeORM entity (maps to DB table)
- `dto/` — `create-*.dto.ts`, `update-*.dto.ts` with class-validator decorators
- `*.spec.ts` — unit tests co-located with the service

### Database
- TypeORM `synchronize: true` is fine for development; disable for production.
- DB credentials come from environment variables (see Config section below).
- The Docker database is defined in `compose.yml`: host `localhost`, port `5432`, db/user/pass all `issueflow`.

### Authentication
- All endpoints except `POST /auth/login` and `POST /users` (register) require a valid JWT in the `Authorization: Bearer <token>` header.
- Apply `JwtAuthGuard` globally in `app.module.ts` using `APP_GUARD`, then mark public routes with a `@Public()` decorator.
- `POST /auth/logout` implements a server-side deny-list (store invalidated JTIs in DB or in-memory Set; in-memory is acceptable for the assignment).

### Optimistic locking for concurrent updates
- Tickets and comments must prevent simultaneous updates. Use a TypeORM `@VersionColumn()` (`version: number`) on `Ticket` and `Comment` entities.
- On `PATCH`, pass the client-supplied `version` to `save()`; TypeORM throws `OptimisticLockVersionMismatch` if another writer committed first. Return HTTP 409 Conflict in that case.

### Audit log
- Every state-changing action (create, update, delete, auto-assign, escalation) appends a row to `AuditLog`.
- Fields: `id`, `actor` (userId or `"SYSTEM"`), `action` (enum string), `entityType`, `entityId`, `payload` (JSONB snapshot), `createdAt`.
- Write to the audit log inside each service (inject `AuditLogService`), not in controllers.

### Soft delete
- `Ticket` and `Project` entities carry `deletedAt: Date | null` and use TypeORM's `@DeleteDateColumn()`.
- TypeORM's `softRemove()` / `softDelete()` handles this automatically.
- Standard `find*` queries exclude soft-deleted rows when `withDeleted` is not set.
- ADMIN-only `GET /tickets/deleted` and `GET /projects/deleted` pass `{ withDeleted: true }` to the repository.

### Auto-escalation scheduler
- Use `@nestjs/schedule` (`CronJob`) to run escalation every minute (or configurable interval).
- Query all non-DONE tickets where `dueDate < NOW()` and `priority != CRITICAL`.
- Increment priority one step; set `isOverdue = true` when the ticket reaches CRITICAL.
- A user-triggered `PATCH /tickets/:id` with an explicit `priority` clears `isOverdue` and resets escalation state.

### File attachments
- Store files on the local filesystem under `uploads/` (or an env-configured path).
- Enforce 10 MB limit and allowed MIME types (`image/png`, `image/jpeg`, `application/pdf`, `text/plain`) in the Multer `fileFilter` and `limits` options — do not rely on the client-supplied Content-Type alone.

---

## Config Conventions

### Environment variables
Create a `.env` file (never commit it — it is in `.gitignore`):

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=issueflow
DB_USER=issueflow
DB_PASS=issueflow
JWT_SECRET=change_me_in_production
JWT_EXPIRES_IN=3600s
UPLOAD_DEST=./uploads
```

Use `@nestjs/config` (`ConfigModule.forRoot({ isGlobal: true })`) to load these. Inject `ConfigService` wherever env vars are needed — never use `process.env` directly in business code.

### TypeORM entity naming
- Table names: snake_case plural (`audit_logs`, `ticket_dependencies`).
- Column names: snake_case via `@Column({ name: 'created_at' })` or set `namingStrategy` globally.
- Use `@CreateDateColumn()` and `@UpdateDateColumn()` instead of managing timestamps manually.

### DTO validation
- Every controller input (body, query, param) must use a DTO class decorated with `class-validator`.
- Enable global `ValidationPipe` in `main.ts`:

```typescript
app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
```

- `whitelist: true` strips unknown properties automatically.
- `transform: true` coerces query/param strings to their declared types (e.g., `@Param('id') id: number`).

### HTTP error responses
Return structured errors using NestJS built-in exceptions (`NotFoundException`, `BadRequestException`, `ConflictException`, `ForbiddenException`). Do not throw raw `Error` objects in controllers or services.

---

## Adding a New Feature

1. **Generate the module** with the NestJS CLI (or create files manually following the module structure above).
2. **Define the entity** in `*.entity.ts`. Add it to the `entities` array in the TypeORM `forRoot()` call in `app.module.ts`.
3. **Write DTOs** with class-validator decorators. Import and use them in the controller.
4. **Implement service methods** — inject the repository via `@InjectRepository(Entity)`. Keep all DB logic here, not in the controller.
5. **Write the controller** — map HTTP verbs to service calls, apply guards/decorators as needed.
6. **Register the module** — add `FeatureModule` to the `imports` array in `app.module.ts`.
7. **Add audit log calls** in the service for any state-changing operation.
8. **Write unit tests** (service layer) and at least one e2e test for the happy path.

---

## Debugging

### Application won't start
- Check that PostgreSQL is running: `docker compose up -d` from the project root.
- Verify `.env` values match `compose.yml` credentials.
- TypeORM connection errors usually print a clear message pointing to the host/port/credentials.

### TypeORM entity not found
- Ensure the entity class is listed in the module's `TypeOrmModule.forFeature([...])` **and** in the global `entities` array.

### JWT auth failures
- `401 Unauthorized` with no detail usually means the token is missing or malformed.
- `403 Forbidden` means the token is valid but the route requires ADMIN and the user is DEVELOPER.
- Decode the token at [jwt.io](https://jwt.io) to inspect claims without the secret.

### Optimistic lock conflicts (409)
- The client must send the current `version` field back with every update request.
- If you see a version mismatch error during tests, make sure your test fetches the entity before patching it.

### Running tests
```bash
# unit tests
npm test

# unit tests with coverage
npm run test:cov

# e2e tests (requires running DB)
npm run test:e2e
```

For a single file: `npx jest src/tickets/tickets.service.spec.ts`.

### Inspecting the database
Connect with any Postgres client using the credentials from `compose.yml`:
```
host: localhost  port: 5432  db: issueflow  user: issueflow  pass: issueflow
```
Or via CLI: `docker exec -it <container_name> psql -U issueflow issueflow`.

---

## Business Rule Quick Reference

| Rule | Location to enforce |
|---|---|
| Status can only move forward (TODO→IN_PROGRESS→IN_REVIEW→DONE) | `TicketsService.update()` |
| Ticket cannot be updated when status is DONE | `TicketsService.update()` |
| Ticket cannot move to DONE if it has unresolved blockers | `TicketsService.update()` before status transition |
| Concurrent ticket/comment update protection | TypeORM `@VersionColumn()` + 409 on mismatch |
| Auto-assign to least-loaded DEVELOPER on creation without assigneeId | `TicketsService.create()` |
| Escalation resets when user manually sets priority | `TicketsService.update()` — clear `isOverdue`, mark for re-evaluation |
| Soft-deleted records hidden from standard queries | TypeORM `@DeleteDateColumn()` — automatic |
| ADMIN-only routes | Role guard checking `req.user.role === 'ADMIN'` |
| @mention list re-evaluated on comment update | `CommentsService.update()` — diff old vs new mentions |

---

## Enum Values (from requirements)

```typescript
enum UserRole     { ADMIN = 'ADMIN', DEVELOPER = 'DEVELOPER' }
enum TicketStatus { TODO = 'TODO', IN_PROGRESS = 'IN_PROGRESS', IN_REVIEW = 'IN_REVIEW', DONE = 'DONE' }
enum TicketPriority { LOW = 'LOW', MEDIUM = 'MEDIUM', HIGH = 'HIGH', CRITICAL = 'CRITICAL' }
enum TicketType   { BUG = 'BUG', FEATURE = 'FEATURE', TECHNICAL = 'TECHNICAL' }
```

Status transition order: `TODO(0) → IN_PROGRESS(1) → IN_REVIEW(2) → DONE(3)` — reject if new index ≤ current index.
Priority escalation order: `LOW(0) → MEDIUM(1) → HIGH(2) → CRITICAL(3)`.

---

## Files to Deliver (per assignment requirements)

- `run.md` — setup, build, and run instructions
- `prompts.md` — AI interaction log with model name stated explicitly
- All source, test, config, and Docker files committed to the public repo
