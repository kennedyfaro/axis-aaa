import { HttpException, Inject, Injectable } from "@nestjs/common";
import { RateLimiterRedis } from "rate-limiter-flexible";
import type Redis from "ioredis";
import { PrismaService } from "./prisma.service";
import { sha256 } from "./crypto";
import { REDIS } from "./redis.module";

const ACCOUNT_WINDOW_SECONDS = 15 * 60;
const ACCOUNT_BLOCK_SECONDS = 15 * 60;
const CONFIG_CACHE_SECONDS = 60;
const IP_LIMIT_POINTS = 30;

@Injectable()
export class RateLimitService {
  private readonly ipLimiter: RateLimiterRedis;
  private readonly loginLimiter: RateLimiterRedis;
  private readonly mfaLimiter: RateLimiterRedis;
  private readonly healthLimiter: RateLimiterRedis;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {
    this.ipLimiter = new RateLimiterRedis({
      storeClient: redis,
      keyPrefix: "rl:ip",
      points: IP_LIMIT_POINTS,
      duration: 300,
      blockDuration: 300,
    });
    this.loginLimiter = new RateLimiterRedis({
      storeClient: redis,
      keyPrefix: "rl:login",
      points: 10,
      duration: 300,
      blockDuration: 300,
    });
    this.mfaLimiter = new RateLimiterRedis({
      storeClient: redis,
      keyPrefix: "rl:mfa",
      points: 12,
      duration: 300,
      blockDuration: 300,
    });
    this.healthLimiter = new RateLimiterRedis({
      storeClient: redis,
      keyPrefix: "rl:health",
      points: 60,
      duration: 60,
      blockDuration: 60,
    });
  }

  /** Protege o endpoint público de saúde contra varredura/DoS barato. */
  async health(ip: string) {
    await this.consume(
      this.healthLimiter,
      ip,
      "Muitas consultas de saúde. Tente novamente em instantes.",
    );
  }

  async login(ip: string, account: string) {
    await this.consume(this.ipLimiter, ip, "Muitas tentativas de login. Tente novamente em alguns minutos.");
    await this.consume(
      this.loginLimiter,
      `${ip}:${account.toLowerCase()}`,
      "Muitas tentativas de login. Tente novamente em alguns minutos.",
    );
    await this.assertAccountAllowed(account);
  }

  async mfa(key: string) {
    await this.consume(this.mfaLimiter, key, "Muitas tentativas de código. Tente novamente em alguns minutos.");
  }

  async recordAccountFailure(account: string): Promise<{ locked: boolean; count: number }> {
    const key = this.accountKey(account);
    try {
      const count = await this.redis.incr(`rl:account:fail:${key}`);
      if (count === 1) {
        await this.redis.expire(`rl:account:fail:${key}`, ACCOUNT_WINDOW_SECONDS);
      }
      const maxAttempts = await this.maxLoginAttempts();
      if (count >= maxAttempts) {
        await this.redis.set(`rl:account:block:${key}`, "1", "EX", ACCOUNT_BLOCK_SECONDS);
        await this.redis.del(`rl:account:fail:${key}`);
        return { locked: true, count };
      }
      return { locked: false, count };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        "Muitas tentativas de login. Tente novamente em alguns minutos.",
        429,
      );
    }
  }

  async resetAccount(account: string) {
    const key = this.accountKey(account);
    await this.redis.del(`rl:account:fail:${key}`, `rl:account:block:${key}`);
  }

  private async assertAccountAllowed(account: string) {
    const key = this.accountKey(account);
    try {
      if (await this.redis.exists(`rl:account:block:${key}`)) {
        throw new HttpException(
          "Muitas tentativas de login. Tente novamente em alguns minutos.",
          429,
        );
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        "Muitas tentativas de login. Tente novamente em alguns minutos.",
        429,
      );
    }
  }

  private accountKey(account: string) {
    return sha256(account.trim().toLowerCase());
  }

  private async maxLoginAttempts() {
    const cached = await this.redis.get("rl:config:maxLoginAttempts");
    if (cached) {
      const parsed = Number(cached);
      if (Number.isInteger(parsed) && parsed >= 3 && parsed <= 20) return parsed;
    }
    try {
      const settings = await this.prisma.setting.findUnique({ where: { id: 1 } });
      const value = settings?.maxLoginAttempts ?? 5;
      await this.redis.set("rl:config:maxLoginAttempts", String(value), "EX", CONFIG_CACHE_SECONDS);
      return value;
    } catch {
      return 5;
    }
  }

  private async consume(limiter: RateLimiterRedis, key: string, message: string) {
    try {
      await limiter.consume(key);
    } catch {
      throw new HttpException(message, 429);
    }
  }
}
