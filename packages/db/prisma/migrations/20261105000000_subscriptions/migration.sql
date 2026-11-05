-- Billing: monthly/yearly subscriptions + provider-verified payments.

CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');

CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "billingInterval" "BillingInterval" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "startDate" TIMESTAMP(3) NOT NULL,
    "expirationDate" TIMESTAMP(3) NOT NULL,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "renewalDate" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "provider" TEXT,
    "providerSubscriptionId" TEXT,
    "lastPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "provider" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "providerPaymentId" TEXT,
    "planId" TEXT NOT NULL,
    "billingInterval" "BillingInterval" NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "receipt" TEXT,
    "failureReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscriptions_providerSubscriptionId_key" ON "subscriptions"("providerSubscriptionId");
CREATE INDEX "subscriptions_userId_status_idx" ON "subscriptions"("userId", "status");
CREATE INDEX "subscriptions_userId_expirationDate_idx" ON "subscriptions"("userId", "expirationDate");

CREATE UNIQUE INDEX "payment_transactions_providerPaymentId_key" ON "payment_transactions"("providerPaymentId");
CREATE INDEX "payment_transactions_userId_createdAt_idx" ON "payment_transactions"("userId", "createdAt");
CREATE INDEX "payment_transactions_providerOrderId_idx" ON "payment_transactions"("providerOrderId");

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
