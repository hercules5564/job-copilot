-- Store the third-party hosted checkout URL (Razorpay Payment Link short_url).

ALTER TABLE "payment_transactions" ADD COLUMN "providerCheckoutUrl" TEXT;
