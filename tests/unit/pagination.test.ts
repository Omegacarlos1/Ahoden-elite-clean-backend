import { expect } from 'chai';

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  paginationMeta,
  parsePagination
} from '../../src/config/pagination.js';

describe('pagination conventions', () => {
  it('uses one-based pages and a bounded default', () => {
    expect(parsePagination({})).to.deep.equal({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      offset: 0
    });
  });

  it('computes offsets and metadata', () => {
    expect(parsePagination({ page: '3', pageSize: '10' })).to.deep.equal({
      page: 3,
      pageSize: 10,
      offset: 20
    });
    expect(paginationMeta(3, 10, 21)).to.deep.equal({
      page: 3,
      pageSize: 10,
      total: 21,
      totalPages: 3
    });
  });

  it('rejects unbounded page sizes', () => {
    expect(() => parsePagination({ pageSize: MAX_PAGE_SIZE + 1 })).to.throw();
  });
});

