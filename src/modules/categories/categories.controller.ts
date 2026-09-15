import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Category } from '@prisma/client';
import { WalletType } from '@prisma/client';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

export interface CategoryResponse {
  id: number;
  name: string;
  color: string;
  icon: string | null;
  sortOrder: number;
  isArchived: boolean;
}

export function toCategoryResponse(category: Category): CategoryResponse {
  return {
    id: category.id,
    name: category.name,
    color: category.color,
    icon: category.icon,
    sortOrder: category.sortOrder,
    isArchived: category.isArchived,
  };
}

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'List categories, archived ones excluded by default' })
  async list(
    @CurrentUser('id') userId: number,
    @Query('walletType') walletType?: string,
    @Query('includeArchived') includeArchived?: string,
  ): Promise<CategoryResponse[]> {
    const rows = await this.categories.list(
      userId,
      walletType === WalletType.SAVINGS ? WalletType.SAVINGS : WalletType.DATE_BUDGET,
      includeArchived === 'true',
    );
    return rows.map(toCategoryResponse);
  }

  @Post()
  @ApiOperation({ summary: 'Create a category' })
  async create(
    @CurrentUser('id') userId: number,
    @Body() dto: CreateCategoryDto,
  ): Promise<CategoryResponse> {
    return toCategoryResponse(await this.categories.create(userId, dto));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a category' })
  async update(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryResponse> {
    return toCategoryResponse(await this.categories.update(userId, id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Archive a category (never a hard delete)' })
  async archive(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.categories.archive(userId, id);
  }
}
