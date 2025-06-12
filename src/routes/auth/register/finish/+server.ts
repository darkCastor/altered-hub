import { json, error as SvelteKitError } from '@sveltejs/kit';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/types';
import { rpId, expectedOrigin } from '$lib/authConfig';
import { devUserStore, devChallengeStore } from '$lib/devAuthStore';
import type { Credential, User } from '../../../../types/auth';

export async function POST({ request }) {
  const response: RegistrationResponseJSON = await request.json();

  // The userID should ideally be passed from the client, or determined via session
  // For this example, we'll assume client might pass it, or we try to find user by response.id if it's the credential ID
  // However, response.id is the credential ID, not user ID.
  // We need a way to link the challenge to the user.
  // The common way is to have the client send back the userID it used in /start
  // Or, if using cookies/session, retrieve userID from session.
  // For now, let's assume a temporary lookup mechanism or that client sends userID.
  // Let's expect `userId` in the body for now, which client should remember from the start phase.
  const { userId } = response as any; // Unsafe, but for placeholder logic. Client should send this.
                                     // Or, more robustly, the client should send the username,
                                     // and we look up the user by username to get their ID,
                                     // then use that ID to get the challenge.

  if (!userId || typeof userId !== 'string') {
    // A more robust solution would be to use the username from the start phase,
    // as the client should know which user it was trying to register.
    // For now, we will try to find the user by the credential's user handle if available,
    // but this is not standard for retrieving the challenge.
    // The challenge is typically tied to the `options.user.id` from the start phase.
    // The client should send back this `options.user.id` as `userId`.
    console.error('Missing userId in request body for finish step.');
    throw SvelteKitError(400, 'userId is required to retrieve the challenge.');
  }


  const user = devUserStore.getUserById(userId);
  if (!user) {
    throw SvelteKitError(404, 'User not found for the given userId.');
  }

  const expectedChallenge = devChallengeStore.getChallenge(user.id);

  if (!expectedChallenge) {
    throw SvelteKitError(400, 'Challenge not found for this user. It may have expired or already been used.');
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpId,
      requireUserVerification: false, // Based on authenticatorSelection in /start
    });
  } catch (err: any) {
    console.error('Verification error:', err);
    throw SvelteKitError(500, `Verification failed: ${err.message}`);
  }

  const { verified, registrationInfo } = verification;

  if (verified && registrationInfo) {
    const {
      credentialID, // This is Uint8Array
      credentialPublicKey, // This is Uint8Array
      counter,
      credentialDeviceType,
      credentialBackedUp,
      // attestationObject, // Available if needed for deeper inspection
      // clientDataJSON, // Available
    } = registrationInfo;

    // Convert credentialID (Uint8Array) to Base64URLString for storage and future use
    // SimpleWebAuthn typically provides helper functions or expects this format.
    // For now, let's assume `response.id` is the Base64URLString version of credentialID.
    // Or, if `credentialID` is raw, we'd need to encode it.
    // From @simplewebauthn/types, response.id is already a Base64URLString.
    // registrationInfo.credentialID is the raw Uint8Array.
    // We need to store the Base64URLString version.
    const newCredential: Credential = {
      id: response.id, // This is the Base64URLString version of the credential ID
      publicKey: credentialPublicKey,
      counter,
      deviceType: credentialDeviceType, // 'singleDevice' or 'multiDevice'
      backedUp: credentialBackedUp,
      transports: response.response.transports || [], // Get transports from original response
    };

    devUserStore.addCredentialToUser(user.id, newCredential);
    devChallengeStore.clearChallenge(user.id);

    // Log for now, actual DB interaction later
    console.log('New credential registered for user:', user.username, newCredential);

    return json({ verified: true, userId: user.id });
  } else {
    devChallengeStore.clearChallenge(user.id); // Clear challenge even on failure to prevent replay
    throw SvelteKitError(400, 'Registration verification failed.');
  }
}
