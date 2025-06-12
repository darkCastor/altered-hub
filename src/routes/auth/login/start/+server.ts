import { json, error as SvelteKitError } from '@sveltejs/kit';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { rpId } from '$lib/authConfig';
import { devUserStore, devChallengeStore } from '$lib/devAuthStore';
import type { PublicKeyCredentialDescriptor } from '../../../../types/auth';

const GENERIC_LOGIN_CHALLENGE_KEY = 'currentLoginChallenge';

export async function POST({ request }) {
  const body = await request.json();
  const username: string | undefined = body.username;

  let allowCredentials: PublicKeyCredentialDescriptor[] | undefined = undefined;
  let userIdForChallenge: string | undefined = undefined;

  if (username) {
    const user = devUserStore.getUser(username);
    if (user) {
      userIdForChallenge = user.id;
      if (user.credentials.length > 0) {
        allowCredentials = user.credentials.map(cred => ({
          id: cred.id, // Base64URLString
          type: 'public-key',
          transports: cred.transports,
        }));
      } else {
        // User exists but has no registered credentials.
        // Depending on desired UX, could error here or let authenticator try discoverable.
        // For now, proceed without allowCredentials, relying on discoverable or error at authenticator.
      }
    } else {
      // User not found. For login, this typically means an error,
      // unless we want to support "lookup-less" login attempts that always rely on discoverable credentials.
      // For now, let's proceed without allowCredentials and see if a discoverable credential can be found.
      // If not, the finish step will fail.
      // Alternatively, could throw SvelteKitError(404, 'User not found.');
      // Let's be explicit: if username is given, user must be found.
       throw SvelteKitError(404, `User "${username}" not found.`);
    }
  }

  const options = await generateAuthenticationOptions({
    rpID: rpId,
    allowCredentials, // Undefined if no username or user has no credentials
    userVerification: 'preferred',
  });

  // Store the challenge
  if (userIdForChallenge) {
    devChallengeStore.storeChallenge(userIdForChallenge, options.challenge);
  } else {
    // For username-less (discoverable) logins, store challenge generically.
    // This is a simplified approach for the dev store.
    devChallengeStore.storeChallenge(GENERIC_LOGIN_CHALLENGE_KEY, options.challenge);
  }

  return json(options);
}
