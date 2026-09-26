import { createClient } from '@supabase/supabase-js';

export type TeamMember = { id: string; name: string; email: string; role: string; token: string; started_on: string; monthly_inr: number | null; active: boolean; created_at: string };
export type OpsStatus = 'todo' | 'doing' | 'done' | 'blocked' | 'na';
export type OpsTask = {
  id: string; member_id: string; brand_key: string; brand_name: string; stage: number; stage_label: string;
  task: string; owner: 'team' | 'founder' | 'brand'; status: OpsStatus; note: string | null; due_on: string | null; sort: number; updated_at: string;
};
export type OpsLog = { id: string; member_id: string; task_id: string | null; kind: string; body: string; created_at: string };

export const OPS_STATUSES: OpsStatus[] = ['todo', 'doing', 'done', 'blocked', 'na'];
export const STATUS_LABEL: Record<OpsStatus, string> = { todo: 'To do', doing: 'In progress', done: 'Done', blocked: 'Blocked', na: 'Not needed' };

export type BrandProgress = { brand_key: string; brand_name: string; total: number; done: number; doing: number; blocked: number; pct: number; overdue: number };

export function progressByBrand(tasks: OpsTask[], today = new Date().toISOString().slice(0, 10)): BrandProgress[] {
  const map = new Map<string, BrandProgress>();
  for (const t of tasks) {
    const p = map.get(t.brand_key) ?? { brand_key: t.brand_key, brand_name: t.brand_name, total: 0, done: 0, doing: 0, blocked: 0, pct: 0, overdue: 0 };
    if (t.status !== 'na') p.total += 1;
    if (t.status === 'done') p.done += 1;
    if (t.status === 'doing') p.doing += 1;
    if (t.status === 'blocked') p.blocked += 1;
    if (t.due_on && t.due_on < today && t.status !== 'done' && t.status !== 'na') p.overdue += 1;
    map.set(t.brand_key, p);
  }
  return [...map.values()].map((p) => ({ ...p, pct: p.total ? Math.round((p.done / p.total) * 100) : 0 }));
}

export function getOpsDb(env: { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string }) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  return {
    async memberByToken(token: string): Promise<TeamMember | null> {
      const { data, error } = await supabase.from('retail_os_team_members').select('*').eq('token', token).eq('active', true).maybeSingle();
      if (error) throw new Error(`ops memberByToken failed: ${error.message}`);
      return data as TeamMember | null;
    },
    async listMembers(): Promise<TeamMember[]> {
      const { data, error } = await supabase.from('retail_os_team_members').select('*').eq('active', true).order('started_on');
      if (error) throw new Error(`ops listMembers failed: ${error.message}`);
      return (data ?? []) as TeamMember[];
    },
    async listTasks(memberId: string): Promise<OpsTask[]> {
      const { data, error } = await supabase.from('retail_os_ops_tasks').select('*').eq('member_id', memberId).order('brand_key').order('stage').order('sort');
      if (error) throw new Error(`ops listTasks failed: ${error.message}`);
      return (data ?? []) as OpsTask[];
    },
    async updateTask(memberId: string, taskId: string, patch: { status?: OpsStatus; note?: string | null }): Promise<OpsTask | null> {
      const { data, error } = await supabase
        .from('retail_os_ops_tasks')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', taskId)
        .eq('member_id', memberId)
        .select('*')
        .maybeSingle();
      if (error) throw new Error(`ops updateTask failed: ${error.message}`);
      return data as OpsTask | null;
    },
    async addLog(memberId: string, kind: string, body: string, taskId: string | null = null) {
      const { error } = await supabase.from('retail_os_ops_log').insert({ member_id: memberId, task_id: taskId, kind, body });
      if (error) throw new Error(`ops addLog failed: ${error.message}`);
    },
    async listLog(memberId: string, limit = 30): Promise<OpsLog[]> {
      const { data, error } = await supabase.from('retail_os_ops_log').select('*').eq('member_id', memberId).order('created_at', { ascending: false }).limit(limit);
      if (error) throw new Error(`ops listLog failed: ${error.message}`);
      return (data ?? []) as OpsLog[];
    },
  };
}
