BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE "Holiday" VALIDATE CONSTRAINT "Holiday_date_range_check";
ALTER TABLE "ProductDepartmentAssignment" VALIDATE CONSTRAINT "ProductDepartmentAssignment_sort_order_check";
ALTER TABLE "ProductHolidayAssignment" VALIDATE CONSTRAINT "ProductHolidayAssignment_sort_order_check";
ALTER TABLE "WebsiteBrand" VALIDATE CONSTRAINT "WebsiteBrand_sort_order_check";
ALTER TABLE "ProductBrandAssignment" VALIDATE CONSTRAINT "ProductBrandAssignment_sort_order_check";
ALTER TABLE "ProductOverride" VALIDATE CONSTRAINT "ProductOverride_capacity_check";
ALTER TABLE "ProductOverride" VALIDATE CONSTRAINT "ProductOverride_schedule_range_check";
ALTER TABLE "ProductOverride" VALIDATE CONSTRAINT "ProductOverride_visibility_status_check";
ALTER TABLE "WebsiteProductPlacement" VALIDATE CONSTRAINT "WebsiteProductPlacement_date_range_check";
ALTER TABLE "WebsiteProductPlacement" VALIDATE CONSTRAINT "WebsiteProductPlacement_sort_order_check";
ALTER TABLE "CmsContentVersion" VALIDATE CONSTRAINT "CmsContentVersion_version_check";
ALTER TABLE "CmsContentVersion" VALIDATE CONSTRAINT "CmsContentVersion_schedule_range_check";
ALTER TABLE "CmsContentVersion" VALIDATE CONSTRAINT "CmsContentVersion_published_state_check";
ALTER TABLE "MediaAsset" VALIDATE CONSTRAINT "MediaAsset_dimensions_check";
ALTER TABLE "CartItem" VALIDATE CONSTRAINT "CartItem_quantity_check";
ALTER TABLE "OrderItemMirror" VALIDATE CONSTRAINT "OrderItemMirror_quantity_check";
ALTER TABLE "FulfillmentTask" VALIDATE CONSTRAINT "FulfillmentTask_capacity_check";
ALTER TABLE "FulfillmentTask" VALIDATE CONSTRAINT "FulfillmentTask_address_mode_check";
ALTER TABLE "DeliveryZone" VALIDATE CONSTRAINT "DeliveryZone_nonnegative_values_check";
ALTER TABLE "SlotTemplate" VALIDATE CONSTRAINT "SlotTemplate_values_check";
ALTER TABLE "SlotHold" VALIDATE CONSTRAINT "SlotHold_values_check";
ALTER TABLE "ShippingRateQuote" VALIDATE CONSTRAINT "ShippingRateQuote_values_check";
ALTER TABLE "WebhookInboxEvent" VALIDATE CONSTRAINT "WebhookInboxEvent_processing_lease_check";
ALTER TABLE "WebhookInboxEvent" VALIDATE CONSTRAINT "WebhookInboxEvent_retry_schedule_check";

COMMIT;
