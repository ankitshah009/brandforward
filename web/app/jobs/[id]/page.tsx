import Console from "@/components/Console";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Console jobId={id === "harbor-launch" ? "new" : id} />;
}
