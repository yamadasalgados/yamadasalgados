import StoreClient from "./StoreClient";

type PageProps = {
  params: Promise<{
    sellerId: string;
  }>;
};

export default async function PublicStorePage({
  params,
}: PageProps) {
  const { sellerId } = await params;

  return (
    <StoreClient
      sellerId={decodeURIComponent(sellerId)}
    />
  );
}
