# Design Document: Real-Time Collaborative Task Board

## Overview

This document explains the architectural decisions, conflict resolution strategies, and trade-offs made in building a real-time collaborative Kanban board with WebSocket synchronization and offline support.

## Architecture

### High-Level Architecture

```
┌─────────────────┐     WebSocket      ┌─────────────────┐
│                 │◄──────────────────►│                 │
│  React Client   │                    │  Node.js Server │
│  (Optimistic UI)│     HTTP/REST      │  (Express + WS) │
│                 │◄──────────────────►│                 │
└─────────────────┘                    └────────┬────────┘
                                                │
                                                │ SQL
                                                ▼
                                       ┌─────────────────┐
                                       │   PostgreSQL    │
                                       │  (Persistent)   │
                                       └─────────────────┘
```

### Component Separation

The codebase follows a clean separation of concerns:

1. **WebSocket Handlers** (`handlers/wsHandler.ts`) - Message routing and client management
2. **Business Logic** (`services/taskService.ts`) - Task operations and conflict resolution
3. **Data Access** (`db/taskRepository.ts`) - Database operations with transactions
4. **Utilities** (`utils/fractionalIndex.ts`) - Ordering algorithm

This separation ensures testability and maintainability.

## Conflict Resolution Strategy

### Core Principle: Optimistic Concurrency with Version Vectors

Each task has a `version` field that increments with every modification. Clients must provide the current version when making changes. If the version doesn't match, a conflict is detected.

### Scenario 1: Concurrent Move + Edit

**Problem**: User A moves Task X to "Done" while User B edits Task X's title.

**Solution**: Both changes are preserved using field-level granularity.

```
Initial State: Task X { column: "todo", title: "Old Title", version: 1 }

User A: Move to "done" (version: 1)
User B: Edit title to "New Title" (version: 1)

Server Processing Order:
1. User A's move arrives first → Success, version becomes 2
2. User B's edit arrives with version 1 → Conflict detected

Resolution:
- Server sends conflict notification to User B
- User B's client receives current task state (version 2, column: "done")
- User B can retry the edit with the new version

Alternative (if moves commute with edits):
- Accept both: Task ends up in "done" with "New Title"
```

**Trade-off**: We chose version-based rejection over automatic merging because:
- Simpler to reason about
- Avoids surprising automatic merges
- Users get explicit feedback about conflicts

### Scenario 2: Concurrent Move + Move

**Problem**: User A moves Task X to "In Progress" while User B moves Task X to "Done".

**Solution**: First-write-wins with deterministic ordering.

```
User A: Move to "in_progress" (version: 1) → Arrives at T1
User B: Move to "done" (version: 1) → Arrives at T2

If T1 < T2:
  - User A wins → Task in "in_progress", version: 2
  - User B receives conflict notification with current state
  - User B's UI reverts and shows task in "in_progress"

The "losing" user receives:
{
  type: "conflict:notification",
  payload: {
    conflict: {
      type: "concurrent_move",
      message: "Task was moved by another user to 'in_progress'. Your move was not applied.",
      currentTask: { ...taskWithNewState }
    }
  }
}
```

**Why First-Write-Wins?**
- Deterministic: same inputs always produce same output
- Simple to implement and understand
- Database transactions naturally provide this behavior
- User feedback is immediate and actionable

### Scenario 3: Concurrent Reorder

**Problem**: User A reorders tasks in a column while User B adds a new task to the same column.

**Solution**: Fractional indexing with position isolation.

```
Initial State: [Task1 @ "A", Task2 @ "M", Task3 @ "Z"]

User A: Move Task3 between Task1 and Task2
  - New position: generatePositionBetween("A", "M") → "G"
  - Result: [Task1 @ "A", Task3 @ "G", Task2 @ "M"]

User B (concurrently): Add Task4 at the end
  - New position: generatePositionAfter("Z") → "Za"
  - Result: [... Task4 @ "Za"]

Both operations succeed because they modify independent position keys.
Final consistent state across all clients:
  [Task1 @ "A", Task3 @ "G", Task2 @ "M", Task4 @ "Za"]
```

## Task Ordering: Fractional Indexing

### Why Not Array Indices?

Traditional array-based ordering requires O(n) updates when inserting in the middle:
```
[0, 1, 2, 3, 4] → Insert at index 2 → [0, 1, NEW, 2, 3, 4]
                                        ↑   ↑   ↑   ↑
                                        Must update 4 items
```

### Fractional Indexing Approach

We use string-based positions that can always be subdivided:

```
Position Space: "A" < "M" < "Z"

Insert between "A" and "Z" → "M"
Insert between "A" and "M" → "G"
Insert between "G" and "M" → "J"
...

When strings get too close, we extend:
Insert between "Ma" and "Mb" → "MaM" (mid-character appended)
```

**Complexity**:
- Insert/Move: O(1) amortized (just update one row's position)
- Query ordered list: O(n log n) (database sorts by position string)

**Trade-off**: Position strings can grow over time with many insertions. In practice, strings stay under 10 characters even with hundreds of operations.

## Offline Support

### Queue and Replay Strategy

```
Online Mode:
  User Action → Send to Server → Optimistic UI Update → Await Confirmation

Offline Mode:
  User Action → Queue Locally → Optimistic UI Update

Reconnection:
  1. Re-establish WebSocket connection
  2. Receive full state sync from server
  3. Replay queued operations in order
  4. Handle conflicts as they arise
```

### Queue Structure

```typescript
interface QueuedOperation {
  id: string;           // For tracking
  type: 'create' | 'update' | 'move' | 'delete';
  payload: unknown;     // Original message
  timestamp: number;    // For ordering
  retryCount: number;   // For backoff
}
```

### Conflict Handling During Replay

Operations queued offline may conflict with changes made by other users:
- Create: Should always succeed (new ID)
- Update: May fail if version changed → Show conflict notification
- Move: May fail if already moved → Sync to current state
- Delete: May fail if modified → Confirm with user

## Optimistic UI

### Strategy

1. **Immediate Feedback**: UI updates instantly on user action
2. **Pending State**: Track operations awaiting server confirmation
3. **Reconciliation**: On server response, update to authoritative state
4. **Reversion**: On conflict/error, revert to server state and notify user

```typescript
// Optimistic update flow
1. Store original task state
2. Apply optimistic change to local state
3. Send to server with messageId
4. Track pending operation with messageId
5. On sync:ack → Remove pending, update with server state
6. On conflict → Revert to original, show notification
```

## Real-Time Synchronization

### WebSocket Protocol

**Message Format**:
```typescript
{
  type: 'task:create' | 'task:update' | 'task:move' | 'task:delete' | ...,
  payload: { ... },
  clientId: string,
  timestamp: number,
  messageId: string  // For request-response correlation
}
```

**Broadcast Strategy**:
- Changes are broadcast to all clients except the originator
- Originator receives `sync:ack` with server-confirmed state
- Ensures <200ms propagation on localhost

### Connection Management

- Heartbeat ping/pong every 30 seconds
- Automatic reconnection with exponential backoff
- Maximum backoff: 30 seconds
- Clean user presence on disconnect

## Database Design

### Schema

```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  column VARCHAR(20) CHECK (column IN ('todo', 'in_progress', 'done')),
  position VARCHAR(50) NOT NULL,  -- Fractional index
  version INTEGER NOT NULL,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_tasks_column_position ON tasks (column, position);
```

### Atomic Operations

All task modifications use database transactions:
```typescript
await transaction(async (client) => {
  // Lock row with FOR UPDATE
  const current = await client.query(
    'SELECT * FROM tasks WHERE id = $1 FOR UPDATE', [id]
  );

  // Check version
  if (current.rows[0].version !== expectedVersion) {
    throw new ConflictError();
  }

  // Apply update
  await client.query('UPDATE tasks SET ... WHERE id = $1', [id]);
});
```

## Trade-offs Summary

| Decision | Benefit | Cost |
|----------|---------|------|
| Version-based conflicts | Simple, explicit user feedback | No automatic merging |
| First-write-wins | Deterministic, fair | Late writers must retry |
| Fractional indexing | O(1) moves | Position strings grow |
| Optimistic UI | Instant feedback | Occasional reverts |
| Full state sync on reconnect | Simple, guaranteed consistent | More bandwidth |

## Future Improvements

1. **CRDTs for Text Fields**: Use Yjs or Automerge for collaborative text editing
2. **Partial Sync**: Send only changed tasks since last sync
3. **Position Compaction**: Periodically normalize position strings
4. **Presence Cursors**: Show real-time cursor positions during drag
5. **Undo/Redo**: Operation-based undo with conflict awareness
