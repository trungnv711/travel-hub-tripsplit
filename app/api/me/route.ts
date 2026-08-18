import { getCurrentUser } from "../../auth";

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    return Response.json({
      authenticated: false,
    });
  }

  return Response.json({
    authenticated: true,
    user: {
      displayName: user.displayName,
      email: user.email,
    },
    provider: user.provider,
  });
}
