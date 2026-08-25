import { Injectable } from '@nestjs/common';
import { Category, Prisma } from '@prisma/client';
import { AppException } from '@/common/errors';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Archived categories are hidden by default so they stop appearing in pickers (PRD 6.12). */
  list(userId: number, includeArchived = false): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { userId, ...(includeArchived ? {} : { isArchived: false }) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findOwned(userId: number, id: number): Promise<Category> {
    const category = await this.prisma.category.findFirst({ where: { id, userId } });

    if (!category) {
      throw AppException.notFound(`category ${id} not found`);
    }

    return category;
  }

  async create(userId: number, dto: CreateCategoryDto): Promise<Category> {
    const nextSortOrder = await this.prisma.category.count({ where: { userId } });

    try {
      return await this.prisma.category.create({
        data: {
          userId,
          name: dto.name.trim(),
          color: dto.color ?? '#64748B',
          icon: dto.icon ?? null,
          sortOrder: nextSortOrder,
        },
      });
    } catch (error) {
      throw this.translateDuplicateName(error, dto.name);
    }
  }

  async update(userId: number, id: number, dto: UpdateCategoryDto): Promise<Category> {
    await this.findOwned(userId, id);

    try {
      return await this.prisma.category.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.color !== undefined ? { color: dto.color } : {}),
          ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.isArchived !== undefined ? { isArchived: dto.isArchived } : {}),
        },
      });
    } catch (error) {
      throw this.translateDuplicateName(error, dto.name ?? '');
    }
  }

  /**
   * Archives rather than deletes (PRD 6.12).
   *
   * Old expenses keep pointing at the category, so historical reports stay intact; the
   * category simply stops being offered for new input.
   */
  async archive(userId: number, id: number): Promise<void> {
    await this.findOwned(userId, id);
    await this.prisma.category.update({ where: { id }, data: { isArchived: true } });
  }

  private translateDuplicateName(error: unknown, name: string): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return AppException.conflict(`a category named "${name}" already exists`);
    }
    return error;
  }
}
