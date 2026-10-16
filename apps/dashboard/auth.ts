import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { isAllowed } from "@/lib/allowlist";

/** Login is only configured where the GitHub app and secret are set (production for now). */
export const authConfigured = Boolean(
  process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET && process.env.AUTH_SECRET,
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  session: { strategy: "jwt" },
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    // Refuse anyone not on the allowlist before a session exists.
    signIn: ({ profile }) => isAllowed(profile?.id),
    jwt: ({ token, profile }) => {
      if (profile?.id) token.githubId = String(profile.id);
      return token;
    },
    session: ({ session, token }) => ({ ...session, githubId: token.githubId }),
  },
});
