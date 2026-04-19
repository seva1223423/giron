/** Mock for otpauth — prevents ESM parse errors in Jest. */

export class Secret {
  static fromBase32(_base32: string): Secret { return new Secret(); }
  static fromHex(_hex: string): Secret { return new Secret(); }
  static fromLatin1(_latin1: string): Secret { return new Secret(); }
  static fromUTF8(_utf8: string): Secret { return new Secret(); }
  static fromRaw(_raw: string): Secret { return new Secret(); }
  toBase32(): string { return 'MOCK_SECRET_BASE32'; }
  toHex(): string { return 'MOCK_SECRET_HEX'; }
}

export class TOTP {
  constructor(_params: any) {}
  generate(): string { return '000000'; }
  validate(_params: { token: string; window?: number }): number | null { return 0; }
  toString(): string { return 'otpauth://totp/mock?secret=MOCK'; }
}

export class HOTP {
  constructor(_params: any) {}
  generate(_counter: number): string { return '000000'; }
  validate(_params: { token: string; counter: number; window?: number }): number | null { return 0; }
}
