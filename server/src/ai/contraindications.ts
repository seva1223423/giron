/**
 * Injury → exercise contraindication engine.
 *
 * The prompt-level substitution blocks tell the model what to swap, but
 * nothing verified what the model actually WROTE into a program: a user with
 * a documented knee restriction could still receive «Приседания со штангой»
 * and the tool result would read as pure success. These rules run inside the
 * create_program / create_workout executors and append an explicit warning to
 * the tool result whenever a written exercise conflicts with a stored
 * HealthRestriction — the model then has to address it in its reply instead
 * of silently shipping the conflict.
 *
 * Matching is deliberately substring-based and lowercase: bodyPart is
 * free-form user text («правое колено», «Грыжа L5-S1», «коленный сустав»),
 * so exact-key lookups miss most real rows.
 *
 * This is a safety NET, not a hard block: rehab work with light loads is a
 * legitimate reason to keep a flagged exercise, and that decision belongs to
 * the model + user, not a string matcher.
 */

export interface InjuryZoneRule {
  /** Human label used in the warning text. */
  zone: string;
  /** Lowercase substrings matched against bodyPart + description of a restriction. */
  patterns: string[];
  /** Lowercase substrings matched against exercise names written by the model. */
  avoid: string[];
  /** One-line safer-replacement hint for the warning. */
  safer: string;
}

export const INJURY_ZONE_RULES: InjuryZoneRule[] = [
  {
    zone: 'колено',
    patterns: ['колен', 'мениск', 'пкс ', 'надколенник', 'хондромаляц'],
    avoid: ['присед', 'выпад', 'запрыгив', 'прыжк', 'разгибание ног', 'разгибания ног'],
    safer: 'жим ногами с укороченной амплитудой, ягодичный мост, сгибания ног лёжа',
  },
  {
    zone: 'поясница',
    patterns: ['поясниц', 'грыж', 'протруз', 'позвоночник', 'радикулит', 'люмбаго', 'спондил', 'спина', 'спине'],
    avoid: ['станов', 'наклон', 'гудморнинг', 'good morning', 'приседания со штангой'],
    safer: 'тяга в тренажёре с упором груди, жим ногами, гиперэкстензия без веса, планка',
  },
  {
    zone: 'плечо',
    patterns: ['плеч', 'ротаторн', 'вращательн', 'манжет', 'импинджмент', 'акромиа'],
    avoid: ['жим из-за головы', 'за голову', 'тяга к подбородку', 'жим штанги стоя', 'армейск'],
    safer: 'жим гантелей сидя нейтральным хватом, лицевая тяга, махи в наклоне',
  },
  {
    zone: 'локоть',
    patterns: ['локт', 'локоть', 'эпикондилит'],
    avoid: ['французск', 'жим узким хватом', 'разгибание из-за головы'],
    safer: 'разгибания на блоке с канатом, молотковые сгибания',
  },
  {
    zone: 'запястье',
    patterns: ['запяст', 'кист', 'туннельн', 'карпальн'],
    avoid: ['подъём штанги на бицепс', 'подъем штанги на бицепс', 'французск'],
    safer: 'сгибания с гантелями/EZ-грифом нейтральным хватом, отжимания на рукоятях',
  },
  {
    zone: 'шея',
    patterns: ['шея', 'шее', 'шеи', 'шейн'],
    avoid: ['жим из-за головы', 'за голову', 'шраги'],
    safer: 'упражнения с нейтральным положением головы, изометрия шеи',
  },
];

export interface RestrictionLike {
  bodyPart?: string | null;
  description?: string | null;
}

/** Which injury zones the user's stored restrictions actually describe. */
export function matchInjuryZones(restrictions: RestrictionLike[]): InjuryZoneRule[] {
  if (!restrictions || restrictions.length === 0) return [];
  const matched: InjuryZoneRule[] = [];
  for (const rule of INJURY_ZONE_RULES) {
    const hit = restrictions.some((r) => {
      const text = `${r.bodyPart ?? ''} ${r.description ?? ''}`.toLowerCase();
      return rule.patterns.some((p) => text.includes(p));
    });
    if (hit) matched.push(rule);
  }
  return matched;
}

export interface ContraindicationHit {
  exercise: string;
  zone: string;
  safer: string;
}

/** Which of the written exercise names conflict with the matched zones. */
export function findContraindicated(
  exerciseNames: string[],
  zones: InjuryZoneRule[],
): ContraindicationHit[] {
  if (zones.length === 0) return [];
  const flagged: ContraindicationHit[] = [];
  for (const name of exerciseNames) {
    const lower = name.toLowerCase();
    for (const rule of zones) {
      if (rule.avoid.some((a) => lower.includes(a))) {
        flagged.push({ exercise: name, zone: rule.zone, safer: rule.safer });
        break; // one warning per exercise is enough
      }
    }
  }
  return flagged;
}

/**
 * Warning appended to the tool result. Empty string when nothing is flagged,
 * so call sites can concatenate unconditionally.
 */
export function buildInjuryWarning(flagged: ContraindicationHit[]): string {
  if (flagged.length === 0) return '';
  const items = flagged
    .map((f) => `«${f.exercise}» — конфликт с ограничением «${f.zone}» (безопаснее: ${f.safer})`)
    .join('; ');
  return (
    `\n\n⚠️ ПРОВЕРКА ПО ТРАВМАМ: ${items}. ` +
    `ОБЯЗАТЕЛЬНО скажи об этом пользователю: предложи замену или объясни, почему упражнение оставлено (например, реабилитация с лёгким весом).`
  );
}
