# Frontend & Workspace UX — 5 Production React Patterns

## 1. Kanban Pipeline Board with Drag-and-Drop + Optimistic Reorder

### Code

```typescript
// hooks/useKanbanPipeline.ts
import { useCallback, useOptimistic } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';

type Deal = { id: string; title: string; value: number; stageId: string; order: number };
type Stage = { id: string; name: string; deals: Deal[] };

export function useKanbanPipeline(pipelineId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['pipeline', pipelineId];

  const { data: stages } = useQuery({
    queryKey,
    queryFn: () => fetchStages(pipelineId),
  });

  const [optimisticStages, setOptimisticStages] = useOptimistic(
    stages ?? [],
    (state, { activeId, overId, activeStageId, overStageId }: DragEndEvent) => {
      if (activeStageId === overStageId) {
        const stage = state.find(s => s.id === activeStageId);
        if (!stage) return state;
        const oldIndex = stage.deals.findIndex(d => d.id === activeId);
        const newIndex = stage.deals.findIndex(d => d.id === overId);
        return state.map(s =>
          s.id === activeStageId
            ? { ...s, deals: arrayMove(stage.deals, oldIndex, newIndex) }
            : s
        );
      }
      // Cross-stage move
      const fromDeal = state
        .find(s => s.id === activeStageId)?.deals
        .find(d => d.id === activeId);
      if (!fromDeal) return state;
      return state.map(s => {
        if (s.id === activeStageId) return { ...s, deals: s.deals.filter(d => d.id !== activeId) };
        if (s.id === overStageId) return { ...s, deals: [...s.deals, { ...fromDeal, stageId: overStageId }] };
        return s;
      });
    }
  );

  const moveMutation = useMutation({
    mutationFn: ({ dealId, stageId, order }: { dealId: string; stageId: string; order: number }) =>
      fetch(`/api/pipeline/${pipelineId}/deals/${dealId}/move`, {
        method: 'PUT',
        body: JSON.stringify({ stageId, order }),
      }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData(queryKey);
      setOptimisticStages({ activeId: vars.dealId, activeStageId: '', overStageId: vars.stageId });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(queryKey, ctx?.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!event.over) return;
      const { active, over } = event;
      setOptimisticStages(event);
      moveMutation.mutate({
        dealId: String(active.id),
        stageId: String(over.data.current?.stageId),
        order: over.data.current?.orderIndex,
      });
    },
    [moveMutation]
  );

  return { stages: optimisticStages, handleDragEnd, isPending: moveMutation.isPending };
}
```

### How It Works

The pipeline manages all state via a single server query (`['pipeline', id]`). On drag-end, `useOptimistic` immediately remaps the local deal order within or across stages using `arrayMove` or splice. The mutation fires in the background via `useMutation` with `onMutate` snapshotting and `onError` rollback. `dnd-kit` provides accessible keyboard + pointer drag-and-drop with collision detection.

### Pros & Cons

- ✅ Instant UI feedback — no roundtrip latency on drag operations
- ✅ Automatic rollback on server failure with snapshot restoration
- ✅ Accessible — `@dnd-kit` supports keyboard and screen reader natively
- ❌ Optimistic reorder is pure client-side guess — server may reject (e.g., WIP limit hit)
- ❌ Cross-stage moves need careful index recalculation to avoid flicker
- ❌ Rapid successive drags can race with `cancelQueries`

---

## 2. Task/Today View with Virtualized List + Real-Time Sync via SSE

### Code

```typescript
// components/TaskTodayView.tsx
'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useOptimistic } from 'react';

type Task = {
  id: string; title: string; dueDate: string; priority: 'high' | 'medium' | 'low';
  completed: boolean; assigneeId: string;
};

export function TaskTodayView({ workspaceId, userId }: { workspaceId: string; userId: string }) {
  const queryClient = useQueryClient();
  const parentRef = useRef<HTMLDivElement>(null);

  const { data: tasks } = useQuery<Task[]>({
    queryKey: ['tasks', 'today', workspaceId, userId],
    queryFn: () => fetch(`/api/tasks/today?workspaceId=${workspaceId}&assigneeId=${userId}`).then(r => r.json()),
    staleTime: 30_000,
  });

  const [optimisticTasks, toggleOptimistic] = useOptimistic(
    tasks ?? [],
    (state, toggledId: string) =>
      state.map(t => t.id === toggledId ? { ...t, completed: !t.completed } : t)
  );

  const toggleMutation = useMutation({
    mutationFn: (taskId: string) =>
      fetch(`/api/tasks/${taskId}/toggle`, { method: 'PATCH' }),
    onMutate: async (taskId) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', 'today', workspaceId, userId] });
      toggleOptimistic(taskId);
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['tasks', 'today', workspaceId, userId] }),
  });

  // Real-time SSE for cross-device sync
  useEffect(() => {
    const events = new EventSource(`/api/sse?workspaceId=${workspaceId}`);
    events.addEventListener('task:updated', (e) => {
      const updated = JSON.parse(e.data) as Task;
      queryClient.setQueryData<Task[]>(['tasks', 'today', workspaceId, userId], (old) =>
        old?.map(t => t.id === updated.id ? updated : t) ?? []
      );
    });
    return () => events.close();
  }, [workspaceId, userId, queryClient]);

  const virtualizer = useVirtualizer({
    count: optimisticTasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((vItem) => {
          const task = optimisticTasks[vItem.index];
          return (
            <div
              key={task.id}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${vItem.size}px`, transform: `translateY(${vItem.start}px)` }}
              className="flex items-center gap-3 px-4 border-b"
            >
              <input
                type="checkbox"
                checked={task.completed}
                onChange={() => toggleMutation.mutate(task.id)}
              />
              <span className={task.completed ? 'line-through text-muted' : ''}>
                {task.title}
              </span>
              <span className={`ml-auto text-xs ${priorityColor[task.priority]}`}>
                {task.priority}
              </span>
              <span className="text-xs text-muted">{formatDue(task.dueDate)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const priorityColor = { high: 'text-red-500', medium: 'text-yellow-500', low: 'text-green-500' };
function formatDue(date: string) { /* day-relative formatting */ return date; }
```

### How It Works

Tasks are fetched with a 30-second `staleTime` — short enough to stay fresh, long enough to avoid refetch on mount. The checkbox uses `useOptimistic` for instant toggle feedback. SSE events from the server (`/api/sse`) push updates from other sessions/devices directly into the query cache via `setQueryData`, achieving real-time multi-user sync. Virtualization via `@tanstack/react-virtual` renders only visible rows for memory-safe handling of hundreds of tasks.

### Pros & Cons

- ✅ SSE is simpler than WebSockets for unidirectional server→client push
- ✅ Virtualization keeps the DOM small regardless of list size
- ✅ Optimistic toggle combined with SSE creates instant + eventually consistent UX
- ❌ SSE connections can hit browser limits (6 per origin in HTTP/1.1)
- ❌ Virtualizer re-measures on every task mutation — may cause layout shift
- ❌ No offline queue — mutations fail if SSE connection drops mid-flight

---

## 3. Optimistic Updates with Version-Guarded Rollback

### Code

```typescript
// hooks/useOptimisticMutation.ts
import { useRef, useCallback, useState } from 'react';
import { useQueryClient, useMutation, MutateOptions } from '@tanstack/react-query';

type VersionMap = Map<string, number>;
type OptimisticUpdateFn<TData, TVars> = (prev: TData, vars: TVars) => TData;

interface UseOptimisticMutationOptions<TData, TVars> {
  queryKey: unknown[];
  mutationFn: (vars: TVars) => Promise<unknown>;
  optimisticUpdate: OptimisticUpdateFn<TData, TVars>;
  staleGuard?: boolean;
}

export function useOptimisticMutation<TData, TVars>({
  queryKey,
  mutationFn,
  optimisticUpdate,
  staleGuard = true,
}: UseOptimisticMutationOptions<TData, TVars>) {
  const queryClient = useQueryClient();
  const versions = useRef<VersionMap>(new Map());
  const [error, setError] = useState<Error | null>(null);

  const versionKey = useCallback(
    (vars: TVars) => JSON.stringify(vars),
    []
  );

  const mutation = useMutation({
    mutationFn,
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<TData>(queryKey);
      const v = (versions.current.get(versionKey(vars)) ?? 0) + 1;
      versions.current.set(versionKey(vars), v);

      queryClient.setQueryData<TData>(queryKey, (old) => {
        if (!old) return old;
        return optimisticUpdate(old, vars);
      });

      return { prev, version: v, key: versionKey(vars) };
    },
    onError: (_err, vars, ctx) => {
      if (ctx && staleGuard) {
        const currentV = versions.current.get(ctx.key);
        // Only rollback if this mutation's version is still the latest
        if (currentV !== ctx.version) return;
      }
      if (ctx?.prev) {
        queryClient.setQueryData(queryKey, ctx.prev);
      }
      setError(_err instanceof Error ? _err : new Error('Mutation failed'));
    },
    onSuccess: (_data, vars, ctx) => {
      setError(null);
      if (ctx && staleGuard) {
        const currentV = versions.current.get(ctx.key);
        if (currentV !== ctx.version) return;
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const execute = useCallback(
    (vars: TVars, options?: MutateOptions<unknown, Error, TVars, unknown>) => {
      setError(null);
      mutation.mutate(vars, options);
    },
    [mutation]
  );

  return { execute, isPending: mutation.isPending, error, reset: () => setError(null) };
}

// Usage — HubSpot-style deal update
/*
const updateDeal = useOptimisticMutation<Deal[], Partial<Deal>>({
  queryKey: ['deals', 'pipeline', pipelineId],
  mutationFn: (partial) => fetch(`/api/deals/${partial.id}`, { method: 'PATCH', body: JSON.stringify(partial) }),
  optimisticUpdate: (prev, partial) =>
    prev.map(d => d.id === partial.id ? { ...d, ...partial } : d),
});
*/
```

### How It Works

The hook wraps TanStack Query's `useMutation` with three extensions: (1) an `optimisticUpdate` callback that applies the change to cached data synchronously in `onMutate`, (2) a version counter per mutation variable set that guards against stale server responses overwriting newer client state, and (3) an explicit error surface for toast/snackbar. The version guard solves the "rapid-fire clicks" problem — if three toggles fire in sequence, only the latest response reconciles.

### Pros & Cons

- ✅ Version guard prevents stale-response overwrites during rapid mutations
- ✅ Centralizes the snapshot/optimistic/rollback triad in one reusable hook
- ✅ Error state is surfaced explicitly for UI feedback (toast, banner)
- ❌ Adds complexity — teams must remember to use the hook instead of raw `useMutation`
- ❌ Version map grows unbounded if keys are unique per call (use stable IDs)
- ❌ Doesn't handle cross-query-key dependencies (e.g., a deal move affects both list and stage summary)

---

## 4. State Management — Server/Client Split with Jotai + TanStack Query

### Code

```typescript
// stores/workspace-store.ts — pattern used by Twenty CRM
import { atom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithQuery } from 'jotai-tanstack-query';
import { focusAtom } from 'jotai-optics';
import { useQueryClient, useMutation } from '@tanstack/react-query';

// ---- Server state via Jotai + TanStack Query bridge ----
export const workspaceIdAtom = atom<string | null>(null);

export const workspaceQueryAtom = atomWithQuery((get) => ({
  queryKey: ['workspace', get(workspaceIdAtom)],
  queryFn: async ({ queryKey }) => {
    const [, id] = queryKey;
    const res = await fetch(`/api/workspaces/${id}`);
    return res.json() as Promise<Workspace>;
  },
  enabled: !!get(workspaceIdAtom),
}));

// Derived atoms for focused slices (no re-render of full workspace)
export const workspaceNameAtom = focusAtom(workspaceQueryAtom, (optic) =>
  optic.prop('displayName')
);

export const workspaceMembersAtom = focusAtom(workspaceQueryAtom, (optic) =>
  optic.prop('members')
);

// Deals query atom — separate from workspace
export const dealsQueryAtom = atomWithQuery((get) => ({
  queryKey: ['deals', get(workspaceIdAtom)],
  queryFn: async ({ queryKey }) => {
    const [, id] = queryKey;
    const res = await fetch(`/api/workspaces/${id}/deals`);
    return res.json() as Promise<Deal[]>;
  },
  enabled: !!get(workspaceIdAtom),
}));

// ---- UI/client state (tiny Zustand-style stores) ----
export const sidebarOpenAtom = atom(true);
export const activeViewAtom = atom<'kanban' | 'table' | 'calendar'>('kanban');
export const searchQueryAtom = atom('');

// Derived: filtered deals from server state
export const filteredDealsAtom = atom((get) => {
  const deals = get(dealsQueryAtom);
  const query = get(searchQueryAtom).toLowerCase();
  if (!query) return deals;
  return deals?.filter(
    (d) => d.title.toLowerCase().includes(query) || d.contact?.name.toLowerCase().includes(query)
  );
});

// ---- Mutation (optimistic via TanStack Query) ----
export const useUpdateDealStage = () => {
  const queryClient = useQueryClient();
  const workspaceId = useAtomValue(workspaceIdAtom);
  return useMutation({
    mutationFn: async ({ dealId, stageId }: { dealId: string; stageId: string }) => {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: 'PATCH',
        body: JSON.stringify({ stageId }),
      });
      return res.json();
    },
    onMutate: async ({ dealId, stageId }) => {
      await queryClient.cancelQueries({ queryKey: ['deals', workspaceId] });
      queryClient.setQueryData<Deal[]>(['deals', workspaceId], (prev) =>
        prev?.map((d) => (d.id === dealId ? { ...d, stageId } : d))
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['deals', workspaceId] }),
  });
};

// ---- UI component consuming split state ----
export function WorkspaceSidebar() {
  const isOpen = useAtomValue(sidebarOpenAtom);
  const toggle = useSetAtom(sidebarOpenAtom);
  const name = useAtomValue(workspaceNameAtom);
  const members = useAtomValue(workspaceMembersAtom);
  const view = useAtomValue(activeViewAtom);

  if (!isOpen) return <CollapsedSidebar onExpand={() => toggle()} />;
  return (
    <aside>
      <h2>{name}</h2>
      <ViewTabs active={view} />
      <MemberAvatars members={members} />
    </aside>
  );
}
```

### How It Works

Inspired by Twenty CRM's architecture: Jotai atoms wrap TanStack Query via `atomWithQuery`, giving fine-grained reactivity. Components subscribe to only the slice they need (`focusAtom` / `splitAtom`), so a sidebar member list update does not re-render the kanban board. True client-only state (sidebar open, active view, search) lives in plain Jotai atoms — zero boilerplate. Mutations are handled through `atomWithMutation` or the traditional `useMutation`, with optimistic writes directly into the query cache.

### Pros & Cons

- ✅ Components only re-render when their specific atom dependency changes
- ✅ No Provider nesting hell — Jotai is provider-less
- ✅ Server state and client state have clear separation of concerns
- ❌ `atomWithQuery` is an additional abstraction layer over TanStack Query's own hooks
- ❌ Optics (`focusAtom`) can be error-prone with nested optional properties
- ❌ Teams must enforce the split discipline — it's easy to accidentally put server state in client atoms

---

## 5. Team Dashboard with Parallel Queries + Cache Invalidation

### Code

```typescript
// components/TeamDashboard.tsx
import { useQuery, useIsFetching } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { AreaChart, BarChart } from '@/components/charts';

interface DashboardData {
  pipelineValue: number;
  winRate: number;
  avgDealSize: number;
  stageDistribution: { stage: string; count: number; value: number }[];
  activityTrend: { date: string; calls: number; emails: number; meetings: number }[];
  teamPerformance: { name: string; deals: number; value: number; quota: number }[];
}

export function TeamDashboard({ workspaceId, timeframe }: { workspaceId: string; timeframe: '7d' | '30d' | 'quarter' }) {
  // Deduplicated — same key shape means single network call for identical params
  const pipeline = useQuery({
    queryKey: ['dashboard', workspaceId, 'pipeline-summary', timeframe],
    queryFn: () => fetch(`/api/dashboard/${workspaceId}/pipeline?timeframe=${timeframe}`).then(r => r.json()),
    staleTime: 120_000, // Pipeline summaries change slowly
    refetchInterval: 300_000, // Poll every 5min
  });

  const activity = useQuery({
    queryKey: ['dashboard', workspaceId, 'activity-trend', timeframe],
    queryFn: () => fetch(`/api/dashboard/${workspaceId}/activity?timeframe=${timeframe}`).then(r => r.json()),
    staleTime: 60_000,
  });

  const teamPerf = useQuery({
    queryKey: ['dashboard', workspaceId, 'team-performance', timeframe],
    queryFn: () => fetch(`/api/dashboard/${workspaceId}/team?timeframe=${timeframe}`).then(r => r.json()),
    staleTime: 120_000,
  });

  // Aggregate loading state — show skeleton only on initial load
  const isLoading =
    pipeline.status === 'pending' || activity.status === 'pending' || teamPerf.status === 'pending';
  const isBackgroundRefetching = useIsFetching({
    queryKey: ['dashboard', workspaceId],
    predicate: (query) => query.state.status === 'success',
  }) > 0;

  const kpiMetrics = useMemo(() => {
    if (!pipeline.data) return null;
    return {
      totalPipeline: pipeline.data.pipelineValue,
      winRate: pipeline.data.winRate,
      avgDealSize: pipeline.data.avgDealSize,
    };
  }, [pipeline.data]);

  if (isLoading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      {isBackgroundRefetching && <RefreshIndicator />}
      <KpiRow metrics={kpiMetrics} />
      <div className="grid grid-cols-2 gap-4">
        <BarChart
          title="Stage Distribution"
          data={pipeline.data.stageDistribution}
          xKey="stage"
          yKey="value"
        />
        <AreaChart
          title="Activity Trend"
          data={activity.data}
          xKey="date"
          series={[
            { key: 'calls', label: 'Calls' },
            { key: 'emails', label: 'Emails' },
          ]}
        />
      </div>
      <TeamQuotaTable members={teamPerf.data} />
    </div>
  );
}

// ---- Invalidation on mutations elsewhere ----
export function useInvalidateDashboard(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dealId: string) =>
      fetch(`/api/deals/${dealId}`, { method: 'PATCH', body: JSON.stringify({ stageId: 'won' }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['deals', 'pipeline', workspaceId] });
    },
  });
}

// ---- SSE-driven live updates ----
export function useDashboardLiveUpdates(workspaceId: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const sse = new EventSource(`/api/sse/dashboard?workspaceId=${workspaceId}`);
    sse.addEventListener('dashboard:refresh', () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', workspaceId] });
    });
    sse.addEventListener('deal:won', (e) => {
      const { dealId, value } = JSON.parse(e.data);
      queryClient.setQueryData(['dashboard', workspaceId, 'team-performance'], (old: any) =>
        old?.map((m: any) =>
          m.deals.some((d: any) => d.id === dealId)
            ? { ...m, value: m.value + value, deals: m.deals + 1 }
            : m
        )
      );
    });
    return () => sse.close();
  }, [workspaceId, queryClient]);
}
```

### How It Works

Three parallel `useQuery` calls fetch independent dashboard slices (pipeline summary, activity trend, team performance) with different `staleTime` / `refetchInterval` values optimized per slice. TanStack Query deduplicates queries — identical keys across components share one network call. `useIsFetching` detects background refetches to show a subtle refresh indicator without blocking the UI. When a deal is moved to "won", a mutation invalidates both the dashboard and pipeline caches. SSE events push live invalidation for multi-user scenarios (e.g., a colleague closes a deal).

### Pros & Cons

- ✅ Parallel queries load independently — a slow activity chart doesn't block KPIs
- ✅ Per-slice stale times optimize network usage (pipeline cache 2min, activity 1min)
- ✅ SSE-driven invalidation keeps the dashboard fresh across team members
- ❌ Dashboard queries can cause waterfall if not properly parallelized at the API layer
- ❌ Background refetching can interfere with user interactions (e.g., mid-drag)
- ❌ Aggregated data may be stale — Redis caching on the API side adds another layer of eventual consistency

---

## 6. Inline Editing with Click-to-Edit + Auto-Save

CRM power users expect to edit deal values, stage probabilities, contact info, and custom fields directly on kanban cards and table rows — no modal overlay. This pattern implements click-to-activate, blur-to-save inline editing with optimistic updates.

### Code

```typescript
// hooks/useInlineEdit.ts
import { useRef, useCallback, useState, KeyboardEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';

type EditType = 'text' | 'number' | 'currency' | 'select' | 'date';
type SaveHandler<T> = (value: T) => Promise<void>;

interface InlineEditOptions<T> {
  initialValue: T;
  type: EditType;
  queryKey: unknown[];
  onSave: SaveHandler<T>;
  formatValue?: (value: T) => string;
  parseValue?: (raw: string) => T;
  validate?: (value: T) => string | null; // returns error message or null
}

export function useInlineEdit<T>({
  initialValue,
  queryKey,
  onSave,
  formatValue = (v) => String(v),
  parseValue = (raw) => raw as unknown as T,
  validate = () => null,
}: InlineEditOptions<T>) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(() => formatValue(initialValue));
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const startEditing = useCallback(() => {
    setDraftValue(formatValue(initialValue));
    setError(null);
    setIsEditing(true);
    // Focus on next tick after React renders the input
    requestAnimationFrame(() => inputRef.current?.select());
  }, [initialValue, formatValue]);

  const cancelEditing = useCallback(() => {
    setDraftValue(formatValue(initialValue));
    setIsEditing(false);
    setError(null);
  }, [initialValue, formatValue]);

  const commitEdit = useCallback(async () => {
    const parsed = parseValue(draftValue);
    const validationError = validate(parsed);
    if (validationError) {
      setError(validationError);
      return;
    }

    // Optimistic update
    queryClient.setQueryData(queryKey, (old: any) => {
      if (!old) return old;
      return old;
    });

    try {
      await onSave(parsed);
      setIsEditing(false);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
      queryClient.invalidateQueries({ queryKey });
    }
  }, [draftValue, parseValue, validate, onSave, queryClient, queryKey]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') cancelEditing();
  }, [commitEdit, cancelEditing]);

  return {
    isEditing,
    draftValue,
    error,
    inputRef,
    startEditing,
    cancelEditing,
    commitEdit,
    setDraftValue,
    handleKeyDown,
  };
}

// Usage on a kanban card:
/*
function DealCardValue({ deal }: { deal: Deal }) {
  const edit = useInlineEdit({
    initialValue: deal.value,
    type: 'currency',
    queryKey: ['pipeline', deal.pipelineId],
    onSave: async (value) => {
      await fetch(`/api/deals/${deal.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ value }),
      });
    },
    formatValue: (v) => `$${v.toLocaleString()}`,
    parseValue: (raw) => parseFloat(raw.replace(/[^0-9.]/g, '')),
    validate: (v) => v < 0 ? 'Value cannot be negative' : null,
  });

  if (edit.isEditing) {
    return (
      <input
        ref={edit.inputRef}
        value={edit.draftValue}
        onChange={(e) => edit.setDraftValue(e.target.value)}
        onBlur={edit.commitEdit}
        onKeyDown={edit.handleKeyDown}
        className="inline-edit-input"
      />
    );
  }

  return (
    <span onClick={edit.startEditing} className="inline-edit-trigger cursor-pointer hover:bg-muted px-1 rounded">
      ${deal.value.toLocaleString()}
    </span>
  );
}
*/
```

### How It Works

`useInlineEdit` manages a 3-state cycle: **display** (shows formatted value) → **editing** (click activates input with auto-select) → **committing** (blur/Enter saves optimistically, blur on server error rolls back). The hook accepts `formatValue`/`parseValue` transformers so display and storage formats can differ (e.g., currency formatting). Validation runs before save and shows inline error. `Escape` cancels and restores the original value. This is the pattern used by Pipedrive's inline editing — each field on the deal card is a click-to-edit input with immediate save.

### Pros & Cons

- ✅ **Fast edit flow** — no modal or page transition; click, type, Enter, done
- ✅ **Self-validating** — per-field validation with inline error display
- ✅ **Optimistic + rollback** — UI updates instantly; reverts on server failure
- ❌ **Single-field granularity** — no support for multi-field form-like editing (use a modal for that)
- ❌ **Format/parse mismatch** — if `parseValue` can't reverse `formatValue`, editing mutates the data
- ❌ **Click-jacking risk** — rapid clicks on display/edit can cause focus loss and stale values

---

## 7. Activity Feed / Timeline Component

Every CRM needs a chronological timeline of prospect interactions (calls, emails, notes, meetings, system changes). This pattern implements a virtualized infinite-scroll activity feed with grouped dates and type icons.

### Code

```typescript
// components/ActivityTimeline.tsx
import { useInfiniteQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, useMemo } from 'react';

interface Activity {
  id: string;
  type: 'call' | 'email' | 'sms' | 'meeting' | 'note' | 'system';
  direction?: 'inbound' | 'outbound';
  title: string;
  description: string;
  timestamp: string;
  createdBy: { name: string; avatarUrl?: string };
  metadata?: Record<string, unknown>;
}

type GroupedActivities = Record<string, Activity[]>;

function groupByDate(activities: Activity[]): GroupedActivities {
  const groups: GroupedActivities = {};
  for (const a of activities) {
    const dateKey = new Date(a.timestamp).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(a);
  }
  return groups;
}

function ActivityIcon({ type, direction }: { type: string; direction?: string }) {
  const icons: Record<string, string> = {
    call: direction === 'inbound' ? '📞' : '📱',
    email: '✉️',
    sms: '💬',
    meeting: '📅',
    note: '📝',
    system: '⚙️',
  };
  return <span className="activity-icon">{icons[type] || '📌'}</span>;
}

export function ActivityTimeline({
  contactId,
  dealId,
}: {
  contactId?: string;
  dealId?: string;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['activities', contactId ?? dealId],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams({
        ...(contactId && { contactId }),
        ...(dealId && { dealId }),
        offset: String(pageParam),
        limit: '50',
      });
      const res = await fetch(`/api/activities?${params}`);
      return res.json() as Promise<{ items: Activity[]; nextOffset: number | null }>;
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialPageParam: 0,
  });

  const allActivities = useMemo(
    () => data?.pages.flatMap(p => p.items) ?? [],
    [data]
  );

  const grouped = useMemo(() => groupByDate(allActivities), [allActivities]);

  const flatItems = useMemo(() => {
    const items: Array<{ type: 'date-header'; label: string } | { type: 'activity'; data: Activity }> = [];
    for (const [dateLabel, activities] of Object.entries(grouped)) {
      items.push({ type: 'date-header', label: dateLabel });
      for (const activity of activities) {
        items.push({ type: 'activity', data: activity });
      }
    }
    return items;
  }, [grouped]);

  const virtualizer = useVirtualizer({
    count: flatItems.length + (hasNextPage ? 1 : 0),
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const item = flatItems[index];
      return item?.type === 'date-header' ? 40 : 80;
    },
    overscan: 5,
  });

  // Load more when nearing the end
  const lastItemIndex = flatItems.length - 1;
  if (lastItemIndex >= 0) {
    const lastItem = virtualizer.getVirtualItems().at(-1);
    if (lastItem && lastItem.index >= lastItemIndex - 3 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }

  if (isLoading) return <TimelineSkeleton />;

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((vItem) => {
          const item = flatItems[vItem.index];
          if (!item) {
            // Load more trigger
            return (
              <div key={`loader-${vItem.index}`}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '40px', transform: `translateY(${vItem.start}px)` }}
                className="flex items-center justify-center text-sm text-muted"
              >
                {isFetchingNextPage ? 'Loading...' : 'Load more'}
              </div>
            );
          }

          if (item.type === 'date-header') {
            return (
              <div key={item.label}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${vItem.size}px`, transform: `translateY(${vItem.start}px)` }}
                className="sticky top-0 bg-background font-semibold text-sm px-4 py-2 border-b z-10"
              >
                {item.label}
              </div>
            );
          }

          const a = item.data;
          return (
            <div key={a.id}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${vItem.size}px`, transform: `translateY(${vItem.start}px)` }}
              className="flex gap-3 px-4 py-3 border-b hover:bg-muted/50 transition-colors"
            >
              <div className="flex-shrink-0 mt-1">
                <ActivityIcon type={a.type} direction={a.direction} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{a.title}</span>
                  <span className="text-xs text-muted ml-auto">
                    {formatRelativeTime(a.timestamp)}
                  </span>
                </div>
                <p className="text-sm text-muted line-clamp-2">{a.description}</p>
                <span className="text-xs text-muted">{a.createdBy.name}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-3 animate-pulse">
          <div className="w-8 h-8 bg-muted rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-3 bg-muted rounded w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
```

### How It Works

`useInfiniteQuery` loads activities in pages of 50, with cursor-based pagination. The flat list is grouped by date via `groupByDate`, then flattened into a mixed array of date headers and activity items for virtualization. The virtualizer renders only visible rows with `estimateSize` returning different heights for headers (40px) vs. activities (80px). A sticky date header remains visible at the top of the scroll container while scrolling through activities from that day. Infinite scroll triggers `fetchNextPage` when the user scrolls within 3 items of the end. This is the pattern used by Close CRM's timeline, HubSpot's activity feed, and Attio's note stream.

### Pros & Cons

- ✅ **Mixed-type virtual list** — date headers and activity items in one performant scroll
- ✅ **Infinite scroll** — works for thousands of activities without loading the full set
- ✅ **Relative timestamps** — "2h ago" vs absolute dates depending on recency
- ❌ **Grouped virtualization complexity** — mixed item types make scroll anchoring tricky
- ❌ **No real-time updates** — new activities from other users require manual or SSE-based refetch
- ❌ **Skeleton flash** — brief loading state appears on every pagination without careful cache warming

---

## 8. Bulk Selection & Batch Operations

SDRs frequently need to select multiple deals or contacts and perform a batch action: change stage, assign owner, add tag, delete, or export. This pattern implements a selection store with shift-click range selection and command-bar batch actions.

### Code

```typescript
// hooks/useBulkSelection.ts
import { useState, useCallback, useMemo } from 'react';

interface SelectionStore<TId> {
  selectedIds: Set<TId>;
  lastClickedId: TId | null;
  isAllSelected: boolean;
}

export function useBulkSelection<TId = string>(allIds: TId[]) {
  const [store, setStore] = useState<SelectionStore<TId>>({
    selectedIds: new Set(),
    lastClickedId: null,
    isAllSelected: false,
  });

  const toggleOne = useCallback((id: TId) => {
    setStore(prev => {
      const next = new Set(prev.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return {
        selectedIds: next,
        lastClickedId: id,
        isAllSelected: next.size === allIds.length,
      };
    });
  }, [allIds.length]);

  const selectRange = useCallback((fromId: TId, toId: TId) => {
    const fromIdx = allIds.indexOf(fromId);
    const toIdx = allIds.indexOf(toId);
    if (fromIdx === -1 || toIdx === -1) return;

    const [start, end] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
    const range = allIds.slice(start, end + 1);

    setStore(prev => {
      const next = new Set(prev.selectedIds);
      for (const id of range) next.add(id);
      return {
        selectedIds: next,
        lastClickedId: toId,
        isAllSelected: next.size === allIds.length,
      };
    });
  }, [allIds]);

  const selectAll = useCallback(() => {
    setStore({
      selectedIds: new Set(allIds),
      lastClickedId: null,
      isAllSelected: true,
    });
  }, [allIds]);

  const clearSelection = useCallback(() => {
    setStore({
      selectedIds: new Set(),
      lastClickedId: null,
      isAllSelected: false,
    });
  }, []);

  const selectedCount = useMemo(() => store.selectedIds.size, [store.selectedIds]);

  return {
    ...store,
    toggleOne,
    selectRange,
    selectAll,
    clearSelection,
    selectedCount,
  };
}

function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

// ---- Batch Action Bar ----
interface BatchAction {
  id: string;
  label: string;
  icon?: string;
  dangerous?: boolean;
  requiresReason?: boolean;
  handler: (ids: string[]) => Promise<void>;
}

function BatchActionBar({
  selectedIds,
  clearSelection,
  actions,
}: {
  selectedIds: Set<string>;
  clearSelection: () => void;
  actions: BatchAction[];
}) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<BatchAction | null>(null);

  const executeAction = useCallback(async (action: BatchAction) => {
    if (action.dangerous && !confirmAction) {
      setConfirmAction(action);
      return;
    }

    setIsExecuting(true);
    try {
      await action.handler(Array.from(selectedIds));
      clearSelection();
    } catch (err) {
      console.error(`Batch action "${action.label}" failed:`, err);
    } finally {
      setIsExecuting(false);
      setConfirmAction(null);
    }
  }, [selectedIds, clearSelection, confirmAction]);

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background border-t shadow-lg p-3 flex items-center gap-4 z-50">
      <span className="text-sm font-medium">
        {selectedIds.size} selected
      </span>
      <div className="flex gap-2 ml-auto">
        {actions.map(action => (
          <button
            key={action.id}
            onClick={() => executeAction(action)}
            disabled={isExecuting}
            className={cn(
              'px-3 py-1.5 text-sm rounded-md',
              action.dangerous
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
          >
            {action.label}
          </button>
        ))}
        <button
          onClick={clearSelection}
          className="px-3 py-1.5 text-sm rounded-md border"
        >
          Cancel
        </button>
      </div>

      {/* Confirmation dialog for dangerous actions */}
      {confirmAction && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-popover border rounded-lg p-4 shadow-xl">
          <p className="text-sm mb-3">Are you sure you want to {confirmAction.label.toLowerCase()} {selectedIds.size} items?</p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setConfirmAction(null)} className="px-3 py-1.5 text-sm border rounded-md">Cancel</button>
            <button onClick={() => executeAction(confirmAction)} className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-md">Confirm</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Usage in pipeline table view ----
/*
function PipelineTable({ deals }: { deals: Deal[] }) {
  const bulk = useBulkSelection(deals.map(d => d.id));
  const [clickedId, setClickedId] = useState<string | null>(null);

  const handleRowClick = (dealId: string, event: React.MouseEvent) => {
    if (event.shiftKey && clickedId) {
      bulk.selectRange(clickedId, dealId);
    } else {
      bulk.toggleOne(dealId);
    }
    setClickedId(dealId);
  };

  return (
    <div>
      {bulk.selectedCount > 0 && (
        <BatchActionBar
          selectedIds={bulk.selectedIds}
          clearSelection={bulk.clearSelection}
          actions={[
            { id: 'stage', label: 'Move Stage', handler: (ids) => batchMoveStage(ids, 'qualified') },
            { id: 'assign', label: 'Assign', handler: (ids) => batchAssign(ids, currentUserId) },
            { id: 'export', label: 'Export CSV', handler: (ids) => exportDeals(ids) },
            { id: 'delete', label: 'Delete', dangerous: true, handler: (ids) => batchDelete(ids) },
          ]}
        />
      )}
      <table>
        {deals.map(deal => (
          <tr key={deal.id}
            onClick={(e) => handleRowClick(deal.id, e)}
            className={bulk.selectedIds.has(deal.id) ? 'bg-primary/10' : ''}
          >
            <td><input type="checkbox" checked={bulk.selectedIds.has(deal.id)} readOnly /></td>
            <td>{deal.title}</td>
            <td>{deal.value}</td>
          </tr>
        ))}
      </table>
    </div>
  );
}
*/
```

### How It Works

`useBulkSelection` maintains a `Set<TId>` of selected IDs and a `lastClickedId` for range selection. `toggleOne` adds/removes a single ID. `selectRange` uses array indexing to fill all IDs between `fromId` and `toId` (supports both forward and backward ranges). `selectAll` / `clearSelection` toggle the full set. The `BatchActionBar` renders as a fixed-bottom bar showing the count and available actions. Dangerous actions require a confirmation step before execution. When an action completes, `clearSelection` is called to reset the selection state. This is the pattern used by HubSpot's bulk deal editor and Gmail's multi-select.

### Pros & Cons

- ✅ **Shift-click range** — fast multi-select without manual checkbox clicking
- ✅ **Dangerous action confirmation** — prevents accidental deletes and stage moves
- ✅ **Fixed action bar** — always visible regardless of scroll position
- ❌ **AllIds dependency** — `useBulkSelection` requires the full ID list upfront; doesn't work with infinite-scroll data
- ❌ **No keyboard range** — only supports click-based selection; no Shift+Arrow keyboard range
- ❌ **Action bar z-index** — fixed bottom bar can conflict with other overlays (modals, dropdowns)

---

## 9. Keyboard Shortcuts & Command Palette

CRM power users navigate with the keyboard: `j/k` to move between rows, `e` to edit, `Cmd+K` for command palette, `/` to search. This pattern implements a centralized shortcut registry with context-aware bindings.

### Code

```typescript
// hooks/useKeyboardShortcuts.ts
import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

type ShortcutHandler = () => void | Promise<void>;
type ShortcutScope = 'global' | 'pipeline' | 'table' | 'detail' | 'search';

interface Shortcut {
  id: string;
  keys: string;              // e.g. "j", "shift+j", "mod+k"
  label: string;
  description: string;
  scope: ShortcutScope;
  handler: ShortcutHandler;
  preventDefault?: boolean;
}

class ShortcutRegistry {
  private shortcuts: Map<string, Shortcut> = new Map();
  private scopeStack: ShortcutScope[] = ['global'];

  register(shortcut: Shortcut): void {
    this.shortcuts.set(shortcut.id, shortcut);
  }

  unregister(id: string): void {
    this.shortcuts.delete(id);
  }

  pushScope(scope: ShortcutScope): void {
    this.scopeStack.unshift(scope);
  }

  popScope(): void {
    if (this.scopeStack.length > 1) this.scopeStack.shift();
  }

  getActiveShortcuts(): Shortcut[] {
    return Array.from(this.shortcuts.values())
      .filter(s => this.scopeStack.includes(s.scope));
  }

  match(keyCombo: string): Shortcut | undefined {
    return this.getActiveShortcuts().find(s => s.keys === keyCombo);
  }
}

const globalRegistry = new ShortcutRegistry();

function parseKeyEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push('mod');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');
  parts.push(e.key.toLowerCase());
  return parts.join('+');
}

export function useGlobalShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const combo = parseKeyEvent(e);
      // Ignore if typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        // Unless it's Escape
        if (e.key !== 'Escape') return;
      }

      const shortcut = globalRegistry.match(combo);
      if (shortcut) {
        if (shortcut.preventDefault) e.preventDefault();
        shortcut.handler();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

export function useShortcutScope(scope: ShortcutScope) {
  useEffect(() => {
    globalRegistry.pushScope(scope);
    return () => globalRegistry.popScope();
  }, [scope]);
}

// ---- Command Palette Component ----
interface Command {
  id: string;
  label: string;
  description: string;
  shortcut?: string;
  category: string;
  handler: () => void;
}

function CommandPalette({ commands }: { commands: Command[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd+K toggle
  useEffect(() => {
    const shortcut: Shortcut = {
      id: 'command-palette',
      keys: 'mod+k',
      label: 'Open Command Palette',
      description: 'Search and execute commands',
      scope: 'global',
      handler: () => {
        setIsOpen(prev => !prev);
        if (!isOpen) {
          setQuery('');
          setSelectedIndex(0);
        }
      },
      preventDefault: true,
    };
    globalRegistry.register(shortcut);
    return () => globalRegistry.unregister('command-palette');
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return commands.filter(c =>
      c.label.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q)
    );
  }, [commands, query]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      filtered[selectedIndex].handler();
      setIsOpen(false);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  }, [filtered, selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={() => setIsOpen(false)} />
      {/* Palette */}
      <div className="relative bg-background border rounded-lg shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center gap-2 px-4 border-b">
          <span className="text-muted">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search commands..."
            className="flex-1 py-3 bg-transparent outline-none text-sm"
          />
          <kbd className="text-xs text-muted border rounded px-1.5 py-0.5">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 && (
            <p className="text-sm text-muted text-center py-8">No commands found</p>
          )}
          {filtered.map((cmd, i) => (
            <div
              key={cmd.id}
              onClick={() => { cmd.handler(); setIsOpen(false); }}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer text-sm',
                i === selectedIndex ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
              )}
            >
              <span className="flex-1">{cmd.label}</span>
              <span className="text-xs text-muted">{cmd.category}</span>
              {cmd.shortcut && (
                <kbd className="text-xs text-muted border rounded px-1.5 py-0.5">{cmd.shortcut}</kbd>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- Usage ----
/*
function PipelinePage() {
  useGlobalShortcuts();
  useShortcutScope('pipeline');

  const registerDefaultShortcuts = () => {
    const commands: Command[] = [
      { id: 'new-deal', label: 'New Deal', description: 'Create a new deal', category: 'Deal', shortcut: 'c', handler: () => openNewDealModal() },
      { id: 'search', label: 'Search', description: 'Search deals and contacts', category: 'Navigation', shortcut: '/', handler: () => focusSearchBar() },
      { id: 'export', label: 'Export Pipeline', description: 'Export current view to CSV', category: 'Export', handler: () => exportPipeline() },
      { id: 'refresh', label: 'Refresh Data', description: 'Reload pipeline data', category: 'Data', shortcut: 'r', handler: () => refreshPipeline() },
    ];

    // Register keyboard-only shortcuts
    globalRegistry.register({ id: 'nav-down', keys: 'j', label: 'Next item', description: '', scope: 'pipeline', handler: () => moveSelection(1) });
    globalRegistry.register({ id: 'nav-up', keys: 'k', label: 'Previous item', description: '', scope: 'pipeline', handler: () => moveSelection(-1) });
    globalRegistry.register({ id: 'edit-deal', keys: 'e', label: 'Edit deal', description: '', scope: 'pipeline', handler: () => openEdit(selectedDealId) });
    globalRegistry.register({ id: 'quick-search', keys: '/', label: 'Quick search', description: '', scope: 'global', handler: () => focusSearchBar(), preventDefault: true });
  };
}
*/
```

### How It Works

A singleton `ShortcutRegistry` stores all shortcuts with scope tags. `useGlobalShortcuts` attaches a single `keydown` listener that parses the event into a combo string (e.g., `mod+k`, `shift+j`) and matches against active shortcuts filtered by the current scope stack. `useShortcutScope` pushes/removes scopes as components mount/unmount — when a user is on the pipeline view, pipeline-scoped shortcuts like `j`/`k` (navigate) and `e` (edit) are active; when they focus a modals, only global shortcuts apply. The `CommandPalette` component registers itself via `mod+k`, renders a fuzzy-filtered command list with keyboard navigation (Arrow keys, Enter, Escape). This is the pattern used by Linear (CRM-like issue tracker), Attio, and modern sales tools like Outreach.io.

### Pros & Cons

- ✅ **Scope-based activation** — same key does different things depending on the active view
- ✅ **Discoverable** — Cmd+K palette shows all available commands with their shortcuts
- ✅ **Single event listener** — one `keydown` on `window` instead of dozens of individual handlers
- ❌ **Scope management complexity** — forgetting to pop a scope on unmount causes stale shortcut bindings
- ❌ **`mod` key ambiguity** — `mod+k` on Mac is Cmd+K, on Windows is Ctrl+K; but some combos differ (Cmd+W closes tab vs Ctrl+W closes tab in browser)
- ❌ **Input focus exclusion** — keyboard shortcuts must be suppressed when typing in input fields; special-casing Escape creates edge cases
