import { redirect } from "next/navigation";

// Seasons live on the title page now — one canonical page per show.
export default async function LegacySeasonPage({
  params,
}: {
  params: Promise<{ tmdbId: string; seasonNumber: string }>;
}) {
  const { tmdbId } = await params;
  redirect(`/show/${tmdbId}`);
}
