export type ProductDisplayRule = {
  webVisible: boolean;
  hasSquareVariation: boolean;
  hasApprovedFulfillmentMode: boolean;
};

export function isProductDisplayable(rule: ProductDisplayRule) {
  return rule.webVisible && rule.hasSquareVariation && rule.hasApprovedFulfillmentMode;
}
