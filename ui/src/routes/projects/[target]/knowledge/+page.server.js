import { coverageOf } from '../../../../../../src/knowledge/coverage.js';
import { readHistory } from '../../../../../../src/knowledge/history.js';
import { readBrief } from '../../../../../../src/knowledge/brief.js';
import { knowledgeDir, listPages, readDossier } from '../../../../../../src/knowledge/store.js';
import { listDocs } from '../../../../../../src/knowledge/docs.js';

/**
 * شناختِ پروژه.
 *
 * ── چرا هیچ‌کدام از این خواندن‌ها صفحه را نمی‌خواباند ──
 *
 * پروژه‌ای که هنوز شناختی ندارد باید همین صفحه را ببیند، با دکمهٔ «شروع».
 * اگر نبودِ `knowledge/` خطا می‌داد، تنها راهِ ساختنش از صفحه‌ای می‌گذشت که
 * خودش باز نمی‌شد.
 *
 * ── و چرا حساب‌ها و fixtureها و چک‌ها اینجا نیستند ──
 *
 * جنسشان تنظیمات است نه شناخت، و به `/projects/<کلید>/config` رفتند. مرز:
 * چیزی که با گشت و سورس و مدل **پر می‌شود** شناخت است؛ چیزی که کاربر
 * **تنظیم می‌کند** پیکربندی.
 */
export async function load({ params }) {
  const target = params.target;

  const safely = (fn, fallback) => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };

  return {
    /**
     * توضیحِ خودِ آدم — جدا از پرونده، چون مالکش فرق دارد.
     *
     * پرونده را اتوماسیون می‌نویسد (`learn`، گشت، تریاژ). این متن `by: user`
     * است و در فایلِ خودش می‌نشیند تا هیچ اجرایی رویش ننویسد.
     */
    brief: safely(() => readBrief(target), ''),
    dossier: safely(() => readDossier(target), null),
    pages: safely(() => listPages(target), []),
    coverage: safely(() => coverageOf(target), null),
    history: safely(() => readHistory(knowledgeDir(target), { limit: 60 }), []),
    docs: await listDocs(target).catch(() => []),
  };
}
