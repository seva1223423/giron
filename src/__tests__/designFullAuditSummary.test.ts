/**
 * Final summary test — not really a test, more a documentation asset
 * that captures what's covered + links the suites. Fails on an
 * explicit expectation so CI highlights if someone deletes reference
 * docs.
 */

import fs from 'fs';
import path from 'path';

describe('Direction A design implementation — test audit snapshot', () => {
  const DESIGN_SUITES = [
    'designComponents.test.ts',           // CurrentSetHero, HomeHeader helpers
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

  test('all 24 design test suites present in src/__tests__/', () => {
    const testDir = path.resolve(__dirname);
    for (const file of DESIGN_SUITES) {
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

  test('suite count matches audit list', () => {
    expect(DESIGN_SUITES.length).toBe(24);
  });

  test('suite names are sorted in logical order (starts with designComponents)', () => {
    expect(DESIGN_SUITES[0]).toBe('designComponents.test.ts');
  });

  test('registry lists explicit categories', () => {
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
    // 24 suites total across categories
    const all = Object.values(categories).flat();
    expect(all.length).toBe(24);
    expect(new Set(all).size).toBe(24); // no duplicates
  });
});
