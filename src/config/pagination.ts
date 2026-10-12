import { z } from 'zod';

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE)
});

export interface Pagination {
  page: number;
  pageSize: number;
  offset: number;
}

export function parsePagination(input: unknown): Pagination {
  const parsed = paginationSchema.parse(input);
  return {
    page: parsed.page,
    pageSize: parsed.pageSize,
    offset: (parsed.page - 1) * parsed.pageSize
  };
}

export function paginationMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize)
  };
}

