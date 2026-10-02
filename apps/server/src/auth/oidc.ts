import * as client from 'openid-client';
import type { Config } from '../config.js';

export const SCOPES = 'openid profile email';

export interface OidcProvider {
  authorizationUrl(params: { state: string; nonce: string; codeChallenge: string }): Promise<URL>;
  exchange(
    currentUrl: URL,
    checks: { state: string; nonce: string; codeVerifier: string },
  ): Promise<{ claims: client.IDToken; idToken: string | undefined }>;
  endSessionUrl(params: { idTokenHint?: string; postLogoutRedirectUri: string }): Promise<URL>;
}

export function createEntraProvider(config: Config): OidcProvider {
  let discovered: Promise<client.Configuration> | undefined;
  const getConfig = () => {
    discovered ??= client
      .discovery(
        new URL(`https://login.microsoftonline.com/${config.ENTRA_TENANT_ID}/v2.0`),
        config.ENTRA_CLIENT_ID,
        config.ENTRA_CLIENT_SECRET,
      )
      .catch((err: unknown) => {
        discovered = undefined;
        throw err;
      });
    return discovered;
  };
  const redirectUri = new URL('/auth/callback', config.PUBLIC_URL).toString();

  return {
    async authorizationUrl({ state, nonce, codeChallenge }) {
      return client.buildAuthorizationUrl(await getConfig(), {
        redirect_uri: redirectUri,
        scope: SCOPES,
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        response_mode: 'query',
      });
    },
    async exchange(currentUrl, { state, nonce, codeVerifier }) {
      const tokens = await client.authorizationCodeGrant(await getConfig(), currentUrl, {
        pkceCodeVerifier: codeVerifier,
        expectedState: state,
        expectedNonce: nonce,
        idTokenExpected: true,
      });
      const claims = tokens.claims();
      if (!claims) throw new Error('Mangler ID-token');
      return { claims, idToken: tokens.id_token };
    },
    async endSessionUrl({ idTokenHint, postLogoutRedirectUri }) {
      return client.buildEndSessionUrl(await getConfig(), {
        post_logout_redirect_uri: postLogoutRedirectUri,
        ...(idTokenHint ? { id_token_hint: idTokenHint } : {}),
      });
    },
  };
}
