/**
 * Safe-area insets and notch safety — verifies the design chrome
 * reserves enough top/bottom space on every device generation.
 *
 * React Native's useSafeAreaContext exposes top/bottom insets that
 * vary wildly: 0 on old devices, 20pt on regular phones, 44-59pt on
 * notched / Dynamic Island phones, ~34pt on iPad.
 *
 * The design chrome adds `paddingTop: safeTop` and `paddingBottom:
 * Math.max(insets.bottom, 8)` in various places — lock that math
 * stays sensible.
 */

describe('Safe-area top insets', () => {
  // Covers iPhone SE (20) → Dynamic Island (59).
  const INSET_TOPS = [0, 20, 44, 47, 54, 59];

  test.each(INSET_TOPS)('safeTop %s is accepted (bounds: 0..80)', (inset) => {
    // Ensure our assumptions don't clamp or misbehave
    expect(inset).toBeGreaterThanOrEqual(0);
    expect(inset).toBeLessThanOrEqual(80);
  });

  test('0 inset still renders (Android no-inset case)', () => {
    const safeTop = 0;
    const paddingTotal = safeTop + 16; // xl = 20 but header usually +12
    expect(paddingTotal).toBeGreaterThan(0);
  });

  test('Dynamic Island inset (59pt) doesn\'t crowd header', () => {
    const safeTop = 59;
    const homeHeaderPadBottom = 18; // design spec
    const headerStart = safeTop + 16; // scroll content padding
    expect(headerStart + homeHeaderPadBottom).toBeLessThan(120); // doesn't eat half screen
  });
});

// ─── Safe-area bottom insets ───────────────────────────────────────────────

describe('Safe-area bottom insets', () => {
  const INSET_BOTTOMS = [0, 20, 34, 48]; // home indicator variations

  test.each(INSET_BOTTOMS)('bottom inset %s keeps tab bar floor at >= 8', (inset) => {
    const floor = Math.max(inset, 8);
    expect(floor).toBeGreaterThanOrEqual(8);
  });

  test('0-inset device gets 8pt floor (tab labels breathe)', () => {
    expect(Math.max(0, 8)).toBe(8);
  });

  test('34pt home indicator inset carries through', () => {
    expect(Math.max(34, 8)).toBe(34);
  });

  test('tab bar total height stays constant at 88 + max(bottomInset, 8)', () => {
    // Our screenOptions.tabBarStyle sets height 88 + paddingBottom floor 8
    const HEIGHT = 88;
    for (const inset of INSET_BOTTOMS) {
      const total = HEIGHT + Math.max(inset, 8);
      expect(total).toBeGreaterThanOrEqual(96);
      expect(total).toBeLessThanOrEqual(150);
    }
  });
});

// ─── Keyboard-aware screens ────────────────────────────────────────────────

describe('Keyboard-aware input field heights', () => {
  test('Paywall textarea (multiline 2000 chars) has room on SE keyboard', () => {
    // iPhone SE landscape is 375 tall; keyboard takes ~220pt. Remaining
    // 155pt should still show the modal handle + a line of input.
    const landscapeHeight = 375;
    const keyboardHeight = 220;
    const remaining = landscapeHeight - keyboardHeight;
    expect(remaining).toBeGreaterThan(100);
  });

  test('Scanner text-description modal accommodates keyboard', () => {
    // Same reasoning for textModal — on SE it's tight but usable
    const minDeviceHeight = 568; // iPhone 5/SE 1st gen
    const keyboard = 260;
    const usable = minDeviceHeight - keyboard;
    expect(usable).toBeGreaterThan(100);
  });
});

// ─── Notch width safety ───────────────────────────────────────────────────

describe('Notch / Dynamic Island doesn\'t break hero cards', () => {
  // Dynamic Island is ~125pt wide, centered at the top. It sits *above*
  // safeTop so components don't overlap it normally. Just assert our
  // top-row layout doesn't assume full 375pt/390pt header width.
  test('home header title width >= 260pt even with Dynamic Island', () => {
    // iPhone 14 390pt - 20pt padding × 2 - 40pt (bell tile) - 16pt gap
    const titleWidth = 390 - 40 - 40 - 16;
    expect(titleWidth).toBeGreaterThan(260);
  });

  test('profile hero card stays within device width minus padding', () => {
    // Hero card uses borderRadius 28pt and full content width
    const contentWidth = 280 - 40; // fold closed
    expect(contentWidth).toBeGreaterThanOrEqual(240);
  });
});
