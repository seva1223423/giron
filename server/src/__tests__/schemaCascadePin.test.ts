/**
 * Schema cascade-delete pin — make sure DELETE /user/account wipes
 * every piece of user data.
 *
 * The /user/account route (server/src/routes/user.ts:1652) calls
 * `prisma.user.delete({ where: { id } })` and relies on Prisma to
 * cascade-delete every dependent row. That only works when each
 * relation pointing to User declares `onDelete: Cascade` in
 * schema.prisma. A single missing cascade leaves orphan rows —
 * which by 152-ФЗ + GDPR right-to-erasure is a real compliance
 * defect (the user requested deletion and we silently kept data).
 *
 * Why static-grep over a real Prisma integration test:
 *   - The actual cascade is enforced by the DB foreign key, not by
 *     application code. Verifying it via a real DB roundtrip needs a
 *     Postgres test fixture — heavy and CI-unfriendly.
 *   - The schema is the source of truth. Reading it as text + asserting
 *     every userId-field has the Cascade annotation pins the contract
 *     exactly where it lives.
 */

import * as fs from 'fs';
import * as path from 'path';

const SCHEMA_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'prisma',
  'schema.prisma',
);
const SCHEMA = fs.readFileSync(SCHEMA_PATH, 'utf8');

// ─── Every userId-field relation must Cascade ────────────────────────────────

describe('Prisma schema — DELETE /user/account cascade contract', () => {
  // Find every `@relation(fields: [userId], references: [id], ...)` and
  // assert it includes `onDelete: Cascade`. We grep on `fields: [userId]`
  // specifically — there are relations on `gymId`, `programId` etc. that
  // INTENTIONALLY use SetNull (gym is shared, programs survive their
  // creator), and we do NOT want to force Cascade on them.
  const lines = SCHEMA.split('\n');
  const relationLines = lines
    .map((line, idx) => ({ line, lineNo: idx + 1 }))
    .filter(({ line }) =>
      /@relation\([^)]*fields:\s*\[userId\][^)]*\)/.test(line),
    );

  test('schema contains at least 20 userId-relations (sanity check on the grep)', () => {
    // If this number drops sharply, the regex stopped matching — fix
    // the regex, not this assertion. As of this commit there are ~22.
    expect(relationLines.length).toBeGreaterThanOrEqual(20);
  });

  test('every userId-relation has onDelete: Cascade', () => {
    const violations: string[] = [];
    for (const { line, lineNo } of relationLines) {
      if (!/onDelete:\s*Cascade/.test(line)) {
        violations.push(`schema.prisma:${lineNo} → ${line.trim()}`);
      }
    }
    expect(violations).toEqual([]);
  });
});

// ─── Named-relation pins — easy to miss in a refactor ────────────────────────

describe('Prisma schema — named-relation cascades', () => {
  test('TrainerClient.trainer (UserOwnsClient) → Cascade', () => {
    // The TrainerClient model uses named relations because it points to
    // User twice (trainer + clientUser). Each must Cascade. A trainer
    // deleting their account must wipe their client relationships;
    // a client user being deleted must wipe their slot too.
    const trainerRel = SCHEMA.match(
      /User\s+@relation\("TrainerOwnsClient"[^)]*onDelete:\s*Cascade[^)]*\)/,
    );
    expect(trainerRel).not.toBeNull();
  });

  test('TrainerClient.clientUser (ClientIsUser) → Cascade', () => {
    const clientRel = SCHEMA.match(
      /User\?\s+@relation\("ClientIsUser"[^)]*onDelete:\s*Cascade[^)]*\)/,
    );
    expect(clientRel).not.toBeNull();
  });

  test('SupportTicket.user (UserTickets) → Cascade', () => {
    const ticketRel = SCHEMA.match(
      /User\s+@relation\("UserTickets"[^)]*onDelete:\s*Cascade[^)]*\)/,
    );
    expect(ticketRel).not.toBeNull();
  });
});

// ─── Intentional non-Cascade relations — documented ─────────────────────────

describe('Prisma schema — intentional non-Cascade relations stay non-Cascade', () => {
  // `gym` on User is SetNull: gyms are shared resources, deleting a user
  // shouldn't kill the gym. This test pins the SetNull so a reviewer
  // making it Cascade has to update the test too.
  test('User.gym uses SetNull (gym is shared resource)', () => {
    expect(SCHEMA).toMatch(
      /gym\s+Gym\??\s+@relation\([^)]*onDelete:\s*SetNull[^)]*\)/,
    );
  });

  test('Workout.program uses SetNull (programs outlive their creator)', () => {
    expect(SCHEMA).toMatch(
      /program\s+Program\??\s+@relation\([^)]*onDelete:\s*SetNull[^)]*\)/,
    );
  });

  test('Workout.routine uses SetNull (routines outlive their creator)', () => {
    expect(SCHEMA).toMatch(
      /routine\s+Routine\??\s+@relation\([^)]*onDelete:\s*SetNull[^)]*\)/,
    );
  });
});
