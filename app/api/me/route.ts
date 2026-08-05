import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "../../chatgpt-auth";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json({
      authenticated: false,
      signInPath: chatGPTSignInPath("/"),
    });
  }

  return Response.json({
    authenticated: true,
    user: {
      displayName: user.displayName,
      email: user.email,
    },
    signOutPath: chatGPTSignOutPath("/"),
  });
}
