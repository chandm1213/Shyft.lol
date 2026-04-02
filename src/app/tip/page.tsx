import { Metadata } from "next";
import { redirect } from "next/navigation";

interface Props {
  searchParams: Promise<{ amount?: string; tips?: string; user?: string }>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const user = params.user || "someone";
  const amount = params.amount || "0";
  const tips = params.tips || "1";

  const ogImageUrl = `https://www.shyft.lol/api/tip-card?user=${encodeURIComponent(user)}&amount=${amount}&tips=${tips}`;
  const title = `💸 @${user} earned ${amount} SOL in tips on Shyft`;
  const description = `${amount} SOL from ${tips} ${Number(tips) === 1 ? "tip" : "tips"} on a single post. Get tipped for your posts on Shyft — the on-chain social platform on Solana.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
      type: "website",
      siteName: "Shyft",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function TipPage({ searchParams }: Props) {
  // When someone actually visits this page, redirect to the main app
  redirect("/");
}
