import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Service for rate limiting to prevent abuse
 * Uses Redis to track message counts per chat
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private redis: Redis;

  constructor(private readonly configService: ConfigService) {
    // Initialize Redis connection
    const redisHost = this.configService.get<string>('REDIS_HOST', 'localhost');
    const redisPort = this.configService.get<number>('REDIS_PORT', 6379);
    const redisPassword = this.configService.get<string>('REDIS_PASSWORD');
    const redisDb = this.configService.get<number>('REDIS_DB', 0);

    this.redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      db: redisDb,
      retryStrategy: (times) => {
        if (times > 3) {
          this.logger.error('Failed to connect to Redis after 3 attempts');
          return null;
        }
        return Math.min(times * 1000, 3000);
      },
    });

    this.redis.on('connect', () => {
      this.logger.log('✅ Connected to Redis for rate limiting');
    });

    this.redis.on('error', (error) => {
      this.logger.error('Redis error:', error);
    });
  }

  /**
   * Check if a chat has exceeded the rate limit
   * @param chatId - WhatsApp chat ID
   * @param limit - Maximum messages per window (default: 10)
   * @param windowSeconds - Time window in seconds (default: 60)
   * @returns true if rate limit exceeded, false otherwise
   */
  async checkRateLimit(
    chatId: string,
    limit: number = 10,
    windowSeconds: number = 60,
  ): Promise<{ limited: boolean; remaining: number; resetAt: Date }> {
    try {
      const key = `ratelimit:${chatId}`;

      // Increment counter
      const count = await this.redis.incr(key);

      // Set expiration on first increment
      if (count === 1) {
        await this.redis.expire(key, windowSeconds);
      }

      // Get TTL to calculate reset time
      const ttl = await this.redis.ttl(key);
      const resetAt = new Date(Date.now() + ttl * 1000);

      const remaining = Math.max(0, limit - count);
      const limited = count > limit;

      if (limited) {
        this.logger.warn(
          `Rate limit exceeded for ${chatId}: ${count}/${limit} in ${windowSeconds}s`,
        );
      }

      return {
        limited,
        remaining,
        resetAt,
      };
    } catch (error: any) {
      this.logger.error('Error checking rate limit:', error.message);
      // On error, allow the request (fail open)
      return {
        limited: false,
        remaining: 10,
        resetAt: new Date(Date.now() + 60000),
      };
    }
  }

  /**
   * Reset rate limit for a chat
   * @param chatId - WhatsApp chat ID
   */
  async resetRateLimit(chatId: string): Promise<void> {
    try {
      const key = `ratelimit:${chatId}`;
      await this.redis.del(key);
      this.logger.log(`Rate limit reset for ${chatId}`);
    } catch (error: any) {
      this.logger.error('Error resetting rate limit:', error.message);
    }
  }

  /**
   * Get current rate limit status for a chat
   * @param chatId - WhatsApp chat ID
   */
  async getRateLimitStatus(chatId: string): Promise<{
    count: number;
    ttl: number;
  }> {
    try {
      const key = `ratelimit:${chatId}`;
      const count = await this.redis.get(key);
      const ttl = await this.redis.ttl(key);

      return {
        count: count ? parseInt(count, 10) : 0,
        ttl: ttl > 0 ? ttl : 0,
      };
    } catch (error: any) {
      this.logger.error('Error getting rate limit status:', error.message);
      return { count: 0, ttl: 0 };
    }
  }

  /**
   * Clean up Redis connection on module destroy
   */
  async onModuleDestroy() {
    await this.redis.quit();
    this.logger.log('🔌 Redis connection closed');
  }
}
