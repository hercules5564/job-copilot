import CheckoutClient from "./checkout-client";

export default function BillingCheckoutPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const raw = searchParams.transactionId;
  const transactionId = Array.isArray(raw) ? raw[0] : raw;
  return <CheckoutClient transactionId={transactionId ?? null} />;
}
