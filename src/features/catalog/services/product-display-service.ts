/**
 * Implements the product display service workflow for the catalog feature.
 */

export type ProductDisplayRule = {
  webVisible: boolean;
  hasSquareVariation: boolean;
  hasApprovedFulfillmentMode: boolean;
};

export function isProductDisplayable(rule: ProductDisplayRule) {
  return rule.webVisible && rule.hasSquareVariation && rule.hasApprovedFulfillmentMode;
}
