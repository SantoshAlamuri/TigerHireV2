/**
 * Legacy DocuSign void hook — native signing has no provider envelope; kept as a no-op
 * so existing call sites do not need churn.
 */
export function fireAndForgetVoidOfferEnvelope(_offer: { id: string }, _reason: string): void {
  void _offer;
  void _reason;
}
