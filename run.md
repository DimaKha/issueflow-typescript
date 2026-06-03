# IssueFlow – Setup and Run Instructions

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop) — provides the PostgreSQL database
- [Node.js 18+](https://nodejs.org/) and npm

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Start the database

```bash
docker compose up -d
```

Starts PostgreSQL at `localhost:5432`.  
Default credentials (from `compose.yml`): database / user / password = `issueflow`.

### 3. Configure environment variables

```bash
cp .env.example .env
```

The defaults in `.env.example` match the Docker Compose configuration and work out of the box for local development. **Do not commit `.env`** — it is listed in `.gitignore`.

---

## Build

```bash
npm run build
```

Compiles TypeScript to `dist/`. Not required for development (use `start:dev` instead), but confirms there are no build-time errors before deployment.

---

## Running the Application

```bash
npm run start:dev
```

The API starts at `http://localhost:3000`.

On first launch, TypeORM (`synchronize: true`) automatically creates all database tables. No migration step is required.

---

## Running Tests

```bash
# All unit tests
npm test

# TypeScript type check (no build output)
npx tsc --noEmit

# Unit tests with coverage report
npm run test:cov
```

---

## API Notes and Clarifications

### Authentication

All endpoints except `POST /users` and `POST /auth/login` require a valid JWT in the `Authorization: Bearer <token>` header.

### Password on POST /users

The README's `POST /users` example body omits `password`, but `POST /auth/login` requires a password.  
This implementation requires `password` (min 6 characters) on `POST /users`.  
The password is hashed with bcrypt (10 rounds) and is never returned in any response.

### version field on PATCH /tickets/:ticketId and PATCH /tickets/:ticketId/comments/:commentId

The `version` field is **required** on ticket and comment updates.

This implementation uses optimistic locking:

1. The client first fetches the ticket/comment and receives its current `version`.
2. The client sends that `version` in the PATCH request body.
3. The update succeeds only if the database row still has the same version.
4. If another user already updated the row, the API returns **409 Conflict**.

PATCH without `version` returns **400 Bad Request**.

This is required to prevent simultaneous updates from overwriting each other.

### Auto-escalation scheduler

The scheduler fires every minute (demo-friendly frequency).  
In production, change `CronExpression.EVERY_MINUTE` in `src/tickets/escalation.scheduler.ts` to a longer interval (e.g. `'0 * * * *'` for hourly).

Escalation rules per run:
- Only tickets where `dueDate < NOW()` AND `status != DONE` AND `deletedAt IS NULL`
- Priority advances one step: LOW → MEDIUM → HIGH → CRITICAL
- CRITICAL tickets are not escalated further (no audit log emitted)
- Each escalated ticket produces an `AUTO_ESCALATE` audit entry (actor: SYSTEM)

---

## Manual Verification – Core Flow (PowerShell)

```powershell
# 1. Create admin user (public endpoint — no token needed)
curl.exe -X POST http://localhost:3000/users `
  -H "Content-Type: application/json" `
  -d '{"username":"admin","email":"admin@test.com","fullName":"Admin User","role":"ADMIN","password":"secret123"}'

# 2. Log in and capture the token
$TOKEN = (curl.exe -s -X POST http://localhost:3000/auth/login `
  -H "Content-Type: application/json" `
  -d '{"username":"admin","password":"secret123"}' | ConvertFrom-Json).accessToken

# 3. Create a project; capture its id
$PROJECT_ID = (curl.exe -s -X POST http://localhost:3000/projects `
  -H "Authorization: Bearer $TOKEN" `
  -H "Content-Type: application/json" `
  -d '{"name":"Alpha","ownerId":1}' | ConvertFrom-Json).id

# 4. Create a DEVELOPER user (auto-assignment candidate)
curl.exe -X POST http://localhost:3000/users `
  -H "Content-Type: application/json" `
  -d '{"username":"dev1","email":"dev1@test.com","fullName":"Dev One","role":"DEVELOPER","password":"secret123"}'

# 5. Create a ticket without assigneeId — auto-assigns to dev1
$TICKET_ID = (curl.exe -s -X POST http://localhost:3000/tickets `
  -H "Authorization: Bearer $TOKEN" `
  -H "Content-Type: application/json" `
  -d "{`"title`":`"Fix login`",`"type`":`"BUG`",`"projectId`":$PROJECT_ID}" | ConvertFrom-Json).id

# 6. Verify the ticket (use the captured id, not a hardcoded one)
curl.exe -H "Authorization: Bearer $TOKEN" "http://localhost:3000/tickets/$TICKET_ID"
# → assigneeId: 2 (auto-assigned to dev1), isOverdue: false

# 7. Add a comment with @mention
curl.exe -X POST "http://localhost:3000/tickets/$TICKET_ID/comments" `
  -H "Authorization: Bearer $TOKEN" `
  -H "Content-Type: application/json" `
  -d '{"authorId":1,"content":"Fix this @admin"}'

# 8. Check audit log
curl.exe -H "Authorization: Bearer $TOKEN" "http://localhost:3000/audit-logs"

# 9. Export tickets as CSV
curl.exe -H "Authorization: Bearer $TOKEN" `
  "http://localhost:3000/tickets/export?projectId=$PROJECT_ID"

# 10. Log out
curl.exe -X POST http://localhost:3000/auth/logout -H "Authorization: Bearer $TOKEN"

# 11. Verify token is denied after logout (should return 401)
curl.exe -H "Authorization: Bearer $TOKEN" "http://localhost:3000/tickets/$TICKET_ID"
```

---

## Manual Verification – Auto-Escalation

```powershell
# Re-authenticate if needed
$TOKEN = (curl.exe -s -X POST http://localhost:3000/auth/login `
  -H "Content-Type: application/json" `
  -d '{"username":"admin","password":"secret123"}' | ConvertFrom-Json).accessToken

# 1. Create a LOW-priority ticket with a past dueDate; capture its id
$OVERDUE_ID = (curl.exe -s -X POST http://localhost:3000/tickets `
  -H "Authorization: Bearer $TOKEN" `
  -H "Content-Type: application/json" `
  -d "{`"title`":`"Overdue LOW`",`"type`":`"BUG`",`"projectId`":1,`"priority`":`"LOW`",`"dueDate`":`"2020-01-01T00:00:00Z`"}" `
  | ConvertFrom-Json).id
# → isOverdue: true, priority: "LOW"

# 2. Wait up to 1 minute for the scheduler to fire, then check priority using the captured id
Start-Sleep -Seconds 62
curl.exe -H "Authorization: Bearer $TOKEN" "http://localhost:3000/tickets/$OVERDUE_ID"
# → priority: "MEDIUM", isOverdue: true

# 3. Verify AUTO_ESCALATE audit entry (action = AUTO_ESCALATE, not ESCALATE)
curl.exe -H "Authorization: Bearer $TOKEN" "http://localhost:3000/audit-logs?action=AUTO_ESCALATE"
# → [{ "actor": "SYSTEM", "action": "AUTO_ESCALATE", "entityType": "TICKET",
#       "entityId": <overdue_id>, "performedBy": null,
#       "payload": { "oldPriority": "LOW", "newPriority": "MEDIUM" } }]

# 4. Verify a DONE ticket is NOT escalated
# Advance any ticket to DONE status, then check no AUTO_ESCALATE entry exists for it:
$VERSION = (curl.exe -s -H "Authorization: Bearer $TOKEN" "http://localhost:3000/tickets/$TICKET_ID" | ConvertFrom-Json).version
curl.exe -X PATCH "http://localhost:3000/tickets/$TICKET_ID" `
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" `
  -d "{`"status`":`"IN_PROGRESS`",`"version`":$VERSION}"
$VERSION2 = (curl.exe -s -H "Authorization: Bearer $TOKEN" "http://localhost:3000/tickets/$TICKET_ID" | ConvertFrom-Json).version
curl.exe -X PATCH "http://localhost:3000/tickets/$TICKET_ID" `
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" `
  -d "{`"status`":`"IN_REVIEW`",`"version`":$VERSION2}"
$VERSION3 = (curl.exe -s -H "Authorization: Bearer $TOKEN" "http://localhost:3000/tickets/$TICKET_ID" | ConvertFrom-Json).version
curl.exe -X PATCH "http://localhost:3000/tickets/$TICKET_ID" `
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" `
  -d "{`"status`":`"DONE`",`"version`":$VERSION3}"
# Ticket is now DONE.

# Wait for the scheduler to fire again, then confirm NO AUTO_ESCALATE entry exists for this ticket:
Start-Sleep -Seconds 62
curl.exe -H "Authorization: Bearer $TOKEN" `
  "http://localhost:3000/audit-logs?action=AUTO_ESCALATE&entityId=$TICKET_ID"
# → [] (empty — DONE ticket is never escalated)

# Confirm DONE ticket priority is unchanged
curl.exe -H "Authorization: Bearer $TOKEN" "http://localhost:3000/tickets/$TICKET_ID"
# → status: "DONE", priority unchanged
```

---

## Assumptions and Known Limitations

| Item | Detail |
|------|--------|
| **Comment soft delete** | Comments use `@DeleteDateColumn` and `DELETE /tickets/:ticketId/comments/:commentId` performs a soft delete. The comment row remains in the database with `deleted_at` set. There is no restore endpoint for comments because the README does not define one. |
| **Workload scope** | Counts non-DONE, non-deleted tickets only within the queried project. |
| **JWT deny-list** | In-memory `Set<string>`. Clears on server restart — acceptable per assignment spec. |
| **File type validation** | Multer checks `file.mimetype` from the multipart Content-Type header. True magic-byte inspection is not implemented. |
| **Auto-escalation frequency** | `EVERY_MINUTE` for demo. Production: change to `'0 * * * *'` in `src/tickets/escalation.scheduler.ts`. |
| **TypeORM `synchronize: true`** | Acceptable for development. Disable and use migrations before production deployment. |
