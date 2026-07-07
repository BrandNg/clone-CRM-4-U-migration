import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock ioredis so the cache layer talks to a fake client (no real Redis).
const { scanMock, delMock, getMock, setexMock } = vi.hoisted(() => ({
  scanMock: vi.fn(),
  delMock: vi.fn(),
  getMock: vi.fn(),
  setexMock: vi.fn(),
}));

vi.mock('ioredis', () => ({
  Redis: class {
    scan = scanMock;
    del = delMock;
    get = getMock;
    setex = setexMock;
    on = vi.fn();
  },
}));

import { cacheDel, cacheGet, cacheSet, listKey, invalidateList } from '@/lib/cache';

const PREFIX = 'crm4u:cache:';

describe('cacheDel — prefix invalidation', () => {
  beforeEach(() => {
    scanMock.mockReset();
    delMock.mockReset();
  });

  it('SCANs the prefix pattern and DELs the matched keys', async () => {
    scanMock.mockResolvedValueOnce(['0', [`${PREFIX}campaigns:list`, `${PREFIX}campaigns:clients`]]);

    await cacheDel('campaigns:');

    expect(scanMock).toHaveBeenCalledWith('0', 'MATCH', `${PREFIX}campaigns:*`, 'COUNT', 100);
    expect(delMock).toHaveBeenCalledWith(`${PREFIX}campaigns:list`, `${PREFIX}campaigns:clients`);
  });

  it('clears keyed variants the old single-key delete would have missed', async () => {
    // templates cache under templates:<channel>:<search> — many variants
    scanMock.mockResolvedValueOnce(['0', [`${PREFIX}templates::`, `${PREFIX}templates:email:`, `${PREFIX}templates::hello`]]);

    await cacheDel('templates:');

    expect(delMock).toHaveBeenCalledWith(`${PREFIX}templates::`, `${PREFIX}templates:email:`, `${PREFIX}templates::hello`);
  });

  it('follows the SCAN cursor across multiple pages', async () => {
    scanMock
      .mockResolvedValueOnce(['7', [`${PREFIX}sequences:false`]])
      .mockResolvedValueOnce(['0', [`${PREFIX}sequences:true`]]);

    await cacheDel('sequences:');

    expect(scanMock).toHaveBeenCalledTimes(2);
    expect(delMock).toHaveBeenCalledTimes(2);
    expect(delMock).toHaveBeenNthCalledWith(1, `${PREFIX}sequences:false`);
    expect(delMock).toHaveBeenNthCalledWith(2, `${PREFIX}sequences:true`);
  });

  it('does not DEL when the scan returns no keys', async () => {
    scanMock.mockResolvedValueOnce(['0', []]);

    await cacheDel('campaigns:');

    expect(delMock).not.toHaveBeenCalled();
  });

  it('never throws when Redis errors (cache is optional)', async () => {
    scanMock.mockRejectedValueOnce(new Error('connection refused'));
    await expect(cacheDel('campaigns:')).resolves.toBeUndefined();
  });
});

describe('cacheGet / cacheSet', () => {
  beforeEach(() => {
    getMock.mockReset();
    setexMock.mockReset();
  });

  it('parses a cached JSON value', async () => {
    getMock.mockResolvedValueOnce(JSON.stringify({ a: 1 }));
    expect(await cacheGet<{ a: number }>('k')).toEqual({ a: 1 });
  });

  it('returns null on a miss', async () => {
    getMock.mockResolvedValueOnce(null);
    expect(await cacheGet('k')).toBeNull();
  });

  it('returns null (never throws) when Redis errors', async () => {
    getMock.mockRejectedValueOnce(new Error('down'));
    expect(await cacheGet('k')).toBeNull();
  });

  it('writes with the prefix + TTL', async () => {
    await cacheSet('k', { a: 1 }, 30);
    expect(setexMock).toHaveBeenCalledWith(`${PREFIX}k`, 30, JSON.stringify({ a: 1 }));
  });
});

describe('listKey / invalidateList — tenant scoping', () => {
  beforeEach(() => {
    scanMock.mockReset();
    delMock.mockReset();
  });

  it('builds a tenant-scoped read key', () => {
    expect(listKey('t1', 'campaigns', 'list')).toBe('t1:campaigns:list');
    expect(listKey('t1', 'templates', 'email:hi')).toBe('t1:templates:email:hi');
  });

  it('falls back to default-tenant when tenantId is undefined', () => {
    expect(listKey(undefined, 'sequences', 'false')).toBe('default-tenant:sequences:false');
  });

  it('invalidateList clears the exact tenant+resource prefix that listKey writes under', async () => {
    // read key and invalidation prefix must align (the bug this guards against)
    const key = listKey('t1', 'campaigns', 'list'); // t1:campaigns:list
    scanMock.mockResolvedValueOnce(['0', [`${PREFIX}${key}`]]);

    await invalidateList('t1', 'campaigns');

    expect(scanMock).toHaveBeenCalledWith('0', 'MATCH', `${PREFIX}t1:campaigns:*`, 'COUNT', 100);
    expect(delMock).toHaveBeenCalledWith(`${PREFIX}t1:campaigns:list`);
  });

  it('does not cross tenants when invalidating', async () => {
    scanMock.mockResolvedValueOnce(['0', []]);
    await invalidateList('t2', 'sequences');
    expect(scanMock).toHaveBeenCalledWith('0', 'MATCH', `${PREFIX}t2:sequences:*`, 'COUNT', 100);
  });
});
