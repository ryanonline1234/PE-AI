import Link from "next/link";
import { Layout } from "@/components/ui";

export default function ClassNotFound() {
  return (
    <Layout backHref="/teacher" backLabel="← Classes">
      <div className="font-display text-[42px] font-black uppercase tracking-[-1px] mb-2">Not one of your classes</div>
      <p className="text-muted text-[15px] leading-[1.6] max-w-[480px]">
        That code isn&apos;t linked to your account. If it&apos;s a class you made before signing in, add it from{" "}
        <Link href="/teacher" className="text-accent">your classes</Link> with its code and teacher key.
      </p>
    </Layout>
  );
}
