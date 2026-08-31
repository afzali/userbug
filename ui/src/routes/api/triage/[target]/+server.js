import { json } from '@sveltejs/kit';
import { aggregateTriage, saveTriage } from '$lib/server/artifacts.js';
import { applyVerdict } from '../../../../../../src/knowledge/feedback.js';
import { jsonError } from '$lib/server/http.js';
import { assertMutationRequest } from '$lib/server/security.js';

export async function GET({ params }) {
  try {
    return json({ findings: await aggregateTriage(params.target) });
  } catch (cause) {
    return jsonError(cause, 400);
  }
}

export async function POST(event) {
  try {
    assertMutationRequest(event);
    const body = await event.request.json();
    const triage = await saveTriage(event.params.target, body.fingerprint, body);

    /**
     * برچسب به شناخت برمی‌گردد.
     *
     * ── چرا بعد از ذخیره و با catch ──
     *
     * تریاژ باید ثبت شود حتی اگر نوشتنِ شناخت نشود. برعکسش یعنی کاربر برچسب
     * می‌زند، چیزی در پس‌زمینه می‌شکند، و برچسبش هم گم می‌شود — بدترین
     * ترکیب.
     *
     * ── چرا `latest` و نه خودِ body ──
     *
     * حلقهٔ یادگیری به `checkId` نیاز دارد تا بفهمد کدام چک پرسروصداست، و
     * آن روی خودِ یافته است نه روی چیزی که کلاینت می‌فرستد. اعتماد به
     * `checkId`ِ ارسالی یعنی هر کسی می‌تواند هر چکی را خاموش کند.
     */
    let learned = null;
    if (body.verdict) {
      const findings = await aggregateTriage(event.params.target);
      const found = findings.find((item) => item.fingerprint === body.fingerprint);
      if (found) {
        learned = await applyVerdict({
          target: event.params.target,
          finding: { ...found.latest, fingerprint: found.fingerprint, message: found.message },
          verdict: body.verdict,
        }).catch(() => null);
      }
    }

    return json({ triage, learned });
  } catch (cause) {
    return jsonError(cause, 400);
  }
}
