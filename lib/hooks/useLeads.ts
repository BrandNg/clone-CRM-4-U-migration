'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { readApiError } from '@/lib/api/client';

export interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  email: string;
  phone?: string;
  linkedIn?: string;
  stage: 'new' | 'sequence_active' | 'replied' | 'meeting_booked' | 'won' | 'lost';
  priority: 'hot' | 'warm' | 'cold';
  source?: string;
  lastContactedAt?: string;
  nextTaskDue?: string;
  nextTaskType?: string | null;
  sequenceId?: string | null;
  atRisk?: boolean;
  tags?: string[];
  assignedTo?: { id: string; firstName: string; lastName: string };
  aiScore?: number;
  aiLabel?: 'hot' | 'warm' | 'cold';
  aiRecommendation?: string;
}

interface LeadFilters {
  search?: string;
  stage?: string;
  priority?: string;
  assignedTo?: string;
  source?: string;
  tag?: string;
  dateFrom?: string;
  dateTo?: string;
}

function buildQueryString(filters: LeadFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.stage && filters.stage !== 'all') params.set('stage', filters.stage);
  if (filters.priority && filters.priority !== 'all') params.set('priority', filters.priority);
  if (filters.assignedTo && filters.assignedTo !== 'all') params.set('assignedTo', filters.assignedTo);
  if (filters.source) params.set('source', filters.source);
  if (filters.tag) params.set('tag', filters.tag);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  return params.toString();
}

export function useLeads(filters: LeadFilters) {
  return useQuery<Lead[]>({
    queryKey: ['leads', filters],
    queryFn: async () => {
      const qs = buildQueryString(filters);
      const res = await fetch(`/api/leads?${qs}`);
      if (!res.ok) throw new Error(await readApiError(res, 'Failed to fetch leads'));
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    placeholderData: (previousData) => previousData,
  });
}

export function useUsers() {
  return useQuery<any[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await fetch('/api/users');
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60 * 1000,
  });
}

export function useSequences() {
  return useQuery<{ id: string; name: string }[]>({
    queryKey: ['sequences'],
    queryFn: async () => {
      const res = await fetch('/api/sequences');
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data.map((s: any) => ({ id: s.id, name: s.name })) : [];
    },
    staleTime: 60 * 1000,
  });
}

export function useUpdateLeadStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, stage }: { leadId: string; stage: Lead['stage'] }) => {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      });
      if (!res.ok) throw new Error(await readApiError(res, 'Failed to update stage'));
      return res.json();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}
