import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, apiBlob } from '../../api';

// ── apiFetch ──────────────────────────────────────────────────────────────────

describe('apiFetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends request to /api prefix', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await apiFetch('/questions');
    expect(mockFetch).toHaveBeenCalledWith('/api/questions', expect.any(Object));
  });

  it('returns parsed JSON', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ total: 5 }), { status: 200 }),
    );
    const result = await apiFetch<{ total: number }>('/stats');
    expect(result.total).toBe(5);
  });

  it('adds Content-Type for JSON body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    await apiFetch('/questions', { method: 'POST', body: JSON.stringify({ stem: 'test' }) });
    const [, opts] = vi.mocked(fetch).mock.calls[0];
    expect((opts as RequestInit & { headers: Record<string, string> }).headers['Content-Type'])
      .toBe('application/json');
  });

  it('does not add Content-Type for FormData body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    await apiFetch('/upload', { method: 'POST', body: new FormData() });
    const [, opts] = vi.mocked(fetch).mock.calls[0];
    expect((opts as RequestInit & { headers: Record<string, string> }).headers['Content-Type'])
      .toBeUndefined();
  });

  it('throws on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }),
    );
    await expect(apiFetch('/questions/bad-id')).rejects.toThrow('Not found');
  });

  it('throws with status text when error body is unparseable', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('not json', { status: 500, statusText: 'Internal Server Error' }),
    );
    await expect(apiFetch('/questions')).rejects.toThrow();
  });
});

// ── apiBlob ───────────────────────────────────────────────────────────────────

describe('apiBlob', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a Blob on success', async () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(blob, { status: 200 }));
    const result = await apiBlob('/generate-pdf', { method: 'POST', body: '{}' });
    // Use constructor name check to avoid jsdom cross-realm Blob instanceof issues
    expect(result.constructor.name).toBe('Blob');
    expect(result.size).toBeGreaterThan(0);
  });

  it('throws on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'No questions selected' }), { status: 400 }),
    );
    await expect(apiBlob('/generate-pdf', {})).rejects.toThrow('No questions selected');
  });
});
