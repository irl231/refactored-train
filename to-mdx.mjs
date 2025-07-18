// transform-json-to-mdx.mjs
import { readFile, writeFile, mkdir, rm } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { normalizeText, normalizeName, normalizeParagraph } from 'normalize-text';
import { EnglishSpellingNormalizer } from '@shelf/text-normalizer';
import transformTitle from 'title';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const spellingNormalizer = new EnglishSpellingNormalizer();

const toKey = (dateStr) => {
  const date = new Date(dateStr);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd}`;
};

const toMDX = ({ title, author, datePublished, content }) => `---\ntitle: "${title}"\nauthor: "${author}"\ndatePublished: "${datePublished}"\n---\n\n${content.join('\n\n')}`;

// Load articles
const raw = await readFile(join(__dirname, 'scraped-data', 'articles.json'), 'utf-8');
const articles = JSON.parse(raw);

const seenTitles = new Set();

// Group by date folder
const grouped = {};
for (const news of articles) {
  const titleKey = normalizeText(news.title).toLowerCase().trim();
  if (seenTitles.has(titleKey)) continue; // skip duplicates
  seenTitles.add(titleKey);

  const date = new Date(news.datePublished);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const key = `${yyyy}/${mm}/${dd}`;

  if (!grouped[key]) grouped[key] = [];
  grouped[key].push(news);
}

await rm(join(__dirname, 'news'), { force: true, recursive: true });

const writeTasks = [];

for (const [key, group] of Object.entries(grouped)) {
  group.sort((a, b) => {
    const d1 = new Date(a.datePublished);
    const d2 = new Date(b.datePublished);
    const diff = d1 - d2;
    if (diff !== 0) return diff;

    return articles.indexOf(b) - articles.indexOf(a);
  });

  const dir = join(__dirname, 'news', ...key.split('/'));
  await mkdir(dir, { recursive: true });

  group.forEach((news, i) => {
    const title = transformTitle(spellingNormalizer.normalize(normalizeText(news.title)));
    const author = normalizeName(news.author);
    const thumbnail = news.thumbnail;
    const images = Array.isArray(news.images) ? news.images : [];
    const content = news.content.map(p =>
      spellingNormalizer.normalize(normalizeParagraph(normalizeText(p)))
    );

    const imageMarkdown = images.map(img =>
      `![${img.caption ?? ''}](${img.url})`
    ).join('\n');

    const fullContent = [...content, imageMarkdown].filter(Boolean).join('\n\n');

    const firstParagraph = content[0] ?? '';
    const words = firstParagraph.split(/\s+/);
    const description = words.length <= 15
      ? firstParagraph
      : words.slice(0, 15).join(' ') + '...';

    const slug = normalizeText(news.title)
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-+|-+$/g, '');

    const date = new Date(news.datePublished);
    const formattedDate = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;

    const mdx = `---\n` +
      `slug: "${slug}"\n` +
      `title: "${title}"\n` +
      `description: "${description}"\n` +
      `author: "${author}"\n` +
      `date: "${formattedDate}"\n` +
      `thumbnail: "${thumbnail}"\n` +
      `---\n\n` +
      fullContent;

    const filename = String(i + 1).padStart(3, '0') + '.mdx';
    const outputPath = join(dir, filename);
    writeTasks.push(writeFile(outputPath, mdx.trim()).then(() =>
      console.log('✅ Created:', outputPath)
    ));
  });

}

await Promise.all(writeTasks);
