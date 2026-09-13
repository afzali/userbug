/**
 * خودآزمای فهرستِ مدل‌ها و «مناسب برای چه کاری».
 *
 * ── چرا این فایل هست ──
 *
 * دو مدل پشتِ سر هم پیش‌فرضِ نقشِ `analyze` شدند و هر دو شکستند: یکی رایگان
 * بودنش تمام شد (۴۰۴)، و دومی **پاسخ خالی** داد چون نسخهٔ رایگانش
 * `structured_outputs` نداشت و یک مدلِ reasoning بود.
 *
 * دومی درسِ مهم‌تری داشت: معیارِ انتخابِ مدل برای این ابزار «باهوش‌تر» نیست،
 * «JSON را می‌شود ازش گرفت» است. آن معیار حالا کد است، و کدی که سنجیده نشود
 * به‌مرور به سلیقه برمی‌گردد.
 *
 * ورودی‌های این آزمون عمداً **ردیفِ واقعیِ** OpenRouter اند، نه ساختگی.
 */
import { test, expect } from '@playwright/test';
import { describeModel, fitFor, rankFor } from '../../src/models/catalog.js';

/** همان مدلی که پاسخ خالی داد — رونوشتِ ردیفِ واقعی‌اش. */
const NEMOTRON_FREE = {
  id: 'nvidia/nemotron-3-ultra-550b-a55b:free',
  name: 'NVIDIA: Nemotron 3 Ultra (free)',
  context_length: 1_000_000,
  pricing: { prompt: '0', completion: '0' },
  top_provider: { context_length: 1_000_000, max_completion_tokens: 65536 },
  supported_parameters: ['include_reasoning', 'max_tokens', 'reasoning', 'temperature', 'tools'],
  benchmarks: { artificial_analysis: { intelligence_index: 23.4 } },
};

/** و یکی که ساختارِ خروجی را می‌پذیرد. */
const NEX_PRO_FREE = {
  id: 'nex-agi/nex-n2.5-pro:free',
  name: 'Nex N2.5 Pro (free)',
  context_length: 262_144,
  pricing: { prompt: '0', completion: '0' },
  top_provider: { context_length: 262_144, max_completion_tokens: 235_929 },
  supported_parameters: ['max_tokens', 'reasoning', 'response_format', 'structured_outputs'],
  benchmarks: {},
};

const PAID_SMALL = {
  id: 'vendor/tiny',
  name: 'Tiny',
  context_length: 8_000,
  pricing: { prompt: '0.0000025', completion: '0.00001' },
  top_provider: { context_length: 8_000, max_completion_tokens: 1_000 },
  supported_parameters: ['max_tokens', 'response_format'],
  benchmarks: {},
};

test.describe('توصیفِ مدل', () => {
  test('قیمت به دلار بر میلیون توکن درمی‌آید', () => {
    const model = describeModel(PAID_SMALL);
    expect(model.price.prompt).toBeCloseTo(2.5, 5);
    expect(model.price.completion).toBeCloseTo(10, 5);
    expect(describeModel(NEX_PRO_FREE).price.prompt).toBe(0);
  });

  test('رایگان بودن از اسلاگ می‌آید، نه از قیمت', () => {
    expect(describeModel(NEX_PRO_FREE).free).toBe(true);
    expect(describeModel(PAID_SMALL).free).toBe(false);
  });

  test('پشتیبانی از JSON سه پله دارد', () => {
    expect(describeModel(NEX_PRO_FREE).json).toBe('structured');
    expect(describeModel(PAID_SMALL).json).toBe('format');
    expect(describeModel(NEMOTRON_FREE).json).toBe('none');
  });

  test('اندازه‌ها از top_provider می‌آیند، چون سقفِ واقعیِ اجرا همان است', () => {
    const model = describeModel(NEMOTRON_FREE);
    expect(model.context).toBe(1_000_000);
    expect(model.maxOutput).toBe(65_536);
  });

  test('نبودِ بنچمارک یعنی «نمی‌دانیم»، نه صفر', () => {
    expect(describeModel(NEX_PRO_FREE).iq).toBeNull();
    expect(describeModel(NEMOTRON_FREE).iq).toBe(23.4);
  });
});

test.describe('مناسب برای نقش', () => {
  test('reasoning بدونِ JSON پرخطر است، هرچقدر هم باهوش', () => {
    const fit = fitFor(describeModel(NEMOTRON_FREE), 'analyze');
    expect(fit.level).toBe('risky');
    expect(fit.notes.some((note) => !note.good && note.text.includes('پاسخ خالی'))).toBe(true);
  });

  test('و این هشدار با «رایگان» و «هوشِ بالا» خنثی نمی‌شود', () => {
    // هشدار سطحِ خطر را تعیین می‌کند، نه جمعِ امتیازها — وگرنه همان مدلی که
    // پاسخ خالی داد، دوباره بالای فهرست می‌نشست
    const smart = { ...NEMOTRON_FREE, benchmarks: { artificial_analysis: { intelligence_index: 99 } } };
    expect(fitFor(describeModel(smart), 'analyze').level).toBe('risky');
  });

  test('مدلی که ساختارِ خروجی می‌پذیرد، مناسب است', () => {
    expect(fitFor(describeModel(NEX_PRO_FREE), 'analyze').level).toBe('good');
  });

  test('context و سقفِ خروجیِ کوچک برای تحلیل جریمه دارند', () => {
    const fit = fitFor(describeModel(PAID_SMALL), 'analyze');
    expect(fit.notes.some((note) => note.text.includes('context'))).toBe(true);
    expect(fit.notes.some((note) => note.text.includes('خروجی'))).toBe(true);
    expect(fit.level).toBe('risky');
  });

  test('گرانی فقط نقشِ پرتکرار را می‌سوزاند', () => {
    const model = describeModel({ ...PAID_SMALL, context_length: 200_000, top_provider: { context_length: 200_000, max_completion_tokens: 30_000 } });
    const resolve = fitFor(model, 'resolve');
    const analyze = fitFor(model, 'analyze');
    expect(resolve.notes.some((note) => note.text.includes('گران'))).toBe(true);
    expect(analyze.notes.some((note) => note.text.includes('گران'))).toBe(false);
    expect(resolve.score).toBeLessThan(analyze.score);
  });

  test('رتبه‌بندی، مدلِ امن را بالای مدلِ پرخطر می‌گذارد', () => {
    const ranked = rankFor([NEMOTRON_FREE, NEX_PRO_FREE].map(describeModel), 'analyze');
    expect(ranked[0].id).toBe('nex-agi/nex-n2.5-pro:free');
  });
});
