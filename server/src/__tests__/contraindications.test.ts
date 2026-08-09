/**
 * Injury → exercise contraindication engine.
 *
 * The whole point of the module is surviving free-form bodyPart text, so the
 * cases here are written the way real rows look: «правое колено», «Грыжа
 * L5-S1», «коленный сустав» — not the tidy dictionary keys the old
 * substitution map expected.
 */

import {
  matchInjuryZones,
  findContraindicated,
  buildInjuryWarning,
  INJURY_ZONE_RULES,
} from '../ai/contraindications';

describe('matchInjuryZones', () => {
  test('пустые ограничения → пусто', () => {
    expect(matchInjuryZones([])).toEqual([]);
  });

  test('«правое колено» ловится по подстроке', () => {
    const zones = matchInjuryZones([{ bodyPart: 'правое колено', description: '' }]);
    expect(zones.map((z) => z.zone)).toEqual(['колено']);
  });

  test('«коленный сустав» — тоже колено', () => {
    const zones = matchInjuryZones([{ bodyPart: 'коленный сустав', description: 'болит при сгибании' }]);
    expect(zones.map((z) => z.zone)).toEqual(['колено']);
  });

  test('«Грыжа L5-S1» в описании → поясница', () => {
    const zones = matchInjuryZones([{ bodyPart: 'спина', description: 'Грыжа L5-S1, без осевых' }]);
    expect(zones.map((z) => z.zone)).toContain('поясница');
  });

  test('травма только в description при пустом bodyPart', () => {
    const zones = matchInjuryZones([{ bodyPart: null, description: 'импинджмент правого плеча' }]);
    expect(zones.map((z) => z.zone)).toEqual(['плечо']);
  });

  test('несколько ограничений → несколько зон, без дублей', () => {
    const zones = matchInjuryZones([
      { bodyPart: 'колено', description: '' },
      { bodyPart: 'левое колено', description: 'мениск' },
      { bodyPart: 'запястье', description: 'туннельный синдром' },
    ]);
    expect(zones.map((z) => z.zone).sort()).toEqual(['запястье', 'колено']);
  });

  test('эпикондилит → локоть', () => {
    const zones = matchInjuryZones([{ bodyPart: 'рука', description: 'эпикондилит (теннисный локоть)' }]);
    expect(zones.map((z) => z.zone)).toEqual(['локоть']);
  });

  test('шейный отдел → шея', () => {
    const zones = matchInjuryZones([{ bodyPart: 'шейный отдел', description: '' }]);
    expect(zones.map((z) => z.zone)).toEqual(['шея']);
  });

  test('нерелевантное ограничение не даёт зон', () => {
    expect(matchInjuryZones([{ bodyPart: 'аллергия', description: 'на арахис' }])).toEqual([]);
  });
});

describe('findContraindicated', () => {
  const knee = matchInjuryZones([{ bodyPart: 'колено', description: '' }]);
  const back = matchInjuryZones([{ bodyPart: 'поясница', description: 'протрузия' }]);

  test('без зон ничего не флагается', () => {
    expect(findContraindicated(['Приседания со штангой'], [])).toEqual([]);
  });

  test('присед при колене флагается', () => {
    const flagged = findContraindicated(['Приседания со штангой', 'Жим лёжа'], knee);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].exercise).toBe('Приседания со штангой');
    expect(flagged[0].zone).toBe('колено');
    expect(flagged[0].safer).toContain('жим ногами');
  });

  test('выпады и разгибания ног при колене тоже', () => {
    const flagged = findContraindicated(['Болгарские выпады', 'Разгибание ног в тренажёре'], knee);
    expect(flagged.map((f) => f.exercise)).toEqual(['Болгарские выпады', 'Разгибание ног в тренажёре']);
  });

  test('становая и тяга в наклоне при пояснице', () => {
    const flagged = findContraindicated(
      ['Становая тяга', 'Тяга штанги в наклоне', 'Жим гантелей сидя'],
      back,
    );
    expect(flagged.map((f) => f.exercise)).toEqual(['Становая тяга', 'Тяга штанги в наклоне']);
  });

  test('регистр имени упражнения не важен', () => {
    const flagged = findContraindicated(['СТАНОВАЯ ТЯГА СУМО'], back);
    expect(flagged).toHaveLength(1);
  });

  test('безопасные упражнения не флагаются при любых зонах', () => {
    const allZones = INJURY_ZONE_RULES;
    const flagged = findContraindicated(
      ['Жим ногами', 'Сгибание ног лёжа', 'Лицевая тяга', 'Молотковые сгибания'],
      allZones,
    );
    expect(flagged).toEqual([]);
  });

  test('одно упражнение флагается один раз даже при двух зонах', () => {
    const zones = matchInjuryZones([
      { bodyPart: 'плечо', description: '' },
      { bodyPart: 'шея', description: '' },
    ]);
    const flagged = findContraindicated(['Жим из-за головы'], zones);
    expect(flagged).toHaveLength(1);
  });
});

describe('buildInjuryWarning', () => {
  test('пусто → пустая строка (конкатенация безопасна)', () => {
    expect(buildInjuryWarning([])).toBe('');
  });

  test('варнинг называет упражнение, зону и замену, и требует сказать пользователю', () => {
    const knee = matchInjuryZones([{ bodyPart: 'колено', description: '' }]);
    const flagged = findContraindicated(['Приседания со штангой'], knee);
    const warning = buildInjuryWarning(flagged);
    expect(warning).toContain('Приседания со штангой');
    expect(warning).toContain('колено');
    expect(warning).toContain('жим ногами');
    expect(warning).toContain('скажи об этом пользователю');
  });
});
