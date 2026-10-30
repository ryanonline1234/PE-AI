import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Layout } from "@/components/ui";
import { NewClassWizard, type WizardStep } from "@/components/teacher/NewClassWizard";
import { getAccount, isTeacherAccount } from "@/lib/supabase-auth";
import { classLabel, loadClass, loadPresets } from "@/lib/teacher-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New class — PE.AI", robots: { index: false } };

type Search = Promise<{ code?: string; step?: string }>;

// The three-step new-class setup (docs/04 T3). After step 1 the class exists;
// later steps load it from ?code= (owner only) so a refresh keeps the place.
export default async function NewClassPage({ searchParams }: { searchParams: Search }) {
  const account = await getAccount();
  if (!account) redirect("/login?next=/teacher/new");
  if (!isTeacherAccount(account)) redirect("/me");

  const { code: rawCode, step: rawStep } = await searchParams;
  const [presets, found] = await Promise.all([
    loadPresets(),
    rawCode && /^[A-Za-z0-9]{6}$/.test(rawCode) ? loadClass(rawCode.toUpperCase()) : Promise.resolve(null),
  ]);
  const cls = found && found.owner_id === account.id && found.kind === "class" ? found : null;
  const later: WizardStep[] = ["settings", "background", "share"];
  const step: WizardStep = cls ? (later.find((s) => s === rawStep) ?? "settings") : "name";

  const h = await headers();
  const studentLink = cls ? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}/c/${cls.code}` : "";

  return (
    <Layout backHref="/teacher" backLabel="Classes">
      <NewClassWizard
        key={`${cls?.code ?? "new"}-${step}`}
        step={step}
        presets={presets.map((p) => ({ id: p.id, name: p.name }))}
        cls={cls && { code: cls.code, label: classLabel(cls), config: cls.config }}
        studentLink={studentLink}
      />
    </Layout>
  );
}
