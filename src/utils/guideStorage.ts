import { supabase } from './supabase';
import type { GuideCategory, GuideEntry, GuideStatus, GuideTeamSlot } from '../types';

const TABLE = 'guide_entries';

interface GuideRow {
  id: string;
  category: string;
  period: number;
  stage: string | null;
  attribute: string;
  weather: boolean | null;
  turns: number;
  team: GuideTeamSlot[];
  author: string;
  video_url: string | null;
  image_url: string | null;
  notes: string | null;
  score: number | null;
  status: GuideStatus;
  user_id: string;
  created_at: string;
  updated_at: string;
  like_count: number;
  deleted: boolean;
}

function rowToEntry(r: GuideRow): GuideEntry {
  return {
    uuid: r.id,
    category: r.category as GuideCategory,
    period: r.period,
    stage: (r.stage as GuideEntry['stage']) ?? undefined,
    attribute: r.attribute as GuideEntry['attribute'],
    weather: r.weather ?? undefined,
    turns: r.turns,
    team: r.team ?? [],
    author: r.author,
    videoUrl: r.video_url ?? undefined,
    imageUrl: r.image_url ?? undefined,
    notes: r.notes ?? undefined,
    score: r.score ?? undefined,
    status: r.status,
    userId: r.user_id,
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: new Date(r.updated_at).getTime(),
    deleted: r.deleted,
    likeCount: r.like_count ?? 0,
  };
}

export interface GuideListResult {
  entries: GuideEntry[];
  error: string | null;
}

// 公开列表：仅已审核 + 未删除
export async function listApproved(category?: GuideCategory): Promise<GuideListResult> {
  try {
    let q = supabase
      .from(TABLE)
      .select('*')
      .eq('status', 'approved')
      .eq('deleted', false)
      .order('period', { ascending: false })
      .order('created_at', { ascending: false });
    if (category) q = q.eq('category', category);
    const { data, error } = await q;
    if (error) return { entries: [], error: error.message };
    return { entries: (data as GuideRow[]).map(rowToEntry), error: null };
  } catch (e) {
    return { entries: [], error: (e as Error).message };
  }
}

// 后台全量列表（RLS 会自动限制：非管理员只能看到已审核）
export async function listAll(): Promise<GuideListResult> {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return { entries: [], error: error.message };
    return { entries: (data as GuideRow[]).map(rowToEntry), error: null };
  } catch (e) {
    return { entries: [], error: (e as Error).message };
  }
}

// 投稿：管理员直接 approved，普通用户 pending
export async function submitGuide(entry: GuideEntry, userId: string, isAdmin: boolean): Promise<string | null> {
  const row = {
    category: entry.category,
    period: entry.period,
    stage: entry.stage ?? null,
    attribute: entry.attribute,
    weather: entry.weather ?? null,
    turns: entry.turns,
    team: entry.team,
    author: entry.author,
    video_url: entry.videoUrl ?? null,
    image_url: entry.imageUrl ?? null,
    notes: entry.notes ?? null,
    score: entry.score ?? null,
    status: isAdmin ? 'approved' : 'pending',
    user_id: userId,
  };
  const { error } = await supabase.from(TABLE).insert(row);
  return error?.message || null;
}

export async function setGuideStatus(uuid: string, status: GuideStatus): Promise<string | null> {
  const { error } = await supabase.from(TABLE).update({ status, updated_at: new Date().toISOString() }).eq('id', uuid);
  return error?.message || null;
}

export async function softDeleteGuide(uuid: string): Promise<string | null> {
  const { error } = await supabase.from(TABLE).update({ deleted: true, updated_at: new Date().toISOString() }).eq('id', uuid);
  return error?.message || null;
}

// 编辑作业（内容字段更新，不动 status/user_id；RLS 限制本人或管理员）
export async function updateGuide(uuid: string, entry: GuideEntry): Promise<string | null> {
  const row = {
    category: entry.category,
    period: entry.period,
    stage: entry.stage ?? null,
    attribute: entry.attribute,
    weather: entry.weather ?? null,
    turns: entry.turns,
    team: entry.team,
    author: entry.author,
    video_url: entry.videoUrl ?? null,
    image_url: entry.imageUrl ?? null,
    notes: entry.notes ?? null,
    score: entry.score ?? null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from(TABLE).update(row).eq('id', uuid);
  return error?.message || null;
}

// 点赞/取消点赞（原子 RPC），返回最新点赞数
export async function toggleGuideLike(uuid: string): Promise<{ count: number; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('toggle_guide_like', { p_entry_id: uuid });
    if (error) return { count: 0, error: error.message };
    return { count: (data as number) ?? 0, error: null };
  } catch (e) {
    return { count: 0, error: (e as Error).message };
  }
}

// 当前用户已点赞的作业 id 列表
export async function listMyLikedIds(): Promise<string[]> {
  try {
    const { data, error } = await supabase.from('guide_likes').select('entry_id');
    if (error) return [];
    return (data as { entry_id: string }[]).map(r => r.entry_id);
  } catch {
    return [];
  }
}
