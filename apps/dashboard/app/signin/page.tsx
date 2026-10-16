import { authConfigured, signIn } from "@/auth";

export const dynamic = "force-dynamic";

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  if (!authConfigured) {
    return (
      <main>
        <h1>Transpera Factory</h1>
        <p>Sign-in is only set up on production: https://transpera-factory.vercel.app</p>
      </main>
    );
  }
  return (
    <main>
      <h1>Transpera Factory</h1>
      {error === "AccessDenied" && <p role="alert">This GitHub account is not allowed.</p>}
      {error && error !== "AccessDenied" && <p role="alert">Sign-in failed. Try again.</p>}
      <form
        action={async () => {
          "use server";
          await signIn("github", { redirectTo: "/" });
        }}
      >
        <button type="submit">Sign in with GitHub</button>
      </form>
    </main>
  );
}
