import { describe, expect, it } from 'vitest';
import { describeError } from '../../src/ui/errorMessages';

const fallback = 'Could not generate the model. Try again.';

function named(name: string, message = 'raw platform text'): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

describe('describeError', () => {
  it('passes through a message a person can act on', () => {
    expect(describeError(new Error('Choose a .glb model file.'), fallback))
      .toBe('Choose a .glb model file.');
    expect(describeError('Record speech before generating a 3D model.', fallback))
      .toBe('Record speech before generating a 3D model.');
  });

  it('falls back for parser, network and stack noise', () => {
    for (const message of [
      'Unexpected token < in JSON at position 0',
      '<!doctype html><html>',
      'Failed to fetch',
      'JSON.parse: unexpected character',
      'TypeError: x is not a function',
      'at handleGenerate (index.js:12)',
      'https://worker.example/generate-3d',
      'Request failed with HTTP 502',
    ]) {
      expect(describeError(new Error(message), fallback)).toBe(fallback);
    }
  });

  it('maps the permission and device failures the browser reports by name', () => {
    expect(describeError(named('NotAllowedError'), fallback)).toContain('Allow the permission');
    expect(describeError(named('NotFoundError'), fallback)).toContain('No suitable device');
    expect(describeError(named('NotReadableError'), fallback)).toContain('already in use');
    expect(describeError(named('SecurityError'), fallback)).toContain('HTTPS');
    expect(describeError(named('AbortError'), fallback)).toContain('took too long');
  });

  it('keeps actionable messages that merely contain the words null or undefined', () => {
    expect(describeError(new Error('The model bucket returned null bytes.'), fallback))
      .toBe('The model bucket returned null bytes.');
    expect(describeError(new Error('Model visibility is undefined for this account.'), fallback))
      .toBe('Model visibility is undefined for this account.');
  });

  it('still catches interpreter phrasing about null and undefined', () => {
    for (const message of [
      'Cannot read properties of undefined (reading \'scene\')',
      'undefined is not an object',
      'null is not a function',
    ]) {
      expect(describeError(new Error(message), fallback)).toBe(fallback);
    }
  });

  it('falls back for a blank message or a non-Error throw', () => {
    expect(describeError(new Error('   '), fallback)).toBe(fallback);
    expect(describeError('', fallback)).toBe(fallback);
    expect(describeError({ nope: true }, fallback)).toBe(fallback);
    expect(describeError(undefined, fallback)).toBe(fallback);
  });
});
