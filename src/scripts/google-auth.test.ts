/**
 * Tests for Google auth helper.
 * Uses mocked fetch to avoid real API calls.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type AccountConfig, createGoogleAuth } from './google-auth.js';

let tmpDir: string;
let credentialsDir: string;
let clientCredentialsPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jr-gauth-test-'));
  credentialsDir = path.join(tmpDir, 'credentials');
  fs.mkdirSync(credentialsDir, { recursive: true });

  // Write mock OAuth client credentials
  clientCredentialsPath = path.join(credentialsDir, 'client.json');
  fs.writeFileSync(
    clientCredentialsPath,
    JSON.stringify({
      client_id: 'test-client-id',
      client_secret: 'test-client-secret',
    }),
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('createGoogleAuth', () => {
  it('returns an object with getAccessToken', () => {
    const auth = createGoogleAuth({
      clientCredentialsPath,
      credentialsDir,
    });
    expect(auth).toHaveProperty('getAccessToken');
    expect(typeof auth.getAccessToken).toBe('function');
  });

  it('gets OAuth token via refresh token', async () => {
    // Write a refresh token file
    const tokenPath = path.join(credentialsDir, 'token.json');
    fs.writeFileSync(
      tokenPath,
      JSON.stringify({ refresh_token: 'test-refresh-token' }),
    );

    // Mock fetch
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'mock-access-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const auth = createGoogleAuth({
      clientCredentialsPath,
      credentialsDir,
    });

    const account: AccountConfig = {
      email: 'test@example.com',
      tokenFile: 'token.json',
    };

    const token = await auth.getAccessToken(account, [
      'https://www.googleapis.com/auth/gmail.readonly',
    ]);
    expect(token).toBe('mock-access-token');
    expect(fetch).toHaveBeenCalledOnce();

    // Verify the correct endpoint was called
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
  });

  it('throws when no auth method configured', async () => {
    const auth = createGoogleAuth({
      clientCredentialsPath,
      credentialsDir,
    });

    const account: AccountConfig = {
      email: 'test@example.com',
      // No tokenFile, no serviceAccount
    };

    await expect(auth.getAccessToken(account, [])).rejects.toThrow(
      'No auth method configured',
    );
  });

  it('throws on OAuth API error', async () => {
    const tokenPath = path.join(credentialsDir, 'token.json');
    fs.writeFileSync(tokenPath, JSON.stringify({ refresh_token: 'bad-token' }));

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('invalid_grant', { status: 401 }),
    );

    const auth = createGoogleAuth({
      clientCredentialsPath,
      credentialsDir,
    });

    const account: AccountConfig = {
      email: 'test@example.com',
      tokenFile: 'token.json',
    };

    await expect(auth.getAccessToken(account, [])).rejects.toThrow(
      'OAuth token refresh failed (401)',
    );
  });
});
