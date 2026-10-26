import { Layout } from "@/components/ui";

export default function WorkoutNotFound() {
  return (
    <Layout backHref="/" backLabel="← Home">
      <div className="font-display text-[42px] font-black uppercase tracking-[-1px] mb-2">
        Workout not found
      </div>
      <div className="text-muted text-[15px] leading-[1.6] max-w-[460px]">
        That link doesn&apos;t match a saved workout. Check it for typos, or enter your class code to
        generate a fresh one.
      </div>
    </Layout>
  );
}
