import { createClient } from '@supabase/supabase-js';

export type TeamMember = { id: string; name: string; email: string; role: string; token: string; started_on: string; monthly_inr: number | null; active: boolean; created_at: string };
export type OpsStatus = 'todo' | 'doing' | 'done' | 'blocked' | 'na';
export type OpsTask = {
  id: string; member_id: string; brand_key: string; brand_name: string; stage: number; stage_label: string;
  task: string; owner: 'team' | 'founder' | 'brand'; status: OpsStatus; note: string | null; due_on: string | null; sort: number; updated_at: string;
  objective: string; priority: 1 | 2 | 3;
};
export type Objective = { key: string; title: string; why: string; sort: number };
export const PRIORITY_LABEL: Record<number, string> = { 1: 'Now', 2: 'Next', 3: 'Later' };
export const OWNER_LABEL: Record<string, string> = { team: 'Prince', founder: 'Virat', brand: 'Brand' };

const isOpen = (t: OpsTask) => t.status !== 'done' && t.status !== 'na';
/** Priority first, then the earliest due date; undated last. */
export function byPriority(a: OpsTask, b: OpsTask): number {
  return a.priority - b.priority || (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999') || a.sort - b.sort;
}

export type ObjectivePlan = { objective: Objective; tasks: OpsTask[]; done: number; total: number; now: number; onFounder: number; blocked: number };
/** Tasks grouped under their objective, in objective order, each list sorted by priority. */
export function planByObjective(objectives: Objective[], tasks: OpsTask[]): ObjectivePlan[] {
  return [...objectives].sort((a, b) => a.sort - b.sort).map((objective) => {
    const list = tasks.filter((t) => t.objective === objective.key).sort(byPriority);
    const counted = list.filter((t) => t.status !== 'na');
    return {
      objective, tasks: list,
      done: counted.filter((t) => t.status === 'done').length, total: counted.length,
      now: list.filter((t) => isOpen(t) && t.priority === 1).length,
      onFounder: list.filter((t) => isOpen(t) && t.owner === 'founder').length,
      blocked: list.filter((t) => t.status === 'blocked').length,
    };
  });
}
/** A team member's "do now" list: their own open priority-1 tasks, soonest first. */
export function doNow(tasks: OpsTask[], limit = 5): OpsTask[] {
  return tasks.filter((t) => isOpen(t) && t.owner === 'team' && t.priority === 1).sort(byPriority).slice(0, limit);
}

export type TaskInput = Partial<Pick<OpsTask, 'task' | 'brand_name' | 'brand_key' | 'objective' | 'priority' | 'owner' | 'status' | 'note' | 'due_on'>>;
const OWNERS = ['team', 'founder', 'brand'];
/** Validate a founder edit; returns a clean patch or an error message. */
export function cleanTaskInput(b: Record<string, unknown>, objectiveKeys: string[]): { patch: TaskInput } | { error: string } {
  const p: TaskInput = {};
  if (b.task !== undefined) { const v = String(b.task).trim().slice(0, 500); if (!v) return { error: 'Task text is empty' }; p.task = v; }
  if (b.brand_name !== undefined) { const v = String(b.brand_name).trim().slice(0, 80) || 'General'; p.brand_name = v; p.brand_key = v.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 40) || 'general'; }
  if (b.objective !== undefined) { if (!objectiveKeys.includes(String(b.objective))) return { error: 'Unknown objective' }; p.objective = String(b.objective); }
  if (b.priority !== undefined) { const n = Number(b.priority); if (![1, 2, 3].includes(n)) return { error: 'Priority is 1, 2 or 3' }; p.priority = n as 1 | 2 | 3; }
  if (b.owner !== undefined) { if (!OWNERS.includes(String(b.owner))) return { error: 'Bad owner' }; p.owner = b.owner as OpsTask['owner']; }
  if (b.status !== undefined) { if (!OPS_STATUSES.includes(b.status as OpsStatus)) return { error: 'Bad status' }; p.status = b.status as OpsStatus; }
  if (b.note !== undefined) p.note = String(b.note).trim().slice(0, 2000) || null;
  if (b.due_on !== undefined) { const v = String(b.due_on || ''); if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { error: 'Bad date' }; p.due_on = v || null; }
  return { patch: p };
}
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
      const { data, error } = await supabase.from('retail_os_ops_tasks').select('*').eq('member_id', memberId).order('priority').order('due_on', { nullsFirst: false }).order('sort');
      if (error) throw new Error(`ops listTasks failed: ${error.message}`);
      return (data ?? []) as OpsTask[];
    },
    async listObjectives(): Promise<Objective[]> {
      const { data, error } = await supabase.from('retail_os_objectives').select('key,title,why,sort').eq('active', true).order('sort');
      if (error) throw new Error(`ops listObjectives failed: ${error.message}`);
      return (data ?? []) as Objective[];
    },
    // Founder edits (console only; the route sits behind the admin password).
    async createTask(memberId: string, t: TaskInput): Promise<OpsTask> {
      const row = { member_id: memberId, brand_key: t.brand_key ?? 'general', brand_name: t.brand_name ?? 'General', stage: 0, stage_label: '', task: t.task, owner: t.owner ?? 'team', status: t.status ?? 'todo', note: t.note ?? null, due_on: t.due_on ?? null, objective: t.objective ?? 'live', priority: t.priority ?? 2, sort: 0 };
      const { data, error } = await supabase.from('retail_os_ops_tasks').insert(row).select('*').single();
      if (error) throw new Error(`ops createTask failed: ${error.message}`);
      return data as OpsTask;
    },
    async editTask(taskId: string, patch: TaskInput): Promise<OpsTask | null> {
      const { data, error } = await supabase.from('retail_os_ops_tasks').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', taskId).select('*').maybeSingle();
      if (error) throw new Error(`ops editTask failed: ${error.message}`);
      return data as OpsTask | null;
    },
    async deleteTask(taskId: string): Promise<void> {
      const { error } = await supabase.from('retail_os_ops_tasks').delete().eq('id', taskId);
      if (error) throw new Error(`ops deleteTask failed: ${error.message}`);
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
