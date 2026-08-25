import { Injectable, Logger } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { AppException } from '@/common/errors';
import { PrismaService } from '@/prisma/prisma.service';
import { DEFAULT_CATEGORIES } from '../categories/default-categories';

/**
 * argon2id parameters (PRD 8.2). These are the argon2 library defaults for the id variant,
 * pinned explicitly so a library upgrade cannot silently weaken stored hashes.
 */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  hashPassword(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      // A malformed stored hash must read as "wrong password", never as a server error.
      return false;
    }
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  findById(id: number): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  count(): Promise<number> {
    return this.prisma.user.count();
  }

  /**
   * Creates a user together with their default categories, in one transaction so a user
   * can never exist with a half-seeded category list.
   *
   * There is no public registration endpoint (PRD 3); this is reached only from the CLI
   * or the empty-database bootstrap.
   */
  async createUser(input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<User> {
    const email = input.email.toLowerCase();
    const passwordHash = await this.hashPassword(input.password);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email, passwordHash, displayName: input.displayName },
        });

        await tx.category.createMany({
          data: DEFAULT_CATEGORIES.map((category, index) => ({
            userId: user.id,
            name: category.name,
            color: category.color,
            icon: category.icon,
            sortOrder: index,
          })),
        });

        return user;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw AppException.conflict(`a user with email ${email} already exists`);
      }
      throw error;
    }
  }

  async changePassword(userId: number, newPassword: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await this.hashPassword(newPassword) },
    });
  }
}
