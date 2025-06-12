import { json, error as SvelteKitError } from '@sveltejs/kit';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { rpId, rpName, expectedOrigin } from '$lib/authConfig';
import { devUserStore, devChallengeStore } from '$lib/devAuthStore';
import type { User, PublicKeyCredentialDescriptor } from '../../../../types/auth';

export async function POST({ request }) {
  const { username } = await request.json();

  if (!username || typeof username !== 'string') {
    throw SvelteKitError(400, 'Username is required and must be a string.');
  }

  let user = devUserStore.getUser(username);
  if (!user) {
    user = devUserStore.createUser(username);
  }

  const excludeCredentials: PublicKeyCredentialDescriptor[] = user.credentials.map(cred => ({
    id: cred.id, // This is already Base64URLString
    type: 'public-key',
    transports: cred.transports,
  }));

  const options = await generateRegistrationOptions({
    rpID: rpId,
    rpName: rpName,
    userID: user.id,
    userName: user.username,
    attestationType: 'none',
    excludeCredentials,
    authenticatorSelection: {
      residentKey: 'preferred',
      requireResidentKey: false,
      userVerification: 'preferred',
    },
    // extensions: {
    //   credProps: true, // Requesting credential properties extension
    // },
  });

  // Store the challenge temporarily
  devChallengeStore.storeChallenge(user.id, options.challenge);

  return json(options);
}
