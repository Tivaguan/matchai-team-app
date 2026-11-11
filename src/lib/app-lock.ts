// App lock: asks the phone for Face ID or a fingerprint (or its passcode)
// before showing the owner pages.
//
// It is a lock on the screen of ONE device, for the case where someone holds
// the owner's unlocked phone. It is kept on the device only and is not a
// second login checked by the server. Signing in with the password also unlocks.

const LOCK_KEY = "matchai-app-lock";
const UNLOCKED_KEY = "matchai-unlocked";
const HIDDEN_KEY = "matchai-hidden-at";
/** How long the app may stay in the background before it locks again. */
const GRACE_MS = 2 * 60 * 1000;

type SavedLock = { userId: string; credentialId: string };

function toBase64(bytes: ArrayBuffer) {
  return window.btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function fromBase64(text: string) {
  return Uint8Array.from(window.atob(text), (character) => character.charCodeAt(0));
}

function randomBytes() {
  return window.crypto.getRandomValues(new Uint8Array(32));
}

function read(storage: Storage, key: string) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function write(storage: Storage, key: string, value: string | null) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    // Storage can be blocked (private window). The lock then simply stays off.
  }
}

/** True when this device can ask for Face ID, a fingerprint or its passcode from a web page. */
export async function lockSupported() {
  try {
    return (
      window.isSecureContext &&
      "PublicKeyCredential" in window &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    );
  } catch {
    return false;
  }
}

/** The lock saved on this device for this owner, if any. */
export function savedLock(userId: string): SavedLock | null {
  try {
    const lock = JSON.parse(read(window.localStorage, LOCK_KEY) ?? "null") as SavedLock | null;
    return lock && lock.userId === userId ? lock : null;
  } catch {
    return null;
  }
}

/** Turns the lock on: the phone asks for Face ID once and remembers this device. */
export async function turnLockOn(userId: string, name: string) {
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(),
      rp: { name: "Matchai Team" },
      user: { id: new TextEncoder().encode(userId), name, displayName: name },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("cancelled");
  write(window.localStorage, LOCK_KEY, JSON.stringify({ userId, credentialId: toBase64(credential.rawId) }));
  markUnlocked();
}

/** Asks the phone for Face ID. Resolves when the owner passed, throws when they did not. */
export async function askToUnlock(lock: SavedLock) {
  const result = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(),
      allowCredentials: [{ type: "public-key", id: fromBase64(lock.credentialId), transports: ["internal"] }],
      userVerification: "required",
      timeout: 60_000,
    },
  });
  if (!result) throw new Error("cancelled");
  markUnlocked();
}

export function turnLockOff() {
  write(window.localStorage, LOCK_KEY, null);
}

/** Called after Face ID passed, and after a sign-in with the password. */
export function markUnlocked() {
  write(window.sessionStorage, UNLOCKED_KEY, "1");
  write(window.sessionStorage, HIDDEN_KEY, null);
}

/** False when the app was just opened, or stayed in the background too long. */
export function isUnlocked() {
  if (read(window.sessionStorage, UNLOCKED_KEY) !== "1") return false;
  const hiddenAt = Number(read(window.sessionStorage, HIDDEN_KEY) ?? 0);
  return hiddenAt === 0 || Date.now() - hiddenAt < GRACE_MS;
}

/** Remembers when the app went to the background (true) or came back (false). */
export function noteHidden(hidden: boolean) {
  if (hidden) write(window.sessionStorage, HIDDEN_KEY, String(Date.now()));
  else if (isUnlocked()) write(window.sessionStorage, HIDDEN_KEY, null);
  else write(window.sessionStorage, UNLOCKED_KEY, null);
}
