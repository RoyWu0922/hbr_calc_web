/**
 * Generate web cursor assets from the "cursor/" folder packs.
 *
 * Two source formats are normalized to the same output:
 *   - CursorWPF packs: Resource/{0stand,1touch,3textselect,6drag}/NN.png
 *     display size 100px, offsets in display px, ticks->interval = ticks*50ms
 *   - Re-dRive packs (镜华/小凤): Animations/{Normal,Link,Text}/NN.png
 *     scale factor in config, offsets in SOURCE px (hotspot), interval in ms
 *
 * Output per pack under src/assets/cursors/<slug>/<state>/NN.webp (100px)
 * plus src/assets/cursors/<slug>/manifest.json
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const OUT = 'src/assets/cursors';
const SIZE = 100; // display size in px
const HOTSPOT_WPF = { stand: { x: 20, y: 15 }, touch: { x: 20, y: 15 }, text: { x: 20, y: 30 }, drag: { x: 20, y: 15 } };
const TICKS_WPF = { stand: 2, touch: 4, text: 2, drag: 2 };

const WPF_PACKS = [
  { slug: 'yuni', label: '优妮', src: 'cursor/优妮指针程序版1.0(1)/YuniCursor/Resource' },
  { slug: 'kyaru', label: '公主凯露', src: 'cursor/公主凯露指针程序版1.2/KyaruPrincessCursor/Resource' },
  { slug: 'mahiru', label: '夏日真步', src: 'cursor/夏日真步指针程序版1.0(1)/MahoSummerCursor/Resource' },
  { slug: 'hatsune', label: '新春初音', src: 'cursor/新春初音指针程序版1.0/HatsuneNewyearCursor/Resource' },
  { slug: 'amesu', label: '爱梅斯', src: 'cursor/爱梅斯指针程序版1.0/AmesuCursor/Resource' },
];

const WPF_STATES = {
  stand: { folder: '0stand' },
  touch: { folder: '1touch' },
  text: { folder: '3textselect' },
  drag: { folder: '6drag' },
};

async function frames(dir) {
  let files = [];
  try { files = await readdir(dir); } catch { return null; }
  return files.filter(f => /\.png$/i.test(f)).sort();
}

/** Build a horizontal sprite strip of all frames resized to `size` (single WebP). */
async function buildStrip(srcDir, outFile, size) {
  const files = await frames(srcDir);
  if (!files) return 0;
  const bufs = [];
  for (const f of files) {
    bufs.push(await sharp(join(srcDir, f)).resize(size, size, { fit: 'contain' }).webp({ quality: 80 }).toBuffer());
  }
  await mkdir(join(outFile, '..'), { recursive: true });
  await sharp({
    create: { width: size * files.length, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(bufs.map((input, i) => ({ input, left: i * size, top: 0 })))
    .webp({ quality: 80 })
    .toFile(outFile);
  return files.length;
}

/** First stand frame as a small static preview for the settings picker */
async function preview(packDir, firstFramePath) {
  await mkdir(packDir, { recursive: true });
  await sharp(firstFramePath).resize(64, 64).webp({ quality: 85 }).toFile(join(packDir, 'preview.webp'));
}

async function genWpf(pack) {
  const manifest = { label: pack.label, states: {} };
  const firstFrame = join(pack.src, WPF_STATES.stand.folder, (await frames(join(pack.src, WPF_STATES.stand.folder)))[0]);
  await preview(join(OUT, pack.slug), firstFrame);
  for (const [state, spec] of Object.entries(WPF_STATES)) {
    const src = join(pack.src, spec.folder);
    const n = await buildStrip(src, join(OUT, pack.slug, `${state}.webp`), SIZE);
    if (n > 0) {
      manifest.states[state] = {
        frames: n,
        interval: TICKS_WPF[state] * 50,
        ox: -HOTSPOT_WPF[state].x,
        oy: -HOTSPOT_WPF[state].y,
      };
    }
  }
  return manifest;
}

const REDRIVE_CFG = {
  kyouka: {
    stand: { folder: 'Normal', offset: '60,55', interval: 60 },
    touch: { folder: 'Link', offset: '60,55', interval: 60 },
    text: { folder: 'Text', offset: '55,50', interval: 50 },
    drag: { folder: 'Link', offset: '60,55', interval: 60 },
  },
  xiaofeng: {
    stand: { folder: 'Normal', offset: '55,50', interval: 60 },
    touch: { folder: 'Link', offset: '80,45', interval: 60 },
    text: { folder: 'Text', offset: '55,43', interval: 75 },
    drag: { folder: 'Link', offset: '80,45', interval: 60 },
  },
};

async function genRedrive(slug, label, srcBase, stateCfg) {
  const firstDir = join(srcBase, stateCfg.stand.folder);
  const files = await frames(firstDir);
  if (!files?.length) return null;
  const meta = await sharp(join(firstDir, files[0])).metadata();
  const scale = SIZE / meta.width;

  const manifest = { label, states: {} };
  await preview(join(OUT, slug), join(firstDir, files[0]));
  for (const [state, cfg] of Object.entries(stateCfg)) {
    const n = await buildStrip(join(srcBase, cfg.folder), join(OUT, slug, `${state}.webp`), SIZE);
    if (n > 0) {
      const [sx, sy] = cfg.offset.split(',').map(Number);
      manifest.states[state] = {
        frames: n,
        interval: cfg.interval,
        ox: Math.round(-sx * scale),
        oy: Math.round(-sy * scale),
      };
    }
  }
  return manifest;
}

const results = [];
for (const pack of WPF_PACKS) {
  const m = await genWpf(pack);
  await writeFile(join(OUT, pack.slug, 'manifest.json'), JSON.stringify(m));
  results.push(`${pack.slug}(${pack.label}) → ${Object.keys(m.states).map(s => `${s}:${m.states[s].frames}`).join(' ')}`);
}
for (const [slug, meta] of Object.entries(REDRIVE_CFG)) {
  const label = slug === 'kyouka' ? '夏日镜华' : '小凤';
  const srcBase = slug === 'kyouka'
    ? 'cursor/夏日镜华指针程序版2.1/AnimationCursor/Animations'
    : 'cursor/小凤指针程序版2.1/AnimationCursor/Animations';
  const m = await genRedrive(slug, label, srcBase, REDRIVE_CFG[slug]);
  if (m) {
    await writeFile(join(OUT, slug, 'manifest.json'), JSON.stringify(m));
    results.push(`${slug}(${label}) → ${Object.keys(m.states).map(s => `${s}:${m.states[s].frames}`).join(' ')}`);
  }
}

const registry = {
  packs: [
    { slug: 'yuni', label: '优妮' },
    { slug: 'kyaru', label: '公主凯露' },
    { slug: 'mahiru', label: '夏日真步' },
    { slug: 'kyouka', label: '夏日镜华' },
    { slug: 'xiaofeng', label: '小凤' },
    { slug: 'hatsune', label: '新春初音' },
    { slug: 'amesu', label: '爱梅斯' },
  ],
};
await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, 'registry.json'), JSON.stringify(registry, null, 2));
console.log(results.join('\n'));
console.log('done');
