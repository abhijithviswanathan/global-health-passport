/**
 * Browser WebAuthn adapter: converts server JSON into browser credential options
 * and serializes the response back to the Java passkey endpoints. The server
 * verifies challenges, origins and credentials; this module does not grant roles.
 */
import { api, type User } from "./api";
const decode = (value: string) =>
  Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  ).buffer;
const encode = (value: ArrayBuffer | null) =>
  value
    ? btoa(String.fromCharCode(...new Uint8Array(value)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "")
    : null;
function serialize(credential: PublicKeyCredential) {
  const response = credential.response;
  const result: Record<string, unknown> = {
    clientDataJSON: encode(response.clientDataJSON),
  };
  if (response instanceof AuthenticatorAttestationResponse) {
    result.attestationObject = encode(response.attestationObject);
    result.transports = response.getTransports?.() || [];
  } else {
    const assertion = response as AuthenticatorAssertionResponse;
    result.authenticatorData = encode(assertion.authenticatorData);
    result.signature = encode(assertion.signature);
    result.userHandle = encode(assertion.userHandle);
  }
  return {
    id: credential.id,
    rawId: encode(credential.rawId),
    type: credential.type,
    response: result,
    clientExtensionResults: credential.getClientExtensionResults(),
  };
}
export async function signInWithPasskey(username: string) {
  const { requestId, publicKey } = await api<{
    requestId: string;
    publicKey: Omit<
      PublicKeyCredentialRequestOptions,
      "challenge" | "allowCredentials"
    > & {
      challenge: string;
      allowCredentials?: { id: string; type: "public-key" }[];
    };
  }>("/auth/passkey/options", { method: "POST", body: { username } });
  const options = {
    ...publicKey,
    challenge: decode(publicKey.challenge),
    allowCredentials: publicKey.allowCredentials?.map((c) => ({
      ...c,
      id: decode(c.id),
    })),
  };
  const credential = (await navigator.credentials.get({
    publicKey: options,
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Passkey sign-in was canceled.");
  return api<User>("/auth/passkey/finish", {
    method: "POST",
    body: { requestId, credential: serialize(credential) },
  });
}
export async function registerPasskey(password: string, otp: string) {
  const result = await api<{
    requestId: string;
    publicKey: {
      challenge: string;
      user: { id: string; name: string; displayName: string };
      excludeCredentials?: { id: string; type: "public-key" }[];
      rp: PublicKeyCredentialRpEntity;
      pubKeyCredParams: PublicKeyCredentialParameters[];
      authenticatorSelection?: AuthenticatorSelectionCriteria;
      timeout?: number;
      attestation?: AttestationConveyancePreference;
    };
  }>("/passkeys/register/options", { method: "POST", body: { password, otp } });
  const pk = result.publicKey;
  const options: PublicKeyCredentialCreationOptions = {
    ...pk,
    challenge: decode(pk.challenge),
    user: { ...pk.user, id: decode(pk.user.id) },
    excludeCredentials: pk.excludeCredentials?.map((c) => ({
      ...c,
      id: decode(c.id),
    })),
  };
  const credential = (await navigator.credentials.create({
    publicKey: options,
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Passkey enrollment was canceled.");
  return api("/passkeys/register/finish", {
    method: "POST",
    body: { requestId: result.requestId, credential: serialize(credential) },
  });
}
