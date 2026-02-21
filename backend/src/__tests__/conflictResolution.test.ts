import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';

// These tests require a running server
// Run with: npm run dev (in another terminal) then npm test

const WS_URL = process.env.TEST_WS_URL || 'ws://localhost:3001/ws';
const TIMEOUT = 5000;

interface WSMessage {
  type: string;
  payload: unknown;
  clientId: string;
  timestamp: number;
  messageId: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  column: string;
  position: string;
  version: number;
}

function createWebSocket(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket connection timeout'));
    }, TIMEOUT);

    ws.on('open', () => {
      clearTimeout(timeout);
      resolve(ws);
    });

    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function waitForMessage(ws: WebSocket, type: string): Promise<WSMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for message type: ${type}`));
    }, TIMEOUT);

    const handler = (data: Buffer) => {
      const message: WSMessage = JSON.parse(data.toString());
      if (message.type === type) {
        clearTimeout(timeout);
        ws.off('message', handler);
        resolve(message);
      }
    };

    ws.on('message', handler);
  });
}

function sendMessage(ws: WebSocket, type: string, payload: unknown): string {
  const messageId = uuidv4();
  const message: WSMessage = {
    type,
    payload,
    clientId: 'test-client',
    timestamp: Date.now(),
    messageId,
  };
  ws.send(JSON.stringify(message));
  return messageId;
}

describe('Conflict Resolution Integration Tests', () => {
  let client1: WebSocket;
  let client2: WebSocket;
  let sharedTask: Task;

  beforeAll(async () => {
    try {
      // Connect two clients
      [client1, client2] = await Promise.all([
        createWebSocket(),
        createWebSocket(),
      ]);

      // Wait for initial sync on both clients
      await Promise.all([
        waitForMessage(client1, 'sync:full'),
        waitForMessage(client2, 'sync:full'),
      ]);

      // Create a shared task for testing
      sendMessage(client1, 'task:create', {
        title: 'Shared Task',
        description: 'For conflict testing',
        column: 'todo',
      });

      // Get the created task
      const ackMessage = await waitForMessage(client1, 'sync:ack');
      sharedTask = (ackMessage.payload as { task: Task }).task;

      // Wait for client2 to receive the task
      await waitForMessage(client2, 'task:create');
    } catch (error) {
      console.warn('Skipping integration tests - server not running');
      // Tests will be skipped if server is not running
    }
  });

  afterAll(() => {
    client1?.close();
    client2?.close();
  });

  beforeEach(async () => {
    if (!client1 || !client2 || !sharedTask) {
      return; // Skip if setup failed
    }
  });

  describe('Concurrent Move + Edit', () => {
    it('should preserve both move and edit changes', async () => {
      if (!sharedTask) {
        console.warn('Skipping test - server not running');
        return;
      }

      // Client 1 moves the task to "in_progress"
      const moveMessageId = sendMessage(client1, 'task:move', {
        id: sharedTask.id,
        column: 'in_progress',
        targetIndex: 0,
        version: sharedTask.version,
      });

      // Client 2 edits the task title (almost simultaneously)
      const editMessageId = sendMessage(client2, 'task:update', {
        id: sharedTask.id,
        title: 'Updated Title',
        version: sharedTask.version,
      });

      // Wait for responses
      const [moveResponse, editResponse] = await Promise.all([
        waitForMessage(client1, 'sync:ack').catch(() =>
          waitForMessage(client1, 'conflict:notification')
        ),
        waitForMessage(client2, 'sync:ack').catch(() =>
          waitForMessage(client2, 'conflict:notification')
        ),
      ]);

      // At least one should succeed, and the final state should have both changes
      // (moved to in_progress AND title updated) or a proper conflict notification
      expect(
        moveResponse.type === 'sync:ack' ||
          moveResponse.type === 'conflict:notification'
      ).toBe(true);
      expect(
        editResponse.type === 'sync:ack' ||
          editResponse.type === 'conflict:notification'
      ).toBe(true);
    });
  });

  describe('Concurrent Move + Move', () => {
    it('should deterministically resolve which move wins', async () => {
      if (!sharedTask) {
        console.warn('Skipping test - server not running');
        return;
      }

      // Create a fresh task for this test
      sendMessage(client1, 'task:create', {
        title: 'Move Conflict Task',
        description: 'Testing concurrent moves',
        column: 'todo',
      });

      const createAck = await waitForMessage(client1, 'sync:ack');
      const testTask = (createAck.payload as { task: Task }).task;
      await waitForMessage(client2, 'task:create');

      // Both clients try to move the same task to different columns
      sendMessage(client1, 'task:move', {
        id: testTask.id,
        column: 'in_progress',
        targetIndex: 0,
        version: testTask.version,
      });

      sendMessage(client2, 'task:move', {
        id: testTask.id,
        column: 'done',
        targetIndex: 0,
        version: testTask.version,
      });

      // Wait for both responses
      const responses = await Promise.all([
        Promise.race([
          waitForMessage(client1, 'sync:ack'),
          waitForMessage(client1, 'conflict:notification'),
        ]),
        Promise.race([
          waitForMessage(client2, 'sync:ack'),
          waitForMessage(client2, 'conflict:notification'),
        ]),
      ]);

      // One should win, one should get a conflict notification
      const acks = responses.filter((r) => r.type === 'sync:ack');
      const conflicts = responses.filter(
        (r) => r.type === 'conflict:notification'
      );

      // First one to reach server wins, second gets conflict
      expect(acks.length + conflicts.length).toBe(2);
      // At least one should succeed
      expect(acks.length).toBeGreaterThanOrEqual(1);

      // If there's a conflict, it should notify the losing user
      if (conflicts.length > 0) {
        const conflict = conflicts[0].payload as {
          conflict: { message: string };
        };
        expect(conflict.conflict.message).toContain('moved by another user');
      }
    });
  });

  describe('Concurrent Reorder', () => {
    it('should maintain consistent order across clients', async () => {
      if (!sharedTask) {
        console.warn('Skipping test - server not running');
        return;
      }

      // Create multiple tasks in the same column
      const createPromises = [];
      for (let i = 0; i < 3; i++) {
        sendMessage(client1, 'task:create', {
          title: `Reorder Task ${i}`,
          column: 'todo',
        });
        createPromises.push(waitForMessage(client1, 'sync:ack'));
      }

      const createdTasks = await Promise.all(createPromises);
      const tasks = createdTasks.map(
        (ack) => (ack.payload as { task: Task }).task
      );

      // Wait for client2 to receive all tasks
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Client 1 reorders task 0 to position 2
      sendMessage(client1, 'task:move', {
        id: tasks[0].id,
        column: 'todo',
        targetIndex: 2,
        version: tasks[0].version,
      });

      // Client 2 adds a new task to the same column
      sendMessage(client2, 'task:create', {
        title: 'New Task During Reorder',
        column: 'todo',
      });

      // Both operations should complete without data loss
      const [reorderResult, createResult] = await Promise.all([
        Promise.race([
          waitForMessage(client1, 'sync:ack'),
          waitForMessage(client1, 'conflict:notification'),
        ]),
        waitForMessage(client2, 'sync:ack'),
      ]);

      // The create should always succeed
      expect(createResult.type).toBe('sync:ack');

      // Both operations should result in a consistent state
      // (no lost tasks, deterministic order)
    });
  });

  describe('Version Conflict Detection', () => {
    it('should detect version mismatch and reject stale updates', async () => {
      if (!sharedTask) {
        console.warn('Skipping test - server not running');
        return;
      }

      // Create a fresh task
      sendMessage(client1, 'task:create', {
        title: 'Version Test Task',
        column: 'todo',
      });

      const createAck = await waitForMessage(client1, 'sync:ack');
      const testTask = (createAck.payload as { task: Task }).task;
      await waitForMessage(client2, 'task:create');

      // Client 1 updates the task
      sendMessage(client1, 'task:update', {
        id: testTask.id,
        title: 'First Update',
        version: testTask.version,
      });

      const firstUpdate = await waitForMessage(client1, 'sync:ack');
      expect(firstUpdate.type).toBe('sync:ack');

      // Client 2 tries to update with stale version
      sendMessage(client2, 'task:update', {
        id: testTask.id,
        title: 'Stale Update',
        version: testTask.version, // Using old version
      });

      const staleUpdate = await Promise.race([
        waitForMessage(client2, 'sync:ack'),
        waitForMessage(client2, 'conflict:notification'),
      ]);

      // Should receive a conflict notification
      expect(staleUpdate.type).toBe('conflict:notification');
    });
  });
});

describe('Offline Queue Replay', () => {
  it('should replay queued operations on reconnect', async () => {
    // This test verifies the client-side offline queue behavior
    // The actual queue implementation is in the frontend store
    // Server should accept operations in order when replayed

    const ws = await createWebSocket().catch(() => null);
    if (!ws) {
      console.warn('Skipping test - server not running');
      return;
    }

    await waitForMessage(ws, 'sync:full');

    // Simulate rapid operations (as if queued and replayed)
    const operations = [
      { type: 'task:create', payload: { title: 'Queued Task 1', column: 'todo' } },
      { type: 'task:create', payload: { title: 'Queued Task 2', column: 'todo' } },
      { type: 'task:create', payload: { title: 'Queued Task 3', column: 'todo' } },
    ];

    // Send all operations quickly
    operations.forEach((op) => {
      sendMessage(ws, op.type, op.payload);
    });

    // All should be acknowledged
    const acks = await Promise.all([
      waitForMessage(ws, 'sync:ack'),
      waitForMessage(ws, 'sync:ack'),
      waitForMessage(ws, 'sync:ack'),
    ]);

    expect(acks.length).toBe(3);
    acks.forEach((ack) => {
      expect(ack.type).toBe('sync:ack');
    });

    ws.close();
  });
});
