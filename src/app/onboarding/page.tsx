import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { getServerSession } from "@/lib/auth/session";

export default async function OnboardingPage() {
  const session = await getServerSession();
  if (!session.isLoggedIn) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-2xl">
        <OnboardingWizard />
      </div>
    </div>
  );
}
