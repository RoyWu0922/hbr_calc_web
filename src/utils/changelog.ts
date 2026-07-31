import changelogData from '../data/changelog.json';

export interface ChangelogEntry {
  id: string;
  date: string;
  title: string;
  content: string;
}

const SEEN_KEY = 'hbr_changelog_seen';

/** Get the current unpublished announcement, if any and unseen */
export function getUnseenAnnouncement(): ChangelogEntry | null {
  const current = (changelogData as any).current as ChangelogEntry | null;
  if (!current) return null;
  const seen = localStorage.getItem(SEEN_KEY);
  if (seen === current.id) return null;
  return current;
}

/** Mark the current announcement as seen */
export function markAnnouncementSeen(id: string): void {
  localStorage.setItem(SEEN_KEY, id);
}

/** Get current announcement regardless of seen status (for manual re-open) */
export function getCurrentAnnouncement(): ChangelogEntry | null {
  return (changelogData as any).current as ChangelogEntry | null;
}
