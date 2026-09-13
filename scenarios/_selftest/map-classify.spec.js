/**
 * خودآزمای فاز ۲ — «این دکمه چه می‌کند؟».
 *
 * سه چیز سنجیده می‌شود و هر سه اگر بشکنند بی‌صدا می‌شکنند:
 *
 *   ۱. قاعده‌ها روی سورسِ واقعی‌نما جواب بدهند — وگرنه همه‌چیز به مدل
 *      می‌افتد و «بیشترش بی‌مدل است» یک ادعای توخالی می‌شود.
 *   ۲. باطل‌سازیِ دوتایی: گرهی که نه صفحه‌اش عوض شده نه کدش، دوباره
 *      طبقه‌بندی **نشود**. این تمامِ صرفه‌جویی است.
 *   ۳. حرفِ آدم عوض نشود، و `to`ِ واقعی با `predicted`ِ حدسی قاطی نشود.
 */
import { test, expect } from '@playwright/test';

import {
  applyVerdicts,
  hashSource,
  mispredictions,
  needsClassify,
  normalize,
  ruleVerdict,
} from '../../src/map/classify.js';

/** سورسِ سبکِ Svelte، همان شکلی که نپی دارد. */
const SVELTE = {
  relative: 'src/lib/sidebar.svelte',
  content: `<script>
  import { goto } from '$app/navigation';
  async function handleDelete() {
    if (!confirm('مطمئنی؟')) return;
    await fetch('/api/books/' + id, { method: 'DELETE' });
  }
  async function save() {
    await fetch('/api/books', { method: 'POST', body: JSON.stringify(book) });
  }
</script>

<button onclick={() => goto('/contents')}>مطالب مطالعه و نظر</button>
<button onclick={handleDelete}>حذف کتاب</button>
<button onclick={save}>ذخیره</button>
<span>نسخهٔ ۲.۱</span>
`,
};

test.describe('قاعده روی سورس', () => {
  test('ناوبری با مقصدش پیدا می‌شود', () => {
    const verdict = ruleVerdict('مطالب مطالعه و نظر', [SVELTE]);
    expect(verdict.kind).toBe('nav');
    expect(verdict.predicted).toBe('/contents');
  });

  test('هندلرِ نام‌دار دنبال می‌شود، نه فقط خطِ خودِ دکمه', () => {
    // `onclick={handleDelete}` و بدنه‌اش بیست خط بالاتر — بی دنبال کردنش،
    // قاعده روی نیمی از دکمه‌ها هیچ نمی‌گوید
    expect(ruleVerdict('حذف کتاب', [SVELTE]).kind).toBe('destructive');
    expect(ruleVerdict('ذخیره', [SVELTE]).kind).toBe('mutate');
  });

  test('چیزی که در سورس نیست، حکم نمی‌گیرد', () => {
    // `null` یعنی «به مدل بسپار»، که با `unknown` فرق دارد
    expect(ruleVerdict('دکمه‌ای که وجود ندارد', [SVELTE])).toBeNull();
    expect(ruleVerdict('', [SVELTE])).toBeNull();
  });

  test('نیم‌فاصله تطبیق را نمی‌شکند', () => {
    expect(normalize('یادداشت‌ها')).toBe(normalize('یادداشتها'));
    const file = { relative: 'a.svelte', content: `<a href="/list">یادداشت‌ها</a>` };
    expect(ruleVerdict('یادداشتها', [file])?.predicted).toBe('/list');
  });
});

test.describe('باطل‌سازیِ دوتایی', () => {
  const state = () => ({ profile: 'button:5-8', classified: { profile: 'button:5-8', sourceHash: 'h1' } });

  test('گرهی که هیچ‌چیزش عوض نشده، دوباره طبقه‌بندی نمی‌شود', () => {
    expect(needsClassify(state(), 'h1')).toBe(false);
  });

  test('ولی تغییرِ صفحه یا تغییرِ کد، هر دو باطل می‌کنند', () => {
    const changedPage = { ...state(), profile: 'button:9-16' };
    expect(needsClassify(changedPage, 'h1')).toBe(true);
    expect(needsClassify(state(), 'h2')).toBe(true);
  });

  test('گرهی که هرگز طبقه‌بندی نشده، لازم دارد', () => {
    expect(needsClassify({ profile: 'x' }, 'h1')).toBe(true);
  });

  test('هش به محتوا حساس است، نه فقط به نامِ فایل', () => {
    const one = hashSource([{ relative: 'a.js', content: 'const x = 1;' }]);
    const two = hashSource([{ relative: 'a.js', content: 'const x = 2;' }]);
    const three = hashSource([{ relative: 'b.js', content: 'const x = 1;' }]);
    expect(one).not.toBe(two);
    expect(one).not.toBe(three);
    expect(one).toBe(hashSource([{ relative: 'a.js', content: 'const x = 1;' }]));
  });
});

test.describe('اعمالِ حکم', () => {
  test('حرفِ آدم عوض نمی‌شود', () => {
    const state = {
      actions: [
        { key: 'a', kind: 'destructive', by: 'user' },
        { key: 'b', kind: 'unknown', by: 'rule' },
      ],
    };
    applyVerdicts(state, { a: { kind: 'nav' }, b: { kind: 'nav', predicted: '/x' } }, { by: 'source' });

    expect(state.actions[0].kind).toBe('destructive');
    expect(state.actions[0].by).toBe('user');
    expect(state.actions[1].kind).toBe('nav');
    expect(state.actions[1].by).toBe('source');
  });

  test('`to`ِ واقعی با `predicted`ِ حدسی قاطی نمی‌شود', () => {
    const state = { actions: [{ key: 'a', kind: 'unknown', to: 'state-9' }] };
    applyVerdicts(state, { a: { kind: 'nav', predicted: '/x' } }, { by: 'source' });
    expect(state.actions[0].to).toBe('state-9');
    expect(state.actions[0].predicted).toBe('/x');
  });

  test('kindِ بی‌معنا رد می‌شود', () => {
    const state = { actions: [{ key: 'a', kind: 'unknown' }] };
    applyVerdicts(state, { a: { kind: 'هرچیزی' } }, { by: 'model' });
    expect(state.actions[0].kind).toBe('unknown');
  });
});

test.describe('پیش‌بینی در برابر واقعیت', () => {
  const map = {
    states: [
      {
        id: 's1',
        route: '/contents',
        actions: [
          { key: 'a', label: 'برو به تنظیمات', predicted: '/settings', to: 's2' },
          { key: 'b', label: 'برو به کتاب', predicted: '/content/[id]', to: 's3' },
          { key: 'c', label: 'هنوز نزده', predicted: '/x' },
        ],
      },
      { id: 's2', route: '/login' },
      { id: 's3', route: '/content/[id]' },
    ],
  };

  test('اختلافِ واقعی پیدا می‌شود', () => {
    const wrong = mispredictions(map);
    expect(wrong).toHaveLength(1);
    expect(wrong[0].predicted).toBe('/settings');
    expect(wrong[0].actual).toBe('/login');
  });

  test('روتِ پویا اختلاف نیست، و کنشِ نزده هم', () => {
    // `/content/[id]` با خودش می‌خواند؛ و کنشی که امتحان نشده سکوت است
    expect(mispredictions(map).some((row) => row.label === 'برو به کتاب')).toBe(false);
    expect(mispredictions(map).some((row) => row.label === 'هنوز نزده')).toBe(false);
  });
});
