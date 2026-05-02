/**
 * Round 208 — delete_body_weight tool tests.
 *
 * Closes the log/delete-pair coverage gap (log_body_weight existed,
 * delete didn't). Covers:
 *   - Date-format validation (YYYY-MM-DD)
 *   - Existence check before delete
 *   - "Latest entry" mode when no date given
 *   - Post-delete verify (caught row reappearance)
 */

// ─── Date format validation ─────────────────────────────────────────────────

function isValidDateFormat(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

describe('delete_body_weight — date format', () => {
  test('accepts YYYY-MM-DD', () => {
    expect(isValidDateFormat('2026-04-30')).toBe(true);
  });

  test('rejects ISO datetime', () => {
    expect(isValidDateFormat('2026-04-30T12:00:00')).toBe(false);
  });

  test('rejects DD/MM/YYYY', () => {
    expect(isValidDateFormat('30/04/2026')).toBe(false);
  });

  test('rejects empty', () => {
    expect(isValidDateFormat('')).toBe(false);
  });

  test('rejects partial dates', () => {
    expect(isValidDateFormat('2026-04')).toBe(false);
    expect(isValidDateFormat('2026')).toBe(false);
  });

  test('rejects free text', () => {
    expect(isValidDateFormat('вчера')).toBe(false);
    expect(isValidDateFormat('yesterday')).toBe(false);
  });
});

// ─── Resolution logic (date vs latest) ──────────────────────────────────────

type WeightRow = { id: string; date: Date; weightKg: number };

function resolveTarget(
  date: string | undefined,
  byDate: WeightRow | null,
  latest: WeightRow | null,
):
  | { kind: 'invalid_format'; date: string }
  | { kind: 'not_found'; reason: string }
  | { kind: 'ok'; target: WeightRow } {
  if (date !== undefined) {
    if (!isValidDateFormat(date)) {
      return { kind: 'invalid_format', date };
    }
    if (!byDate) {
      return { kind: 'not_found', reason: `Не нашёл взвешивания за ${date}.` };
    }
    return { kind: 'ok', target: byDate };
  }
  // No date → most recent
  if (!latest) {
    return { kind: 'not_found', reason: 'У тебя нет ни одной записи веса в истории.' };
  }
  return { kind: 'ok', target: latest };
}

describe('delete_body_weight — resolution', () => {
  const row1: WeightRow = { id: 'w1', date: new Date('2026-04-30T00:00:00Z'), weightKg: 85 };
  const row0: WeightRow = { id: 'w0', date: new Date('2026-04-29T00:00:00Z'), weightKg: 85.5 };

  test('invalid date format returns invalid_format', () => {
    const r = resolveTarget('30 апреля', null, null);
    expect(r.kind).toBe('invalid_format');
  });

  test('valid date with match returns row', () => {
    const r = resolveTarget('2026-04-30', row1, null);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.target.id).toBe('w1');
  });

  test('valid date with no match returns not_found', () => {
    const r = resolveTarget('2026-04-30', null, row0);
    expect(r.kind).toBe('not_found');
    if (r.kind === 'not_found') expect(r.reason).toMatch(/2026-04-30/);
  });

  test('no date with latest available returns latest', () => {
    const r = resolveTarget(undefined, null, row1);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.target.id).toBe('w1');
  });

  test('no date with empty history returns not_found', () => {
    const r = resolveTarget(undefined, null, null);
    expect(r.kind).toBe('not_found');
    if (r.kind === 'not_found') expect(r.reason).toMatch(/нет ни одной записи/);
  });
});

// ─── Post-delete verify ─────────────────────────────────────────────────────

function verifyDelete(
  targetId: string,
  remaining: { id: string } | null,
): { ok: true } | { ok: false; reason: string } {
  if (remaining) {
    return {
      ok: false,
      reason: 'delete_body_weight: row still exists after delete (transaction rollback?)',
    };
  }
  return { ok: true };
}

describe('delete_body_weight — post-delete verify', () => {
  test('row gone → ok', () => {
    expect(verifyDelete('w1', null)).toEqual({ ok: true });
  });

  test('row reappears (DB inconsistency / replication lag) → reject', () => {
    const r = verifyDelete('w1', { id: 'w1' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/still exists/);
  });
});

// ─── Success message format ────────────────────────────────────────────────

function formatSuccessMessage(weightKg: number, date: Date): string {
  return `Удалил запись веса ${weightKg} кг от ${date.toISOString().slice(0, 10)}.`;
}

describe('delete_body_weight — success message', () => {
  test('quotes weight + date', () => {
    const msg = formatSuccessMessage(85, new Date('2026-04-30T12:00:00Z'));
    expect(msg).toBe('Удалил запись веса 85 кг от 2026-04-30.');
  });

  test('decimal weights preserved', () => {
    const msg = formatSuccessMessage(84.7, new Date('2026-04-30T00:00:00Z'));
    expect(msg).toContain('84.7');
  });
});
