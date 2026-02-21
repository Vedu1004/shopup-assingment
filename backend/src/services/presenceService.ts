import { User } from '../types/index.js';

// Generate random colors for user avatars
const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  '#BB8FCE', '#85C1E9', '#F8B500', '#00CED1',
];

// Generate random adjectives and nouns for usernames
const ADJECTIVES = [
  'Happy', 'Clever', 'Swift', 'Bright', 'Bold',
  'Calm', 'Eager', 'Fancy', 'Jolly', 'Kind',
];

const NOUNS = [
  'Panda', 'Tiger', 'Eagle', 'Dolphin', 'Fox',
  'Owl', 'Wolf', 'Bear', 'Hawk', 'Lion',
];

class PresenceService {
  private users: Map<string, User> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup stale users every 30 seconds
    this.cleanupInterval = setInterval(() => this.cleanupStaleUsers(), 30000);
  }

  /**
   * Generate a random username
   */
  private generateUsername(): string {
    const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const number = Math.floor(Math.random() * 100);
    return `${adjective}${noun}${number}`;
  }

  /**
   * Generate a random color
   */
  private generateColor(): string {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
  }

  /**
   * Add a new user
   */
  addUser(userId: string): User {
    const user: User = {
      id: userId,
      name: this.generateUsername(),
      color: this.generateColor(),
      lastSeen: Date.now(),
    };
    this.users.set(userId, user);
    return user;
  }

  /**
   * Remove a user
   */
  removeUser(userId: string): User | undefined {
    const user = this.users.get(userId);
    this.users.delete(userId);
    return user;
  }

  /**
   * Get a user by ID
   */
  getUser(userId: string): User | undefined {
    return this.users.get(userId);
  }

  /**
   * Get all active users
   */
  getAllUsers(): User[] {
    return Array.from(this.users.values());
  }

  /**
   * Update user's last seen timestamp
   */
  updateLastSeen(userId: string): void {
    const user = this.users.get(userId);
    if (user) {
      user.lastSeen = Date.now();
    }
  }

  /**
   * Set user as editing a task
   */
  setEditing(userId: string, taskId: string | undefined): void {
    const user = this.users.get(userId);
    if (user) {
      user.editingTaskId = taskId;
      user.lastSeen = Date.now();
    }
  }

  /**
   * Get users editing a specific task
   */
  getUsersEditingTask(taskId: string): User[] {
    return Array.from(this.users.values()).filter(
      user => user.editingTaskId === taskId
    );
  }

  /**
   * Check if a task is being edited by another user
   */
  isTaskBeingEdited(taskId: string, excludeUserId?: string): boolean {
    return Array.from(this.users.values()).some(
      user => user.editingTaskId === taskId && user.id !== excludeUserId
    );
  }

  /**
   * Remove stale users (not seen in 60 seconds)
   */
  private cleanupStaleUsers(): void {
    const staleThreshold = Date.now() - 60000;
    for (const [userId, user] of this.users) {
      if (user.lastSeen < staleThreshold) {
        this.users.delete(userId);
        console.log(`Cleaned up stale user: ${user.name}`);
      }
    }
  }

  /**
   * Get user count
   */
  getUserCount(): number {
    return this.users.size;
  }

  /**
   * Cleanup on shutdown
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.users.clear();
  }
}

// Singleton instance
export const presenceService = new PresenceService();
