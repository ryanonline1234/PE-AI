import { Layout } from "@/components/ui";

export default function WorkoutNotFound() {
  return (
    <Layout backHref="/" backLabel="Home">
      <div className="t-page mb-3">
        Workout not found
      </div>
      <div className="text-muted text-[15px] leading-[1.6] max-w-[460px]">
        That link doesn&apos;t match a saved workout. Check it for typos, or enter your class code to
        generate a fresh one.
      </div>
    </Layout>
  );
}
