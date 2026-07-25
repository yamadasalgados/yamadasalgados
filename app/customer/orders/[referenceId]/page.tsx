import CustomerOrderDetailClient from "./CustomerOrderDetailClient";

type PageProps = {
  params: Promise<{ referenceId: string }>;
};

export default async function CustomerOrderDetailPage({ params }: PageProps) {
  const { referenceId } = await params;
  return <CustomerOrderDetailClient referenceId={decodeURIComponent(referenceId)} />;
}
