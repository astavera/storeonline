-- The isolated Square sandbox uses a namespaced runtime role. Production keeps
-- using storefront_runtime. Grant only the two narrow shipping profile routines.

DO $shipping_profile_sandbox_acl$
BEGIN
  IF to_regrole('storefront_sandbox_runtime') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.storefront_read_product_shipping_profiles_v1(text[])
      TO storefront_sandbox_runtime;
    GRANT EXECUTE ON FUNCTION public.storefront_admin_save_product_shipping_profile_v1(
      text, boolean, boolean, boolean, boolean, boolean, numeric, numeric, numeric, numeric
    ) TO storefront_sandbox_runtime;
  END IF;
END
$shipping_profile_sandbox_acl$;
