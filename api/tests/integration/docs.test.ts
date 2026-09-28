import { afterAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { createTestApp } from '../helpers/app';

const { db, app } = createTestApp();

/**
 * Every operation the API serves, as `[method, path]`. Written out rather than
 * derived from the router on purpose: the point of the list is that adding a
 * route without documenting it fails here, and a list read out of the same
 * registry it is checking could never fail.
 */
const OPERATIONS: Array<[string, string]> = [
  ['post', '/api/auth/register'],
  ['post', '/api/auth/login'],
  ['post', '/api/auth/logout'],
  ['get', '/api/auth/me'],
  ['get', '/api/students'],
  ['post', '/api/students'],
  ['get', '/api/students/{id}/enrollments'],
  ['delete', '/api/students/{id}'],
  ['get', '/api/classes'],
  ['get', '/api/admin/classes'],
  ['get', '/api/admin/classes/{id}/roster'],
  ['post', '/api/bookings'],
  ['get', '/api/bookings'],
  ['get', '/api/bookings/{id}'],
  ['post', '/api/bookings/{id}/pay'],
  ['post', '/api/bookings/{id}/cancel'],
];

type Operation = {
  operationId?: string;
  parameters?: Array<{ in: string; name: string }>;
  security?: unknown[];
};
type Document = {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, Operation>>;
  components?: { securitySchemes?: Record<string, unknown> };
};

async function fetchDocument(): Promise<Document> {
  const res = await app.request('/doc');
  expect(res.status).toBe(200);

  return (await res.json()) as Document;
}

afterAll(async () => {
  await db.$disconnect();
});

describe('the OpenAPI document', () => {
  it('documents every operation the API serves, and nothing it does not', async () => {
    const doc = await fetchDocument();

    const served = Object.entries(doc.paths)
      .flatMap(([path, methods]) => Object.keys(methods).map((method) => `${method} ${path}`))
      .sort();

    expect(served).toEqual(OPERATIONS.map(([method, path]) => `${method} ${path}`).sort());
  });

  it('gives every operation its own id', async () => {
    const doc = await fetchDocument();

    // Scalar anchors the sidebar by these, and a duplicate silently merges two
    // endpoints into one entry.
    const ids = Object.values(doc.paths)
      .flatMap((methods) => Object.values(methods).map((operation) => operation.operationId))
      .filter((id): id is string => typeof id === 'string');

    expect(ids).toHaveLength(OPERATIONS.length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('describes itself as OpenAPI', async () => {
    const doc = await fetchDocument();

    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.info.title).toBe('Trial class booking API');
  });

  it('declares a parameter for every path placeholder', async () => {
    const doc = await fetchDocument();

    // A `{id}` with no matching parameter is a malformed document, and the
    // reference would show the placeholder without saying what fills it.
    for (const [path, methods] of Object.entries(doc.paths)) {
      const placeholders = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
      if (placeholders.length === 0) continue;

      for (const [method, operation] of Object.entries(methods)) {
        const declared = (operation.parameters ?? []).filter((p) => p.in === 'path').map((p) => p.name);
        expect(declared, `${method.toUpperCase()} ${path}`).toEqual(expect.arrayContaining(placeholders));
      }
    }
  });

  it('names the session cookie as the scheme auth routes use', async () => {
    const doc = await fetchDocument();

    expect(doc.components?.securitySchemes?.session).toMatchObject({ type: 'apiKey', in: 'cookie', name: 'session' });
  });
});

describe('the Scalar reference', () => {
  it('renders a page pointed at the document', async () => {
    const res = await app.request('/scalar');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);

    const html = await res.text();
    expect(html).toContain('/doc');
  });

  it.each([
    ['production', 'production'],
    ['an unrecognised environment', 'staging'],
    ['no environment at all', ''],
  ])('is not routed at all given %s', async (_label, nodeEnv) => {
    vi.stubEnv('NODE_ENV', nodeEnv);
    try {
      // A fresh app, because mounting happens when `createApp` runs.
      const off = createApp(db);

      // 404 rather than 403: the paths should not advertise that a reference exists.
      expect((await off.request('/doc')).status).toBe(404);
      expect((await off.request('/scalar')).status).toBe(404);

      // The API itself is unaffected.
      expect((await off.request('/api/classes')).status).toBe(401);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
