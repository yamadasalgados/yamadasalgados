import StoreOrderDetailClient from "./StoreOrderDetailClient";

type PageProps = {
  params: Promise<{
    orderId: string;
  }>;
};

export default async function StoreOrderDetailPage({
  params,
}: PageProps) {
  const {
    orderId,
  } = await params;

  return (
    <StoreOrderDetailClient
      orderId={decodeURIComponent(
        orderId,
      )}
    />
  );
}
