import Link from "next/link";
import { Layout } from "@/components/ui";

export default function ClassNotFound() {
  return (
    <Layout backHref="/" backLabel="← Home">
      <div className="font-display text-[42px] font-black uppercase tracking-[-1px] mb-2">Not one of your classes</div>
      <p className="text-muted text-[15px] leading-[1.6] max-w-[480px]">
        That code isn&apos;t linked to your account. To do a workout in it, <Link href="/" className="text-accent">open it as a student</Link>.
      </p>
    </Layout>
  );
}
