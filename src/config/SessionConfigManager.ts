import { SessionConfig, SwaggerConfig, GlobalConfig } from './types.js';
import logger from '../utils/logger.js';

export class SessionConfigManager {
  private sessions = new Map<string, SessionConfig>();
  private globalConfig: GlobalConfig;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(globalConfig: Partial<GlobalConfig> = {}) {
    this.globalConfig = {
      defaultCacheTTL: 10 * 60 * 1000, // 10 minutes
      maxSessions: 100,
      sessionCleanupInterval: 5 * 60 * 1000, // 5 minutes
      memoryThreshold: 512, // 512MB
      logLevel: 'info',
      ...globalConfig
    };

    // Start automatic cleanup
    this.startCleanupTimer();
  }

  /**
   * Create or update a session configuration
   */
  createOrUpdateSession(sessionId: string, config: SwaggerConfig): SessionConfig {
    const now = Date.now();
    const existingSession = this.sessions.get(sessionId);

    const sessionConfig: SessionConfig = {
      id: sessionId,
      swaggerUrls: config.swaggerUrls,
      customHeaders: config.customHeaders || {},
      cacheTTL: config.cacheTTL || this.globalConfig.defaultCacheTTL,
      rateLimit: config.rateLimit,
      createdAt: existingSession?.createdAt || now,
      lastAccessed: now,
      isActive: true
    };

    // Check session limit
    if (!existingSession && this.sessions.size >= this.globalConfig.maxSessions) {
      this.removeOldestInactiveSession();
    }

    this.sessions.set(sessionId, sessionConfig);
    logger.info(`Session ${sessionId} ${existingSession ? 'updated' : 'created'}`, {
      urls: sessionConfig.swaggerUrls.length,
      cacheTTL: sessionConfig.cacheTTL
    });

    return sessionConfig;
  }

  /**
   * Get session configuration by ID
   */
  getSession(sessionId: string): SessionConfig | null {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastAccessed = Date.now();
      return session;
    }
    return null;
  }

  /**
   * Update session access time
   */
  updateAccessTime(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastAccessed = Date.now();
      return true;
    }
    return false;
  }

  /**
   * Deactivate a session
   */
  deactivateSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isActive = false;
      logger.info(`Session ${sessionId} deactivated`);
      return true;
    }
    return false;
  }

  /**
   * Remove a session completely
   */
  removeSession(sessionId: string): boolean {
    const removed = this.sessions.delete(sessionId);
    if (removed) {
      logger.info(`Session ${sessionId} removed`);
    }
    return removed;
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions(): number {
    const now = Date.now();
    let removedCount = 0;

    for (const [sessionId, session] of this.sessions) {
      const age = now - session.lastAccessed;
      const sessionTTL = session.cacheTTL || this.globalConfig.defaultCacheTTL;

      if (age > sessionTTL || !session.isActive) {
        this.sessions.delete(sessionId);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.info(`Cleaned up ${removedCount} expired sessions`);
    }

    return removedCount;
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.isActive) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get total session count
   */
  getTotalSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): SessionConfig[] {
    return Array.from(this.sessions.values()).filter(session => session.isActive);
  }

  /**
   * Get session statistics
   */
  getStats() {
    const activeSessions = this.getActiveSessionCount();
    const totalSessions = this.getTotalSessionCount();
    const memoryUsage = process.memoryUsage();

    return {
      activeSessions,
      totalSessions,
      memoryUsage: {
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100, // MB
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024 * 100) / 100, // MB
        external: Math.round(memoryUsage.external / 1024 / 1024 * 100) / 100 // MB
      },
      memoryThreshold: this.globalConfig.memoryThreshold,
      isNearMemoryLimit: memoryUsage.heapUsed > (this.globalConfig.memoryThreshold * 1024 * 1024 * 0.8)
    };
  }

  /**
   * Remove the oldest inactive session to make room
   */
  private removeOldestInactiveSession(): void {
    let oldestSession: SessionConfig | null = null;
    let oldestTime = Date.now();

    for (const session of this.sessions.values()) {
      if (!session.isActive && session.lastAccessed < oldestTime) {
        oldestTime = session.lastAccessed;
        oldestSession = session;
      }
    }

    if (oldestSession) {
      this.sessions.delete(oldestSession.id);
      logger.info(`Removed oldest inactive session: ${oldestSession.id}`);
    }
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      try {
        this.cleanupExpiredSessions();

        // Log periodic stats
        const stats = this.getStats();
        if (stats.isNearMemoryLimit) {
          logger.warn('Memory usage approaching threshold', stats);
        }
      } catch (error) {
        logger.error('Error during session cleanup:', error);
      }
    }, this.globalConfig.sessionCleanupInterval);
  }

  /**
   * Stop cleanup timer
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Destroy all sessions and stop timers
   */
  destroy(): void {
    this.stopCleanupTimer();
    this.sessions.clear();
    logger.info('SessionConfigManager destroyed');
  }
}

// Singleton instance
let instance: SessionConfigManager | null = null;

export function getSessionConfigManager(config?: Partial<GlobalConfig>): SessionConfigManager {
  if (!instance) {
    instance = new SessionConfigManager(config);
  }
  return instance;
}

export function resetSessionConfigManager(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}