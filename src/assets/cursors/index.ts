import yuni from './yuni/manifest.json';
import yuniPreview from './yuni/preview.webp';
import kyaru from './kyaru/manifest.json';
import kyaruPreview from './kyaru/preview.webp';
import mahiru from './mahiru/manifest.json';
import mahiruPreview from './mahiru/preview.webp';
import kyouka from './kyouka/manifest.json';
import kyoukaPreview from './kyouka/preview.webp';
import xiaofeng from './xiaofeng/manifest.json';
import xiaofengPreview from './xiaofeng/preview.webp';
import hatsune from './hatsune/manifest.json';
import hatsunePreview from './hatsune/preview.webp';
import amesu from './amesu/manifest.json';
import amesuPreview from './amesu/preview.webp';
import sakuren from './sakuren/manifest.json';
import sakurenPreview from './sakuren/preview.webp';
import kasumi from './kasumi/manifest.json';
import kasumiPreview from './kasumi/preview.webp';

export interface CursorStateSpec {
  frames: number;
  interval: number;
  ox: number;
  oy: number;
}

export interface CursorManifest {
  label: string;
  states: Record<string, CursorStateSpec>;
}

export interface CursorPack {
  slug: string;
  label: string;
  manifest: CursorManifest;
  preview: string; // static preview image URL
  /** animated sprite packs (strips) vs static single-image portraits (duelo) */
  kind?: 'animated' | 'static';
  /** for static packs: image file name served from /duelo/ */
  image?: string;
  /** for static packs: source image dimensions */
  imgW?: number;
  imgH?: number;
}

import dueloManifest from './dueloManifest.json';

const dueloPacks: CursorPack[] = (dueloManifest.images as { name: string; file: string; w: number; h: number }[]).map(img => {
  const short = img.name.replace(/^Duel_/, '').replace(/Default$/, '');
  return {
    slug: 'duelo-' + short,
    label: img.name,
    manifest: { label: img.name, states: {} },
    preview: img.file, // served from public/duelo/
    kind: 'static',
    image: img.file,
    imgW: img.w,
    imgH: img.h,
  };
});

export const CURSOR_PACKS: CursorPack[] = [
  { slug: 'yuni', label: '优妮', manifest: yuni, preview: yuniPreview },
  { slug: 'kyaru', label: '公主凯露', manifest: kyaru, preview: kyaruPreview },
  { slug: 'mahiru', label: '夏日真步', manifest: mahiru, preview: mahiruPreview },
  { slug: 'kyouka', label: '夏日镜华', manifest: kyouka, preview: kyoukaPreview },
  { slug: 'xiaofeng', label: '小凤', manifest: xiaofeng, preview: xiaofengPreview },
  { slug: 'hatsune', label: '新春初音', manifest: hatsune, preview: hatsunePreview },
  { slug: 'amesu', label: '爱梅斯', manifest: amesu, preview: amesuPreview },
  { slug: 'sakuren', label: '新春咲恋', manifest: sakuren, preview: sakurenPreview },
  { slug: 'kasumi', label: '新春香澄', manifest: kasumi, preview: kasumiPreview },
  ...dueloPacks,
];

/** Lazy loaders for each state strip URL: path -> () => Promise<url> */
export const cursorImageLoaders = import.meta.glob(
  './*/*.webp',
  { query: '?url', import: 'default', eager: false }
) as Record<string, () => Promise<string>>;
