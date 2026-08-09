/**
 * Numeric honesty guard: does a reply's claim about the user's data actually
 * exist in the КЛЮЧЕВЫЕ ЧИСЛА block that was sent?
 *
 * The guard is log-only, so the tests focus on the two error modes that make
 * a log-only guard useless: missing a real hallucination (false negative on
 * the exact case it was built for) and crying wolf on ordinary coaching
 * advice (ranges, recommendations, generic numbers).
 */

import {
  extractClaims,
  extractCanonicalNumbers,
  findNumericMismatches,
} from '../ai/numericGuard';

const CONTEXT = `
## КЛЮЧЕВЫЕ ЧИСЛА (цитируй цифры о пользователе ТОЛЬКО отсюда)
- Вес: 92.5 кг (09.08)
- Сегодня съедено: 1850 ккал, белка 118 г
- Шагов сегодня: 7200
- Цель калорий: 2100 ккал

## ДРУГОЙ БЛОК
- Тут число 555 которое не канон
`;

describe('extractCanonicalNumbers', () => {
  test('берёт числа только из блока КЛЮЧЕВЫЕ ЧИСЛА', () => {
    const nums = extractCanonicalNumbers(CONTEXT);
    expect(nums).toEqual(expect.arrayContaining([92.5, 1850, 118, 7200, 2100]));
    expect(nums).not.toContain(555);
  });

  test('нет блока → пусто', () => {
    expect(extractCanonicalNumbers('## ЧТО-ТО ДРУГОЕ\n123')).toEqual([]);
  });
});

describe('extractClaims', () => {
  test('«ты съел 1850 ккал» — это заявление о данных', () => {
    const claims = extractClaims('Сегодня ты съел 1850 ккал и 118 г белка.');
    expect(claims.map((c) => c.value)).toEqual([1850, 118]);
  });

  test('общая рекомендация без «ты/сегодня» — не заявление', () => {
    const claims = extractClaims('Для набора обычно нужно 2500 ккал и 150 г белка в день.');
    expect(claims).toEqual([]);
  });

  test('диапазон «1800-2000 ккал» — рекомендация, не данные', () => {
    const claims = extractClaims('Сегодня тебе стоит держаться в 1800-2000 ккал.');
    expect(claims).toEqual([]);
  });

  test('вес и шаги распознаются', () => {
    const claims = extractClaims('Ты весишь 92.5 кг, и сегодня прошёл 7200 шагов.');
    expect(claims.map((c) => c.unit).sort()).toEqual(['kcal', 'kg', 'steps'].filter((u) => u !== 'kcal').sort());
    expect(claims.map((c) => c.value)).toEqual(expect.arrayContaining([92.5, 7200]));
  });
});

describe('findNumericMismatches', () => {
  test('честный ответ с числами из блока → пусто', () => {
    const reply = 'Сегодня ты съел 1850 ккал (из цели 2100 ккал) и набрал 118 г белка. Ты весишь 92.5 кг.';
    expect(findNumericMismatches(reply, CONTEXT)).toEqual([]);
  });

  test('выдуманные калории ловятся', () => {
    const reply = 'Сегодня ты съел 2340 ккал — многовато.';
    const miss = findNumericMismatches(reply, CONTEXT);
    expect(miss).toHaveLength(1);
    expect(miss[0].value).toBe(2340);
    expect(miss[0].unit).toBe('kcal');
  });

  test('округление в пределах 2% прощается', () => {
    const reply = 'Сегодня ты съел примерно 1860 ккал.';
    expect(findNumericMismatches(reply, CONTEXT)).toEqual([]);
  });

  test('без канонического блока страж молчит (не на чем судить)', () => {
    const reply = 'Сегодня ты съел 9999 ккал.';
    expect(findNumericMismatches(reply, 'нет блока')).toEqual([]);
  });

  test('рекомендация в том же ответе не флагается, а выдумка — флагается', () => {
    const reply = 'Сегодня ты прошёл 12500 шагов. Обычно советуют 8000-10000 шагов в день.';
    const miss = findNumericMismatches(reply, CONTEXT);
    expect(miss).toHaveLength(1);
    expect(miss[0].value).toBe(12500);
  });
});
