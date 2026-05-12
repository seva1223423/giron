/**
 * flashBus — pub-sub contract pins.
 *
 * Pins the four guarantees emitters and listeners depend on:
 *  1. Listeners fire on emit for the matching key.
 *  2. Listeners are isolated — different keys don't cross-trigger.
 *  3. Unsubscribe stops future emits from reaching the listener.
 *  4. A throwing listener doesn't take down other listeners on the same key.
 */

import { flashBus, flashKey } from '../utils/flashBus';

afterEach(() => {
  flashBus._clear();
});

describe('flashBus', () => {
  it('fires subscribed listener on emit', () => {
    const spy = jest.fn();
    flashBus.on('set:0:1', spy);
    flashBus.emit('set:0:1');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('isolates listeners by key', () => {
    const spyA = jest.fn();
    const spyB = jest.fn();
    flashBus.on('set:0:1', spyA);
    flashBus.on('set:0:2', spyB);
    flashBus.emit('set:0:1');
    expect(spyA).toHaveBeenCalledTimes(1);
    expect(spyB).not.toHaveBeenCalled();
  });

  it('unsubscribe stops the listener from firing', () => {
    const spy = jest.fn();
    const off = flashBus.on('set:0:1', spy);
    flashBus.emit('set:0:1');
    off();
    flashBus.emit('set:0:1');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('a throwing listener does not block siblings', () => {
    const throwing = jest.fn(() => {
      throw new Error('boom');
    });
    const ok = jest.fn();
    flashBus.on('set:0:1', throwing);
    flashBus.on('set:0:1', ok);
    expect(() => flashBus.emit('set:0:1')).not.toThrow();
    expect(ok).toHaveBeenCalledTimes(1);
  });
});

describe('flashKey builders', () => {
  it('produces the documented key shapes', () => {
    expect(flashKey.set(0, 1)).toBe('set:0:1');
    expect(flashKey.exerciseSwitch()).toBe('exercise:switch');
    expect(flashKey.water()).toBe('nutrition:water');
  });

  it('different (exIdx,setIdx) tuples produce different keys', () => {
    expect(flashKey.set(0, 1)).not.toBe(flashKey.set(1, 0));
    expect(flashKey.set(0, 1)).not.toBe(flashKey.set(0, 2));
  });
});
