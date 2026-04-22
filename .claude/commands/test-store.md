---
description: Scaffold a Zustand store test file in Iron Gym. Argument: "useStoreName" — e.g. "useSleepStore". Reads the store, identifies service dependencies, writes a complete test file with all required mock patterns, runs it, and verifies green.
---

You are scaffolding a Zustand store test file for Iron Gym. Argument: **$ARGUMENTS**

Parse the store name from `$ARGUMENTS` (e.g. `useSleepStore`). Infer the file path: `src/store/<storeName>.ts`.

## Step 1 — Check if Test Already Exists

```bash
ls C:/Users/sevka/Desktop/1223/work/iron-gym/src/__tests__/$ARGUMENTS.test.ts 2>/dev/null && echo "EXISTS" || echo "NOT_FOUND"
```

If EXISTS — stop and report what's already there. Do not overwrite.

## Step 2 — Read the Store

```bash
cat C:/Users/sevka/Desktop/1223/work/iron-gym/src/store/$ARGUMENTS.ts
```

Extract:
- State fields (all keys from the interface)
- Actions/methods (async and sync)
- Service import path + method names called
- Which actions are optimistic (optimistic add/remove with rollback)
- Whether there's a `local-` prefix pattern for offline IDs
- Whether there's `syncFromServer` or similar fetch method
- Whether there's `clearUserData` for logout cleanup

## Step 3 — Read the Service (if any)

```bash
# Find the service file the store imports
grep -n "import.*from.*services" C:/Users/sevka/Desktop/1223/work/iron-gym/src/store/$ARGUMENTS.ts | head -5
```

```bash
cat C:/Users/sevka/Desktop/1223/work/iron-gym/src/services/<inferredService>.ts 2>/dev/null | head -80
```

Extract all method names that need to be mocked.

## Step 4 — Write the Test File

**MANDATORY MOCK ORDER — violating this causes silent failures:**

1. `jest.mock('@react-native-async-storage/async-storage', ...)` — ALWAYS FIRST
2. `jest.mock('../services/<featureService>', ...)` — BEFORE any store import
3. NEVER use variables defined before `jest.mock()` inside the mock factory — Jest hoists `jest.mock()` above `const` declarations; those variables are `undefined` inside the factory
4. Instead: use inline `jest.fn()` inside the factory, then get typed references AFTER the import
5. In `beforeEach`: reset store with `setState` FIRST, then `jest.clearAllMocks()`, then re-mock fallback returns
6. `jest.clearAllMocks()` wipes `mockResolvedValue` set in the factory — re-mock defaults in `beforeEach`

```typescript
/**
 * Tests for $ARGUMENTS — [describe what the store manages]
 */

// ALWAYS FIRST — AsyncStorage mock must precede everything
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

// Mock service BEFORE importing the store
jest.mock('../services/<featureService>', () => ({
  <featureService>: {
    create: jest.fn(),              // filled in beforeEach
    delete: jest.fn(() => Promise.resolve()),
    getAll: jest.fn(() => Promise.resolve([])),
    // add all methods the store calls
  },
}));

// Imports AFTER all mocks
import { $ARGUMENTS } from '../store/$ARGUMENTS';
import { <featureService> } from '../services/<featureService>';

// Typed references AFTER import — hoisting makes pre-mock variables undefined
const mockCreate = <featureService>.create as jest.Mock;
const mockDelete = <featureService>.delete as jest.Mock;
const mockGetAll = <featureService>.getAll as jest.Mock;

// Test data factory
const makeItem = (overrides: Partial<ItemType> = {}): ItemType => ({
  id: 'item-001',
  userId: 'u-test',
  // ... all required fields with sensible defaults
  ...overrides,
});

beforeEach(() => {
  // 1. Reset store state — prevents test bleed
  $ARGUMENTS.setState({ items: [], isLoading: false });
  // 2. Clear all mock call history + implementations
  jest.clearAllMocks();
  // 3. Re-apply default returns (clearAllMocks wiped them from factory)
  mockCreate.mockResolvedValue(makeItem());
  mockDelete.mockResolvedValue(undefined);
  mockGetAll.mockResolvedValue([]);
});

// ─── add<Item> / create ───────────────────────────────────────────────────────

describe('add<Item>', () => {
  test('adds server-returned item to state on success', async () => {
    await $ARGUMENTS.getState().addItem({ /* required fields */ });

    expect($ARGUMENTS.getState().items).toHaveLength(1);
    expect($ARGUMENTS.getState().items[0].id).toBe('item-001');
  });

  // Include this test only if the store has offline fallback (local- prefix)
  test('falls back to local storage on network error (non-4xx)', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Network timeout'));

    await $ARGUMENTS.getState().addItem({ /* required fields */ });

    const items = $ARGUMENTS.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].id).toMatch(/^local-/);
  });

  // Include this test if store rethrows 4xx (validation errors)
  test('rethrows 4xx validation errors (no local fallback)', async () => {
    const err400 = { response: { status: 400 } };
    mockCreate.mockRejectedValueOnce(err400);

    await expect(
      $ARGUMENTS.getState().addItem({ /* invalid data */ })
    ).rejects.toEqual(err400);

    expect($ARGUMENTS.getState().items).toHaveLength(0);
  });

  test('prepends item to front of list (most recent first)', async () => {
    $ARGUMENTS.setState({ items: [makeItem({ id: 'old-001' })] });

    await $ARGUMENTS.getState().addItem({ /* required fields */ });

    const items = $ARGUMENTS.getState().items;
    expect(items[0].id).toBe('item-001'); // new first
    expect(items[1].id).toBe('old-001');
  });
});

// ─── remove<Item> ────────────────────────────────────────────────────────────

describe('remove<Item>', () => {
  test('removes from state immediately (optimistic)', async () => {
    $ARGUMENTS.setState({ items: [makeItem()] });

    $ARGUMENTS.getState().removeItem('item-001');

    expect($ARGUMENTS.getState().items).toHaveLength(0);
  });

  test('calls delete for server-persisted ids', async () => {
    $ARGUMENTS.setState({ items: [makeItem({ id: 'item-001' })] });

    await $ARGUMENTS.getState().removeItem('item-001');
    await Promise.resolve(); // flush microtasks

    expect(mockDelete).toHaveBeenCalledWith('item-001');
  });

  // Include only if store uses local- prefix for offline items
  test('does NOT call delete for local- prefixed ids', async () => {
    $ARGUMENTS.setState({ items: [makeItem({ id: 'local-1234567890' })] });

    $ARGUMENTS.getState().removeItem('local-1234567890');
    await Promise.resolve();

    expect(mockDelete).not.toHaveBeenCalled();
  });

  test('restores item if server delete fails (non-404)', async () => {
    const err500 = { response: { status: 500 } };
    mockDelete.mockRejectedValueOnce(err500);

    $ARGUMENTS.setState({ items: [makeItem()] });
    $ARGUMENTS.getState().removeItem('item-001');
    expect($ARGUMENTS.getState().items).toHaveLength(0); // optimistic

    await Promise.resolve();
    await Promise.resolve(); // two ticks to let rejection propagate

    expect($ARGUMENTS.getState().items).toHaveLength(1); // restored
  });

  test('does NOT restore if server returns 404 (already deleted)', async () => {
    const err404 = { response: { status: 404 } };
    mockDelete.mockRejectedValueOnce(err404);

    $ARGUMENTS.setState({ items: [makeItem()] });
    $ARGUMENTS.getState().removeItem('item-001');

    await Promise.resolve();
    await Promise.resolve();

    expect($ARGUMENTS.getState().items).toHaveLength(0); // deletion stands
  });
});

// ─── syncFromServer / fetch ───────────────────────────────────────────────────

describe('syncFromServer', () => {
  test('replaces state with server data', async () => {
    const serverItems = [makeItem({ id: 'server-1' }), makeItem({ id: 'server-2' })];
    mockGetAll.mockResolvedValueOnce(serverItems);

    await $ARGUMENTS.getState().syncFromServer();

    const items = $ARGUMENTS.getState().items;
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.id)).toContain('server-1');
  });

  // Include only if store preserves local- items during sync
  test('preserves local- items not yet on server', async () => {
    $ARGUMENTS.setState({
      items: [
        makeItem({ id: 'local-pending' }),
        makeItem({ id: 'server-old' }),
      ],
    });

    mockGetAll.mockResolvedValueOnce([makeItem({ id: 'server-new' })]);

    await $ARGUMENTS.getState().syncFromServer();

    const ids = $ARGUMENTS.getState().items.map((i) => i.id);
    expect(ids).toContain('local-pending');  // kept
    expect(ids).toContain('server-new');     // from server
    expect(ids).not.toContain('server-old'); // replaced
  });

  test('keeps local data unchanged if server call fails', async () => {
    $ARGUMENTS.setState({ items: [makeItem({ id: 'local-1' })] });
    mockGetAll.mockRejectedValueOnce(new Error('Network error'));

    await $ARGUMENTS.getState().syncFromServer();

    expect($ARGUMENTS.getState().items).toHaveLength(1);
    expect($ARGUMENTS.getState().items[0].id).toBe('local-1');
  });
});

// ─── clearUserData ────────────────────────────────────────────────────────────

describe('clearUserData', () => {
  test('removes all items', () => {
    $ARGUMENTS.setState({
      items: [makeItem({ id: 'i-1' }), makeItem({ id: 'i-2' })],
    });

    $ARGUMENTS.getState().clearUserData();

    expect($ARGUMENTS.getState().items).toHaveLength(0);
  });
});
```

Adapt the template to match the store's actual method names and types.

## Step 5 — Run the Tests

```bash
cd C:/Users/sevka/Desktop/1223/work/iron-gym && npx jest $ARGUMENTS --no-coverage --forceExit 2>&1
```

All tests must pass before reporting done. If any fail, fix them.

## Step 6 — Update Baseline

After all tests pass, update the baseline count in CLAUDE.md and `.claude/agents/tests.md`:
- Increment client suite count (was 29, now 30)
- Increment test count (was 512, add new count)
- Add file entry to the `src/__tests__/` list in `tests.md`

## Step 7 — Report

```
STORE TEST CREATED:
- File: src/__tests__/$ARGUMENTS.test.ts
- Tests: X across Y describe blocks
- Coverage: [list of actions/edge cases covered]
- Baseline: [new client suite count] suites, [new test count] tests
- Test output: X passed, 0 failed
```
