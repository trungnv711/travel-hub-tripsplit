import { getChatGPTUser } from "./chatgpt-auth";

export type AuthenticatedUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
  provider: "firebase" | "chatgpt";
};

const FIREBASE_WEB_API_KEY = "AIzaSyA1Ff2ICnQ9oP6EVAdICuM99xQqeVK5_78";
const FIREBASE_ACCOUNT_LOOKUP_URL =
  `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`;
const MAX_ID_TOKEN_LENGTH = 8_192;

type FirebaseAccount = {
  localId?: string;
  email?: string;
  displayName?: string;
  disabled?: boolean;
};

export async function getCurrentUser(request: Request): Promise<AuthenticatedUser | null> {
  const firebaseUser = await getFirebaseUser(request);
  if (firebaseUser) return firebaseUser;

  const hostname = new URL(request.url).hostname.toLowerCase();
  if (!hostname.endsWith(".chatgpt.site")) return null;

  const chatGPTUser = await getChatGPTUser();
  return chatGPTUser ? { ...chatGPTUser, provider: "chatgpt" } : null;
}

async function getFirebaseUser(request: Request): Promise<AuthenticatedUser | null> {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  const idToken = match?.[1] || "";
  if (!idToken || idToken.length > MAX_ID_TOKEN_LENGTH) return null;

  try {
    const response = await fetch(FIREBASE_ACCOUNT_LOOKUP_URL, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as { users?: FirebaseAccount[] };
    const account = payload.users?.[0];
    if (!account?.localId || !account.email || account.disabled) return null;

    return {
      userId: account.localId,
      displayName: account.displayName || account.email,
      email: account.email,
      fullName: account.displayName || null,
      provider: "firebase",
    };
  } catch {
    return null;
  }
}
