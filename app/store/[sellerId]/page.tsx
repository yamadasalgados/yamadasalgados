import { PublicStoreNav } from "@/app/_components/RoleNavigation";
import StoreClient from "./StoreClient";

type PageProps = {
  params: Promise<{ sellerId: string }>;
};

export default async function PublicStorePage({ params }: PageProps) {
  const { sellerId } = await params;
  const decodedSellerId = decodeURIComponent(sellerId);

  return (
    <>
      <PublicStoreNav
        kind="public"
        sellerId={decodedSellerId}
        storeHref={`/store/${encodeURIComponent(decodedSellerId)}`}
      />
      <StoreClient sellerId={decodedSellerId} />
    </>
  );
}
