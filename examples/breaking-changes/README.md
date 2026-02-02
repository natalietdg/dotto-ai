# Breaking Changes (for feature branch)

These files contain breaking changes that trigger dotto governance.

## Usage

1. Create a feature branch:

   ```bash
   git checkout -b feature/payment-v2
   ```

2. Copy these files to overwrite the stable versions:

   ```bash
   cp examples/breaking-changes/PaymentSchema.ts schemas/PaymentSchema.ts
   ```

3. Run dotto to detect drift:

   ```bash
   npx dotto scan
   ```

4. The governance UI will show the breaking changes and require human authorization.

## Breaking Changes Summary

### PaymentSchema.ts

- `userId` → `customerId` (renamed)
- `amount: number` → `amount: PaymentAmount` (type changed)
- `status` enum values changed
- `metadata` now required (was optional)
- New required field: `idempotencyKey`
- New required field: `merchantId` in metadata
- `PaymentMethod.expiryDate` split into `expiryMonth` + `expiryYear`
- New required field: `billingAddress` on PaymentMethod
