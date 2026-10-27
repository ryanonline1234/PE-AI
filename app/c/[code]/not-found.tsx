import { Layout } from "@/components/ui";

export default function NoSuchClass() {
  return (
    <Layout backHref="/" backLabel="← Home">
      <div className="font-display text-[42px] font-black uppercase tracking-[-1px] mb-2">No class with that code</div>
      <p className="text-muted text-[15px] leading-[1.6] max-w-[460px]">
        Check the code with your teacher. Codes are 6 letters and numbers, like ABCD12.
      </p>
    </Layout>
  );
}
