// 攻略资讯后台管理员列表（Supabase 用户 UUID）。
// 管理员可进入后台审核面板、免审核直接发布作业。
// 在 Supabase Dashboard → Authentication → Users 查看用户 UUID 填入下方，
// 并同步更新 supabase/guide_entries.sql 中 is_guide_admin() 函数的 UUID 数组。
export const ADMIN_USER_IDS: string[] = [
  'c97da159-b8c1-442a-bf02-97b9de28e1c4'
];
