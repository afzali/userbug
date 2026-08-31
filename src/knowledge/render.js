/**
 * پرونده → متنِ خواندنی.
 *
 * ── چرا Markdown ساخته می‌شود و ذخیره نمی‌شود ──
 *
 * `dossier.json` تنها منبعِ حقیقت است. اگر یک `dossier.md` هم روی دیسک
 * می‌ماند، کسی دیر یا زود آن را ویرایش می‌کرد و دو منبع واگرا می‌شدند —
 * یعنی مدل چیزی می‌دید که کاربر ندیده. پس این تابع رشته برمی‌گرداند: CLI
 * چاپش می‌کند، رابط نشانش می‌دهد، و هیچ‌کدام نگهش نمی‌دارند.
 *
 * ── چرا `by` در خروجی می‌آید ──
 *
 * خواننده باید بتواند بی‌مراجعه به JSON بفهمد کدام جمله را خودش گفته و کدام
 * را مدل حدس زده. بدون آن، متنِ خوشْ‌قیافه همهٔ بندها را هم‌وزن نشان می‌دهد.
 */
import { coverageOf } from './coverage.js';
import { listPages, readDossier } from './store.js';

const MARK = { user: 'کاربر', tour: 'گشت', source: 'سورس', run: 'اجرا', docs: 'مستند', model: 'مدل' };

function tag(item) {
  return `_${MARK[item?.by] || MARK.model}_`;
}

function section(title, lines) {
  if (!lines.length) return [];
  return ['', `## ${title}`, '', ...lines];
}

/**
 * @param {string} target کلید پروژه
 * @returns {string} متن Markdown
 */
export function renderDossier(target) {
  const dossier = readDossier(target);
  const pages = listPages(target);
  const coverage = coverageOf(target);

  const out = [`# شناختِ پروژهٔ ${dossier.target}`];

  if (!coverage.started) {
    out.push(
      '',
      'هنوز چیزی دربارهٔ این پروژه نمی‌دانیم.',
      '',
      'شروع: `userbug learn <پروژه> --source` برای خواندنِ سورس، یا',
      '`userbug tour <پروژه>` برای گشتِ زنده در مرورگر.'
    );
    return out.join('\n') + '\n';
  }

  out.push(
    '',
    `سنجهٔ شناخت: **${Math.round(coverage.score * 100)}٪** · ` +
      `${coverage.routes.described} از ${coverage.routes.known} روت هدف دارد · ` +
      `${coverage.pages.total} صفحهٔ ثبت‌شده` +
      (coverage.pages.stale ? ` (${coverage.pages.stale} کهنه)` : '') +
      (coverage.questionsOpen ? ` · ${coverage.questionsOpen} پرسشِ بی‌جواب` : '')
  );

  if (dossier.updatedAt) out.push('', `آخرین تغییر: ${dossier.updatedAt}`);
  if (dossier.summary) out.push('', dossier.summary);

  const stack = dossier.stack;
  const stackParts = [
    stack.framework && `فریم‌ورک: ${stack.framework}`,
    stack.language && `زبان: ${stack.language}`,
    stack.backend && `بک‌اند: ${stack.backend}`,
    stack.db && `دیتابیس: ${stack.db}`,
  ].filter(Boolean);
  if (stackParts.length) out.push(...section('استک', [`${stackParts.join(' · ')}  ${tag(stack)}`]));

  const auth = dossier.auth;
  if (auth.kind !== 'unknown' || auth.loginPath) {
    out.push(
      ...section('ورود', [
        `نوع: ${auth.kind}` +
          (auth.loginPath ? ` · مسیر: \`${auth.loginPath}\`` : '') +
          (auth.signupOpen === true ? ' · ثبت‌نام باز' : auth.signupOpen === false ? ' · ثبت‌نام بسته' : '') +
          (auth.sessionStore ? ` · نشست در ${auth.sessionStore}` : '') +
          `  ${tag(auth)}`,
      ])
    );
  }

  // صفحه‌ها به روت‌ها چسبانده می‌شوند: خواننده نباید دو فهرست را دستی تطبیق دهد.
  const pageByPath = new Map(pages.map((page) => [page.path, page]));
  out.push(
    ...section(
      'روت‌ها',
      dossier.routes.map((route) => {
        const page = pageByPath.get(route.path);
        const purpose = route.purpose || page?.purpose || '—';
        const flags = [
          route.requiresAuth === true && 'نیازمند ورود',
          page && 'گشت‌شده',
          page?.stale && '⚠ کهنه',
          page?.contract?.mode === 'expect' && 'قرارداد سخت',
        ].filter(Boolean);
        return `- \`${route.path}\` — ${purpose}  ${tag(route)}${flags.length ? ` · ${flags.join(' · ')}` : ''}`;
      })
    )
  );

  // صفحه‌ای که روت ندارد هم باید دیده شود، وگرنه گشت بی‌اثر به نظر می‌رسد
  const orphans = pages.filter((page) => !dossier.routes.some((route) => route.path === page.path));
  out.push(
    ...section(
      'صفحه‌های بدونِ روتِ ثبت‌شده',
      orphans.map((page) => `- \`${page.path}\` — ${page.purpose || '—'}  ${tag(page)}`)
    )
  );

  out.push(...section('واژه‌نامه', dossier.glossary.map((item) => `- **${item.term}** — ${item.meaning}  ${tag(item)}`)));
  out.push(...section('موجودیت‌ها', dossier.entities.map((item) => `- **${item.name}**${item.label ? ` («${item.label}»)` : ''}${item.where ? ` — ${item.where}` : ''}  ${tag(item)}`)));
  out.push(...section('مسیرهای مهم', dossier.flows.map((item) => `- **${item.name}**${item.scenario ? ` → \`${item.scenario}\`` : ''}${item.steps.length ? `\n  ${item.steps.join(' ← ')}` : ''}  ${tag(item)}`)));

  const files = [
    ...dossier.files.downloads.map((item) => `- دانلود: ${item.what}${item.where ? ` در \`${item.where}\`` : ''}${item.format ? ` (${item.format})` : ''}  ${tag(item)}`),
    ...dossier.files.uploads.map((item) => `- آپلود: ${item.what}${item.where ? ` در \`${item.where}\`` : ''}${item.format ? ` (${item.format})` : ''}  ${tag(item)}`),
  ];
  out.push(...section('فایل', files));

  out.push(...section('خطرها', dossier.risks.map((item) => `- **${item.label}**${item.why ? ` — ${item.why}` : ''}  ${tag(item)}`)));

  const open = dossier.openQuestions.filter((item) => !item.answer);
  out.push(...section('پرسش‌های بی‌جواب', open.map((item) => `- ${item.q}`)));

  const answered = dossier.openQuestions.filter((item) => item.answer);
  out.push(...section('پرسش‌های جواب‌گرفته', answered.map((item) => `- ${item.q}\n  → ${item.answer}`)));

  return out.join('\n') + '\n';
}
