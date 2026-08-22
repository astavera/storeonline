-- Adds narrow, fail-closed routines for website-owned product package data.
-- Runtime never receives direct INSERT or UPDATE authority on ProductOverride.

CREATE OR REPLACE FUNCTION public.storefront_read_product_shipping_profiles_v1(
  p_square_variation_ids text[]
)
RETURNS TABLE (
  "squareVariationId" text,
  configured boolean,
  "isShippable" boolean,
  "packageLengthIn" text,
  "packageWidthIn" text,
  "packageHeightIn" text,
  "packageWeightLb" text,
  "shippingEnabled" boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $shipping_profiles$
  SELECT
    variation.id AS "squareVariationId",
    override_row.id IS NOT NULL AS configured,
    COALESCE(override_row."isShippable", true) AS "isShippable",
    override_row."packageLengthIn"::text AS "packageLengthIn",
    override_row."packageWidthIn"::text AS "packageWidthIn",
    override_row."packageHeightIn"::text AS "packageHeightIn",
    override_row."packageWeightLb"::text AS "packageWeightLb",
    COALESCE(
      override_row."webVisible"
      AND override_row."webStatus" = 'PUBLISHED'::public."ProductWebStatus"
      AND override_row."publishedAt" <= statement_timestamp()
      AND override_row."unpublishedAt" IS NULL
      AND override_row."shippingAllowed"
      AND override_row."isShippable"
      AND 'SHIPPING'::public."FulfillmentMode" = ANY(override_row."fulfillmentModes")
      AND override_row."packageLengthIn" > 0
      AND override_row."packageWidthIn" > 0
      AND override_row."packageHeightIn" > 0
      AND override_row."packageWeightLb" > 0,
      false
    ) AS "shippingEnabled"
  FROM (
    SELECT DISTINCT requested_id
    FROM unnest(p_square_variation_ids) AS requested(requested_id)
    WHERE requested_id IS NOT NULL AND btrim(requested_id) <> ''
      AND cardinality(p_square_variation_ids) <= 5000
    LIMIT 5000
  ) requested
  JOIN public."SquareItemVariation" variation ON variation.id = requested.requested_id
  LEFT JOIN public."ProductOverride" override_row
    ON override_row."squareVariationId" = variation.id;
$shipping_profiles$;

CREATE OR REPLACE FUNCTION public.storefront_admin_save_product_shipping_profile_v1(
  p_square_variation_id text,
  p_web_visible boolean,
  p_pickup_requested boolean,
  p_local_delivery_requested boolean,
  p_shipping_requested boolean,
  p_is_shippable boolean,
  p_package_length_in numeric,
  p_package_width_in numeric,
  p_package_height_in numeric,
  p_package_weight_lb numeric
)
RETURNS TABLE (
  "squareVariationId" text,
  configured boolean,
  "isShippable" boolean,
  "packageLengthIn" text,
  "packageWidthIn" text,
  "packageHeightIn" text,
  "packageWeightLb" text,
  "shippingEnabled" boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $save_shipping_profile$
#variable_conflict use_column
DECLARE
  v_now timestamptz := statement_timestamp();
  v_shipping_ready boolean;
  v_fulfillment_modes public."FulfillmentMode"[];
BEGIN
  IF p_square_variation_id IS NULL
    OR btrim(p_square_variation_id) = ''
    OR length(p_square_variation_id) > 160
  THEN
    RAISE EXCEPTION 'INVALID_SQUARE_VARIATION_ID' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public."SquareItemVariation" variation
    WHERE variation.id = p_square_variation_id
  ) THEN
    RAISE EXCEPTION 'SQUARE_VARIATION_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      p_package_length_in,
      p_package_width_in,
      p_package_height_in,
      p_package_weight_lb
    ]) AS package_value(value)
    WHERE value IS NOT NULL
      AND (value = 'NaN'::numeric OR value <= 0 OR value > 99999.999)
  ) THEN
    RAISE EXCEPTION 'INVALID_PRODUCT_PACKAGE_VALUE' USING ERRCODE = '22023';
  END IF;

  v_shipping_ready := COALESCE(p_web_visible
    AND p_shipping_requested
    AND p_is_shippable
    AND p_package_length_in > 0
    AND p_package_width_in > 0
    AND p_package_height_in > 0
    AND p_package_weight_lb > 0, false);

  v_fulfillment_modes := array_remove(ARRAY[
    CASE WHEN p_pickup_requested THEN 'PICKUP'::public."FulfillmentMode" END,
    CASE WHEN p_local_delivery_requested THEN 'LOCAL_DELIVERY'::public."FulfillmentMode" END,
    CASE WHEN p_shipping_requested THEN 'SHIPPING'::public."FulfillmentMode" END
  ], NULL);

  INSERT INTO public."ProductOverride" AS existing (
    id,
    "squareVariationId",
    "webVisible",
    "webStatus",
    "fulfillmentModes",
    "pickupAllowed",
    "localDeliveryAllowed",
    "shippingAllowed",
    "allowedLocationIds",
    "warehouseRequired",
    "isShippable",
    "packageLengthIn",
    "packageWidthIn",
    "packageHeightIn",
    "packageWeightLb",
    "publishedAt",
    "unpublishedAt",
    "createdAt",
    "updatedAt"
  ) VALUES (
    'shipping_' || md5(p_square_variation_id),
    p_square_variation_id,
    p_web_visible,
    CASE WHEN p_web_visible
      THEN 'PUBLISHED'::public."ProductWebStatus"
      ELSE 'HIDDEN'::public."ProductWebStatus"
    END,
    v_fulfillment_modes,
    p_pickup_requested,
    p_local_delivery_requested,
    v_shipping_ready,
    ARRAY[]::text[],
    p_shipping_requested,
    p_is_shippable,
    p_package_length_in,
    p_package_width_in,
    p_package_height_in,
    p_package_weight_lb,
    CASE WHEN p_web_visible THEN v_now ELSE NULL END,
    CASE WHEN p_web_visible THEN NULL ELSE v_now END,
    v_now,
    v_now
  )
  ON CONFLICT ("squareVariationId") DO UPDATE SET
    "webVisible" = EXCLUDED."webVisible",
    "webStatus" = EXCLUDED."webStatus",
    "fulfillmentModes" = EXCLUDED."fulfillmentModes",
    "pickupAllowed" = EXCLUDED."pickupAllowed",
    "localDeliveryAllowed" = EXCLUDED."localDeliveryAllowed",
    "shippingAllowed" = EXCLUDED."shippingAllowed",
    "warehouseRequired" = EXCLUDED."warehouseRequired",
    "isShippable" = EXCLUDED."isShippable",
    "packageLengthIn" = EXCLUDED."packageLengthIn",
    "packageWidthIn" = EXCLUDED."packageWidthIn",
    "packageHeightIn" = EXCLUDED."packageHeightIn",
    "packageWeightLb" = EXCLUDED."packageWeightLb",
    "publishedAt" = CASE
      WHEN p_web_visible THEN COALESCE(existing."publishedAt", v_now)
      ELSE existing."publishedAt"
    END,
    "unpublishedAt" = CASE
      WHEN p_web_visible THEN NULL
      ELSE COALESCE(existing."unpublishedAt", v_now)
    END,
    "updatedAt" = v_now;

  RETURN QUERY
    SELECT *
    FROM public.storefront_read_product_shipping_profiles_v1(ARRAY[p_square_variation_id]);
END;
$save_shipping_profile$;

REVOKE ALL PRIVILEGES ON FUNCTION public.storefront_read_product_shipping_profiles_v1(text[]) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION public.storefront_admin_save_product_shipping_profile_v1(
  text, boolean, boolean, boolean, boolean, boolean, numeric, numeric, numeric, numeric
) FROM PUBLIC;

DO $shipping_profile_acl$
BEGIN
  IF to_regrole('storefront_sync') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON FUNCTION public.storefront_read_product_shipping_profiles_v1(text[])
      FROM storefront_sync;
    REVOKE ALL PRIVILEGES ON FUNCTION public.storefront_admin_save_product_shipping_profile_v1(
      text, boolean, boolean, boolean, boolean, boolean, numeric, numeric, numeric, numeric
    ) FROM storefront_sync;
  END IF;

  IF to_regrole('storefront_runtime') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.storefront_read_product_shipping_profiles_v1(text[])
      TO storefront_runtime;
    GRANT EXECUTE ON FUNCTION public.storefront_admin_save_product_shipping_profile_v1(
      text, boolean, boolean, boolean, boolean, boolean, numeric, numeric, numeric, numeric
    ) TO storefront_runtime;
  END IF;
END
$shipping_profile_acl$;

COMMENT ON FUNCTION public.storefront_read_product_shipping_profiles_v1(text[])
  IS 'Returns only the physical shipping profile fields required by Storefront runtime.';
COMMENT ON FUNCTION public.storefront_admin_save_product_shipping_profile_v1(
  text, boolean, boolean, boolean, boolean, boolean, numeric, numeric, numeric, numeric
)
  IS 'Fail-closed admin mutation for one website-owned product shipping profile.';
