---
description: Checklist for adding a new premium-gated feature to Iron Gym. Pass the feature name as argument, e.g. `/premium-feature AI workout analysis`. Verifies all 5 required layers are present: server gate, client UX gate, subscription check, test coverage, and paywall trigger.
---

You are auditing or implementing the subscription gate for a new Iron Gym feature: **$ARGUMENTS**

Iron Gym uses a 5-layer subscription model. Every premium feature MUST have ALL 5 layers. Missing any one breaks either monetization (user bypasses paywall) or UX (user pays but sees an error).

## The 5 Layers

### Layer 1 — Server Enforcement (authoritative)

Server must check subscription status before executing the premium action. This is the only layer that truly prevents access.

```bash
# Find where getSubStatus or Subscription is checked in routes
grep -rn "getSubStatus\|subscription\|isPremium\|premium" C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/routes/ --include="*.ts" | grep -i "$ARGUMENTS\|the feature endpoint"
```

Expected pattern:
```typescript
import { getSubStatus } from '../utils/subscriptionCheck';

const sub = await getSubStatus(req.userId!);
// sub = { isPro: bool, isTrainer: bool, isClub: bool }
// getSubStatus checks: (status === 'active' || status === 'cancelled') && endDate > now
if (!sub.isPro) {
  return res.status(402).json({ error: 'Требуется подписка Pro', code: 'SUBSCRIPTION_REQUIRED' });
}
```

**Why `getSubStatus` not `findFirst`:** `findFirst({ status: 'active' })` misses cancelled subscriptions that are still within their paid period. `getSubStatus` handles both correctly.

**Flag if:** server returns data/action result without checking subscription.

### Layer 2 — Client UX Gate (prevent confusing 402)

Client must check before even letting the user attempt the action. The goal: redirect to Paywall BEFORE the API call, not after a 402 error.

```bash
grep -rn "isPremiumActive\|canSendAiMessage\|subscription\|PaywallModal\|paywall" C:/Users/sevka/Desktop/1223/work/iron-gym/src/screens/ C:/Users/sevka/Desktop/1223/work/iron-gym/src/store/ --include="*.tsx" --include="*.ts" | grep -i "$ARGUMENTS"
```

Expected pattern:
```typescript
const { isPremiumActive } = useSubscriptionStore();
if (!isPremiumActive()) {
  setShowPaywall(true);
  return;
}
```

**Flag if:** no paywall check before the premium action button press.

### Layer 3 — Subscription Store State

The store must expose the subscription status correctly so Layer 2 can check it.

```bash
grep -n "isPremiumActive\|subscription\|status.*active\|active.*status" C:/Users/sevka/Desktop/1223/work/iron-gym/src/store/useSubscriptionStore.ts
```

Verify:
- `isPremiumActive()` returns true ONLY when status = 'active' AND expiry is in the future
- Status is hydrated from server on login and after purchase
- Status resets to false on logout

**Flag if:** `isPremiumActive()` can return true for expired or cancelled subscriptions.

### Layer 4 — Paywall Trigger UX

When the user hits the gate, show a Paywall that clearly explains what they're missing and how to subscribe.

```bash
grep -rn "PaywallModal\|paywall" C:/Users/sevka/Desktop/1223/work/iron-gym/src/screens/ --include="*.tsx" | grep -i "$ARGUMENTS"
```

Expected: `PaywallModal` imported and rendered conditionally with `visible={showPaywall}`.

**Flag if:** gate shows a generic Alert instead of the PaywallModal (lost conversion opportunity).

### Layer 5 — Test Coverage

Both server (402 response) and client (paywall shown) must have tests.

```bash
# Server test: 402 on unauthenticated or non-premium user
grep -rn "402\|requiresSubscription\|требует" C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/__tests__/ --include="*.ts"

# Client test: paywall shows when isPremiumActive returns false
grep -rn "isPremiumActive\|paywall\|showPaywall" C:/Users/sevka/Desktop/1223/work/iron-gym/src/__tests__/ --include="*.ts"
```

**Flag if:** no test verifies the 402 path OR no test verifies paywall renders.

## Report

```
PREMIUM FEATURE AUDIT: $ARGUMENTS
─────────────────────────────────
Layer 1 — Server gate:     [PRESENT at file:line / MISSING]
Layer 2 — Client UX gate:  [PRESENT at file:line / MISSING]
Layer 3 — Store state:     [CORRECT / STALE EXPIRY CHECK]
Layer 4 — Paywall UX:      [PRESENT / USES ALERT (needs PaywallModal)]
Layer 5 — Test coverage:   [PASS — X tests / MISSING server test / MISSING client test]

Status: COMPLETE / INCOMPLETE — X layers missing

Missing layers to implement:
[specific file:line changes for each missing layer]
```

## Implementation Template

If layers are missing, implement in this order (never skip one):

1. **Server first** — call `getSubStatus(req.userId!)` and return 402 if not `isPro` (see Layer 1 pattern above)
2. **Test the 402** — write a server integration test that hits the endpoint without subscription
3. **Store check** — verify `isPremiumActive()` covers this plan tier
4. **Client gate** — add `if (!isPremiumActive()) { setShowPaywall(true); return; }` before action
5. **PaywallModal** — import and render `<PaywallModal visible={showPaywall} onClose={() => setShowPaywall(false)} />`
