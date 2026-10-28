import { openToken, refreshToken, sealToken } from "./instagram";
import type { Store } from "./store";

const REFRESH_BEFORE_DAYS = 14;

// Uzun ömürlü Instagram anahtarları 60 gün geçerlidir; bitmesine iki haftadan az kalanlar
// yenilenir. Günlük görevden çağrılır. Yenilenemeyen hesap bağlı kalır; sahibi süre dolunca
// panelde uyarı görür ve yeniden bağlar.
export async function refreshInstagramTokens(deps: { store: Store; now?: Date; refresh?: typeof refreshToken }) {
  const now = deps.now ?? new Date();
  const refresh = deps.refresh ?? refreshToken;
  const result = { refreshed: 0, failed: [] as string[] };
  for (const account of await deps.store.listInstagramAccounts()) {
    const left = Date.parse(account.tokenExpiresAt) - now.getTime();
    if (left > REFRESH_BEFORE_DAYS * 86_400_000 || left <= 0) continue;
    try {
      const fresh = await refresh(openToken(account.sealedToken));
      await deps.store.saveInstagramAccount({ ...account, sealedToken: sealToken(fresh.token), tokenExpiresAt: fresh.expiresAt });
      result.refreshed++;
    } catch (error) {
      console.error("Instagram anahtarı yenilenemedi:", account.businessId, error);
      result.failed.push(account.businessId);
    }
  }
  return result;
}
