/**
 * Google API auth helpers for runner job scripts.
 * Supports OAuth refresh tokens and service account impersonation.
 *
 * @module
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

interface OAuthClientCredentials {
  client_id: string;
  client_secret: string;
}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
}

interface RefreshTokenFile {
  refresh_token: string;
}

/** Service account config object specifying a key file path. */
export interface ServiceAccountFileConfig {
  /** Path to the service account JSON key file. */
  file: string;
}

/** Configuration for a Google account's auth method. */
export interface AccountConfig {
  /** Google account email address. */
  email: string;
  /** Path to refresh token file (relative to credentialsDir). */
  tokenFile?: string;
  /** Service account key file path or config object. */
  serviceAccount?: string | ServiceAccountFileConfig;
}

/** Options for the Google auth helper. */
export interface GoogleAuthOptions {
  /** Path to the OAuth client credentials JSON file. */
  clientCredentialsPath: string;
  /** Base directory for credential files. */
  credentialsDir: string;
  /** Directory containing service account JSON files. */
  serviceAccountDir?: string;
}

// ========== JWT / Service Account ==========

function base64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createJwt(
  serviceAccount: ServiceAccountKey,
  scopes: string[],
  subject: string,
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    sub: subject,
    scope: scopes.join(' '),
    aud: serviceAccount.token_uri,
    iat: now,
    exp: now + 3600,
  };

  const headerB64 = base64url(Buffer.from(JSON.stringify(header)));
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload)));
  const unsigned = `${headerB64}.${payloadB64}`;

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsigned);
  const signature = base64url(sign.sign(serviceAccount.private_key));

  return `${unsigned}.${signature}`;
}

async function getServiceAccountToken(
  serviceAccount: ServiceAccountKey,
  scopes: string[],
  subject: string,
): Promise<string> {
  const jwt = createJwt(serviceAccount, scopes, subject);
  const resp = await fetch(serviceAccount.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(
      `Service account token failed (${String(resp.status)}): ${body}`,
    );
  }

  const data = (await resp.json()) as TokenResponse;
  return data.access_token;
}

// ========== OAuth Refresh ==========

async function getOAuthToken(
  refreshToken: string,
  client: OAuthClientCredentials,
): Promise<string> {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: client.client_id,
      client_secret: client.client_secret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(
      `OAuth token refresh failed (${String(resp.status)}): ${body}`,
    );
  }

  const data = (await resp.json()) as TokenResponse;
  return data.access_token;
}

// ========== Unified Auth ==========

/**
 * Create a Google auth helper with the given configuration.
 * Returns a function that resolves an access token for a given account and scopes.
 */
export function createGoogleAuth(options: GoogleAuthOptions) {
  const { clientCredentialsPath, credentialsDir, serviceAccountDir } = options;
  let _oauthClient: OAuthClientCredentials | null = null;

  function getOAuthClient(): OAuthClientCredentials {
    if (!_oauthClient) {
      _oauthClient = JSON.parse(
        fs.readFileSync(clientCredentialsPath, 'utf8'),
      ) as OAuthClientCredentials;
    }
    return _oauthClient;
  }

  /**
   * Get an access token for the given account and scopes.
   */
  async function getAccessToken(
    account: AccountConfig,
    scopes: string[],
  ): Promise<string> {
    if (account.serviceAccount) {
      const saDir = serviceAccountDir ?? credentialsDir;
      const saPath =
        typeof account.serviceAccount === 'string'
          ? account.serviceAccount
          : path.join(saDir, account.serviceAccount.file);
      const sa = JSON.parse(
        fs.readFileSync(saPath, 'utf8'),
      ) as ServiceAccountKey;
      return getServiceAccountToken(sa, scopes, account.email);
    }

    if (account.tokenFile) {
      const tokenPath = path.join(credentialsDir, account.tokenFile);
      const tokenData = JSON.parse(
        fs.readFileSync(tokenPath, 'utf8'),
      ) as RefreshTokenFile;
      return getOAuthToken(tokenData.refresh_token, getOAuthClient());
    }

    throw new Error(`No auth method configured for ${account.email}`);
  }

  return {
    /** Get an access token for the given account and scopes. */
    getAccessToken,
  };
}
