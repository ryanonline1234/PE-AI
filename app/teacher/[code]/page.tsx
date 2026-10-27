import { redirect } from "next/navigation";

// Class pages moved to /classes/[code] when students got personal classes.
export default async function OldClassPath({ params }: { params: Promise<{ code: string }> }) {
  redirect(`/classes/${(await params).code.toUpperCase()}`);
}
