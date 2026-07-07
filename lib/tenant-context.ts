import { AsyncLocalStorage } from 'async_hooks';

export const tenantStorage = new AsyncLocalStorage<{ tenantId: string; bypassRls?: boolean }>();
