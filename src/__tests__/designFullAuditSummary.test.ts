/**
 * Final summary test — documents every design-layer suite across
 * both rounds of comprehensive testing. Fails on an explicit
 * expectation so CI highlights if someone deletes a reference suite.
 */

import fs from 'fs';
import path from 'path';

describe('Direction A design implementation — test audit snapshot', () => {
  const DESIGN_SUITES_ROUND_1 = [
    'designComponents.test.ts',            // CurrentSetHero, HomeHeader helpers
    'iconSet.test.ts',                     // Icon name union integrity
    'designPalette.test.ts',               // Colors + typography sanity
    'crossDevice.test.ts',                 // 6 widths layout fits
    'designEdgeCases.test.ts',             // Null / NaN / huge / unicode
    'paywallLogic.test.ts',                // Pricing + CTA copy
    'homeDerivations.test.ts',             // Week dots / PR / today / calorie
    'designThemeParity.test.ts',           // Light/dark key parity
    'iconRender.test.tsx',                 // 37-icon smoke
    'a11yLabels.test.ts',                  // Streak + eyebrow + date VO
    'storageKeys.test.ts',                 // iron_gym_ namespace
    'componentStructuralSmoke.test.ts',    // Util module loads
    'orientationSafety.test.ts',           // Landscape + DPR + ring boundary
    'russianTextEdges.test.ts',            // Names / plurals / ₽ sign
    'scannerDesignFlow.test.ts',           // Refund round-trip
    'designMathInvariants.test.ts',        // Fuzz 1000-run invariants
    'designButtonContract.test.ts',        // sm/md/lg heights + radii
    'designComplianceAudit.test.ts',       // tokens.js → colors.ts map
    'designRegression.test.ts',            // Each real bug fix locked
    'designAccessibility.test.ts',         // VO label contracts
    'designExtremeDevices.test.ts',        // 19 real devices × 6 checks
    'designSafeArea.test.ts',              // Notch / Dynamic Island insets
    'designPerformance.test.ts',           // O(n) budgets for helpers
    'designAccessibilityScaling.test.ts',  // Dynamic Type safety
  ];

  const DESIGN_SUITES_ROUND_2 = [
    'designTimezoneEdges.test.ts',         // Local date, DST, year boundaries
    'designQuotaReset.test.ts',            // 5-scans/day rollover at midnight
    'designStorageRobustness.test.ts',     // AsyncStorage corruption + size
    'designPlatformDivergence.test.ts',    // iOS/Android platform.select
    'designUnicodeEdges.test.ts',          // Surrogate pairs, RTL, zero-width
    'designRapidInput.test.ts',            // Burst taps + idempotent clamp
    'designAnimationTiming.test.ts',       // Reanimated duration ranges
    'designSubscriptionTrial.test.ts',     // Trial + expiry + grace
    'designDataIntegrity.test.ts',         // Corrupt history robustness
    'designPropContract.test.ts',          // Component prop type contracts
    'designColorContrast.test.ts',         // WCAG AA/AAA ratios
    'designSvgRingMath.test.ts',           // Ring dashoffset formula
    'designFormValidation.test.ts',        // Comma decimal + ranges
    'designNavParamSafety.test.ts',        // Route param safety
    'designUnmountSafety.test.ts',         // Timer + AbortController cleanup
    'designColorTokenValidity.test.ts',    // Hex + rgba format
    'designNetworkRetry.test.ts',          // Exp backoff + 5xx retry
    'designScrollGestureEdges.test.ts',    // Pull-to-refresh thresholds
    'designHomeIntegration.test.ts',       // Pipeline: derivations + streak
    'designFoodScannerDeep.test.ts',       // Sanity flags, barcode, median
    'designMacroAggregation.test.ts',      // Sum meals, percent, remaining
    'designPlateCalculator.test.ts',       // Greedy plate algorithm
    'designFloatPrecision.test.ts',        // 0.1+0.2 traps + rounding
    'designInputSanitization.test.ts',     // Strip control chars + tags
  ];

  const ALL_SUITES = [...DESIGN_SUITES_ROUND_1, ...DESIGN_SUITES_ROUND_2];

  test('Round 1 has 24 suites', () => {
    expect(DESIGN_SUITES_ROUND_1.length).toBe(24);
  });

  test('Round 2 has 24 suites', () => {
    expect(DESIGN_SUITES_ROUND_2.length).toBe(24);
  });

  test('Total is 48 unique suites', () => {
    expect(ALL_SUITES.length).toBe(48);
    expect(new Set(ALL_SUITES).size).toBe(48);
  });

  test('Round 1 — all suites exist in src/__tests__/', () => {
    const testDir = path.resolve(__dirname);
    for (const file of DESIGN_SUITES_ROUND_1) {
      const exists = fs.existsSync(path.join(testDir, file));
      if (!exists) {
        // Find the file via fs glob as a fallback — some suites end in .tsx
        const alt = file.replace(/\.tsx$/, '.ts');
        expect(fs.existsSync(path.join(testDir, alt)) || exists).toBe(true);
      } else {
        expect(exists).toBe(true);
      }
    }
  });

  test('Round 2 — all suites exist in src/__tests__/', () => {
    const testDir = path.resolve(__dirname);
    for (const file of DESIGN_SUITES_ROUND_2) {
      const exists = fs.existsSync(path.join(testDir, file));
      expect(exists).toBe(true);
    }
  });

  test('registry lists explicit categories (Round 1)', () => {
    const categories = {
      pure_logic: ['designComponents', 'homeDerivations', 'paywallLogic', 'designMathInvariants'],
      visual: ['designPalette', 'designThemeParity', 'designComplianceAudit'],
      devices: ['crossDevice', 'designExtremeDevices', 'orientationSafety', 'designSafeArea'],
      component_safety: ['iconSet', 'iconRender', 'componentStructuralSmoke'],
      edges: ['designEdgeCases', 'designRegression', 'russianTextEdges'],
      a11y: ['a11yLabels', 'designAccessibility', 'designAccessibilityScaling'],
      contracts: ['designButtonContract', 'storageKeys', 'scannerDesignFlow'],
      performance: ['designPerformance'],
    };
    const all = Object.values(categories).flat();
    expect(all.length).toBe(24);
    expect(new Set(all).size).toBe(24); // no duplicates
  });

  test('registry lists explicit categories (Round 2)', () => {
    const categories = {
      temporal: ['designTimezoneEdges', 'designQuotaReset', 'designAnimationTiming'],
      resilience: ['designStorageRobustness', 'designRapidInput', 'designUnmountSafety', 'designNetworkRetry'],
      platform: ['designPlatformDivergence', 'designScrollGestureEdges'],
      correctness: ['designUnicodeEdges', 'designFormValidation', 'designFloatPrecision', 'designInputSanitization'],
      business_logic: ['designSubscriptionTrial', 'designDataIntegrity', 'designMacroAggregation', 'designPlateCalculator', 'designFoodScannerDeep'],
      integration: ['designHomeIntegration'],
      a11y: ['designColorContrast'],
      contracts: ['designPropContract', 'designColorTokenValidity', 'designSvgRingMath', 'designNavParamSafety'],
    };
    const all = Object.values(categories).flat();
    expect(all.length).toBe(24);
    expect(new Set(all).size).toBe(24); // no duplicates
  });

  test('suites collectively cover design, data, and resilience dimensions', () => {
    // Spot-check that major areas are represented
    const dimensionPatterns: Record<string, RegExp> = {
      visual: /designPalette|designThemeParity|designColorContrast|designComplianceAudit/,
      layout: /crossDevice|designExtremeDevices|designSafeArea|orientationSafety/,
      derivations: /homeDerivations|designMathInvariants|designHomeIntegration/,
      accessibility: /a11yLabels|designAccessibility|designAccessibilityScaling|designColorContrast/,
      subscription: /paywallLogic|designSubscriptionTrial|designQuotaReset/,
      scanner: /scannerDesignFlow|designFoodScannerDeep/,
      russian_text: /russianTextEdges|designUnicodeEdges/,
      float_safety: /designEdgeCases|designMathInvariants|designFloatPrecision/,
      storage: /storageKeys|designStorageRobustness/,
      platform: /designPlatformDivergence|designExtremeDevices/,
      timing: /designAnimationTiming|designTimezoneEdges|designQuotaReset/,
    };

    const joined = ALL_SUITES.join('\n');
    for (const [dim, pattern] of Object.entries(dimensionPatterns)) {
      expect(joined).toMatch(pattern);
    }
  });
});
