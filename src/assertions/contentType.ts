import type { HttpResponse } from '../http/types.js';
import type { AssertionResult } from './types.js';

interface ParsedContentType {
  mime: string;
  parameters: Record<string, string>;
}

function parseContentType(raw: string): ParsedContentType {
  const parts = raw.split(';').map((p) => p.trim());
  const mime = (parts[0] ?? '').toLowerCase();
  const parameters: Record<string, string> = {};

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    const eqIdx = part.indexOf('=');
    if (eqIdx > 0) {
      const key = part.slice(0, eqIdx).trim().toLowerCase();
      let val = part.slice(eqIdx + 1).trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      }
      parameters[key] = val.toLowerCase();
    }
  }

  return { mime, parameters };
}

export function assertContentType(
  response: HttpResponse,
  expectedContentType?: string,
): AssertionResult | null {
  if (!expectedContentType) {
    return null;
  }

  const rawActual = response.headers['content-type'];
  if (!rawActual) {
    return {
      name: 'Content-Type',
      passed: false,
      message: `Expected Content-Type "${expectedContentType}", but response has no Content-Type header`,
      expected: expectedContentType,
      actual: undefined,
    };
  }

  const actual = parseContentType(rawActual);
  const expected = parseContentType(expectedContentType);

  let passed = false;

  // 1. If expected is a simple alias like 'json' or 'xml'
  if (!expected.mime.includes('/')) {
    if (expected.mime === 'json') {
      passed = actual.mime === 'application/json' || actual.mime.endsWith('+json');
    } else if (expected.mime === 'xml') {
      passed =
        actual.mime === 'application/xml' ||
        actual.mime === 'text/xml' ||
        actual.mime.endsWith('+xml');
    } else {
      passed =
        actual.mime === `application/${expected.mime}` || actual.mime === `text/${expected.mime}`;
    }
  } else {
    // 2. Exact media type check (e.g. application/json === application/json)
    const mimeMatches = actual.mime === expected.mime;

    if (mimeMatches) {
      // If expected specifies parameters (e.g. charset=utf-8), verify them
      const expectedParamKeys = Object.keys(expected.parameters);
      if (expectedParamKeys.length > 0) {
        passed = expectedParamKeys.every((k) => actual.parameters[k] === expected.parameters[k]);
      } else {
        passed = true;
      }
    } else {
      passed = false;
    }
  }

  return {
    name: 'Content-Type',
    passed,
    message: passed
      ? `Content-Type "${rawActual}" matches expected "${expectedContentType}"`
      : `Expected Content-Type "${expectedContentType}", received "${rawActual}"`,
    expected: expectedContentType,
    actual: rawActual,
  };
}
