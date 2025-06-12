import { json, error as SvelteKitError } from '@sveltejs/kit';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON } from '@simplewebauthn/types';
import { rpId, expectedOrigin } from '$lib/authConfig';
import { devUserStore, devChallengeStore, devSessionStore } from '$lib/devAuthStore';
import type { Credential, User } from '../../../../types/auth';
import { randomUUID } from 'crypto';

const GENERIC_LOGIN_CHALLENGE_KEY = 'currentLoginChallenge';
const SESSION_COOKIE_NAME = 'sessionid';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function POST({ request, cookies }) {
  const response: AuthenticationResponseJSON = await request.json();

  const userHandle = response.response.userHandle; // This should be the User ID
  let userIdFromUserHandle: string | undefined = undefined;

  if (userHandle) {
    // Assuming userHandle is a UTF-8 string that was originally the user.id
    // If it was stored as ArrayBuffer, it would need decoding.
    // SimpleWebAuthn server-side usually expects user.id to be a string.
    try {
        // Try to decode if it's base64url, otherwise assume it's already a string
        // For this example, we assume user.id was stored as a string and is returned as such.
        // If not, Buffer.from(userHandle, 'base64url').toString('utf8') might be needed.
        // For now, devUserStore uses string IDs directly.
        userIdFromUserHandle = userHandle;
    } catch (e) {
        throw SvelteKitError(400, 'Invalid userHandle format.');
    }
  }

  if (!userIdFromUserHandle) {
    throw SvelteKitError(400, 'UserHandle (userId) is missing from authentication response.');
  }

  const user = devUserStore.getUserById(userIdFromUserHandle);
  if (!user) {
    throw SvelteKitError(404, `User not found for ID: ${userIdFromUserHandle}.`);
  }

  const credentialIdFromResponse = response.id; // This is Base64URLString
  const storedCredential = user.credentials.find(cred => cred.id === credentialIdFromResponse);

  if (!storedCredential) {
    throw SvelteKitError(404, 'Credential not found for this user.');
  }

  // Determine which challenge to use
  let expectedChallenge = devChallengeStore.getChallenge(user.id);
  let challengeKeyToClear = user.id;

  if (!expectedChallenge) {
    // If no challenge was found for the user.id, try the generic one (for username-less start)
    expectedChallenge = devChallengeStore.getChallenge(GENERIC_LOGIN_CHALLENGE_KEY);
    challengeKeyToClear = GENERIC_LOGIN_CHALLENGE_KEY;
  }

  if (!expectedChallenge) {
    throw SvelteKitError(400, 'Challenge not found. It may have expired or already been used.');
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpId,
      authenticator: {
        ...storedCredential,
        credentialID: new Uint8Array(Buffer.from(storedCredential.id, 'base64url')), // Needs to be Uint8Array
        algorithms: undefined, // Optional: COSEAlgorithmIdentifier[], not stored in this example
      },
      requireUserVerification: false, // Align with 'preferred' in options
    });
  } catch (err: any) {
    console.error('Verification error:', err);
    devChallengeStore.clearChallenge(challengeKeyToClear); // Clear challenge on error
    throw SvelteKitError(500, `Verification failed: ${err.message}`);
  }

  const { verified, authenticationInfo } = verification;

  if (verified) {
    // Update the credential counter
    const updatedCredential = {
      ...storedCredential,
      counter: authenticationInfo.newCounter,
    };
    // Replace the old credential with the updated one
    user.credentials = user.credentials.map(cred =>
      cred.id === storedCredential.id ? updatedCredential : cred
    );
    // (In a real DB, you'd update the specific credential record)

    devChallengeStore.clearChallenge(challengeKeyToClear);

    // Session creation
    const sessionId = randomUUID();
    devSessionStore.setSession(sessionId, user.id, SESSION_DURATION_MS);

    cookies.set(SESSION_COOKIE_NAME, sessionId, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
      sameSite: 'lax',
      maxAge: SESSION_DURATION_MS / 1000, // maxAge is in seconds
    });

    return json({
      verified: true,
      user: { id: user.id, username: user.username },
    });
  } else {
    devChallengeStore.clearChallenge(challengeKeyToClear); // Clear challenge even on failure
    throw SvelteKitError(400, 'Authentication verification failed.');
  }
}
