import { tourState } from '$lib/server/tours.js';

/**
 * پنلِ گشت.
 *
 * وضعیت از حافظهٔ همین پروسه می‌آید، نه از دیسک: گشت یک شیءِ زنده است و تا
 * تمام نشده چیزی نوشته نمی‌شود. اگر کاربر تبِ پنل را ببندد و برگردد، همین
 * `load` گشتِ در جریان را پیدا می‌کند و SSE تاریخچه را بازپخش می‌کند.
 */
export async function load({ params }) {
  return { tour: tourState(params.target) };
}
