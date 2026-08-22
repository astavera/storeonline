-- Canonical PostgreSQL/Supabase ACL bootstrap for the Storefront application.
--
-- Run this file as the database owner (the Supabase `postgres` role) through a
-- direct or session-pooler connection. It is intentionally credential-free:
-- new LOGIN roles have no usable password until the operator sets one with
-- psql's \password command. Existing passwords are never changed.
--
-- This script is safe to run before migrations and idempotent to rerun after
-- migrations. The post-migration rerun is required to install grants on newly
-- created relations. verify-storefront-roles.sql is the release gate.

BEGIN;

DO $bootstrap_roles$
DECLARE
  target_role_names CONSTANT text[] := ARRAY[
    'storefront_migrator',
    'storefront_sync',
    'storefront_runtime'
  ];
  target_role_name text;
  inherited_role record;
  role_member record;
  operator_can_manage_roles boolean;
BEGIN
  IF current_user = ANY(target_role_names) THEN
    RAISE EXCEPTION 'Run the Storefront ACL bootstrap as the database owner, not as %.', current_user;
  END IF;

  SELECT rolsuper OR rolcreaterole
  INTO operator_can_manage_roles
  FROM pg_roles
  WHERE rolname = current_user;

  IF NOT COALESCE(operator_can_manage_roles, false) THEN
    RAISE EXCEPTION 'Role % cannot create or harden the Storefront roles.', current_user;
  END IF;

  IF to_regnamespace('public') IS NULL THEN
    RAISE EXCEPTION 'Schema public does not exist in database %.', current_database();
  END IF;

  FOREACH target_role_name IN ARRAY target_role_names LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role_name) THEN
      EXECUTE format(
        'CREATE ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
        target_role_name
      );
    END IF;

    EXECUTE format(
      'ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT -1',
      target_role_name
    );
    EXECUTE format('ALTER ROLE %I RESET ALL', target_role_name);

    -- A previously reused role must not retain privileges through membership.
    FOR inherited_role IN
      SELECT granted.rolname
      FROM pg_auth_members membership
      JOIN pg_roles member ON member.oid = membership.member
      JOIN pg_roles granted ON granted.oid = membership.roleid
      WHERE member.rolname = target_role_name
    LOOP
      EXECUTE format('REVOKE %I FROM %I', inherited_role.rolname, target_role_name);
    END LOOP;

    -- Remove accounts that could assume a reused application identity. The
    -- database owner is the sole intentional migrator member; sync/runtime
    -- have no members outside the short DROP OWNED cleanup below.
    FOR role_member IN
      SELECT member.rolname
      FROM pg_auth_members membership
      JOIN pg_roles member ON member.oid = membership.member
      JOIN pg_roles granted ON granted.oid = membership.roleid
      WHERE granted.rolname = target_role_name
        AND (
          target_role_name <> 'storefront_migrator'
          OR member.rolname <> current_user
        )
    LOOP
      EXECUTE format(
        'REVOKE %I FROM %I CASCADE',
        target_role_name,
        role_member.rolname
      );
    END LOOP;
  END LOOP;
END
$bootstrap_roles$;

ALTER ROLE storefront_migrator SET search_path = public, pg_catalog;
ALTER ROLE storefront_migrator SET lock_timeout = '15s';
ALTER ROLE storefront_migrator SET idle_in_transaction_session_timeout = '5min';
ALTER ROLE storefront_migrator SET row_security = on;

ALTER ROLE storefront_sync SET search_path = public, pg_catalog;
ALTER ROLE storefront_sync SET statement_timeout = '2min';
ALTER ROLE storefront_sync SET lock_timeout = '10s';
ALTER ROLE storefront_sync SET idle_in_transaction_session_timeout = '2min';
ALTER ROLE storefront_sync SET row_security = on;

ALTER ROLE storefront_runtime SET search_path = public, pg_catalog;
ALTER ROLE storefront_runtime SET statement_timeout = '15s';
ALTER ROLE storefront_runtime SET lock_timeout = '5s';
ALTER ROLE storefront_runtime SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE storefront_runtime SET row_security = on;

DO $database_acl$
BEGIN
  EXECUTE format(
    'REVOKE ALL PRIVILEGES ON DATABASE %I FROM storefront_migrator, storefront_sync, storefront_runtime CASCADE',
    current_database()
  );
  EXECUTE format(
    'GRANT CONNECT ON DATABASE %I TO storefront_migrator',
    current_database()
  );
END
$database_acl$;

-- This deployment uses direct PostgreSQL only. Remove PUBLIC schema access so
-- Supabase Data API roles cannot regain USAGE through their implicit PUBLIC
-- membership. Supabase platform schemas such as auth and storage are untouched.
REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SCHEMA public FROM storefront_migrator, storefront_sync, storefront_runtime CASCADE;
GRANT USAGE, CREATE ON SCHEMA public TO storefront_migrator;

DO $supabase_data_api_schema_acl$
DECLARE
  data_api_role_name text;
BEGIN
  FOREACH data_api_role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = data_api_role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON SCHEMA public FROM %I', data_api_role_name);
    END IF;
  END LOOP;
END
$supabase_data_api_schema_acl$;

DO $application_objects$
DECLARE
  prisma_table_names CONSTANT text[] := ARRAY[
    'StoreLocation',
    'SquareCatalogObject',
    'SquareItemVariation',
    'SquareInventoryCount',
    'SquareCatalogSyncState',
    'Department',
    'Holiday',
    'WebsiteBrand',
    'ProductBrandAssignment',
    'ProductDepartmentAssignment',
    'ProductHolidayAssignment',
    'ProductOverride',
    'WebsiteProductPlacement',
    'ProductPlacementRule',
    'CmsContentVersion',
    'MediaAsset',
    'ProductImagePreference',
    'Cart',
    'CartItem',
    'OrderMirror',
    'OrderItemMirror',
    'FulfillmentTask',
    'DeliveryZone',
    'SlotTemplate',
    'SlotHold',
    'ShippingRateQuote',
    'TaxNexusRule',
    'TaxQuote',
    'WebhookEvent',
    'CheckoutAttempt',
    'WebhookInboxEvent',
    'AdminRateLimitBucket',
    'SlotOccurrence',
    'CapacityHold',
    'DeliveryZoneVersion',
    'DeliveryRateRule',
    'AddressEvaluation',
    'BalloonOrderDraft',
    'BalloonDraftLine',
    'BalloonQuote',
    'ReturnVerificationSession',
    'ReturnRequest',
    'ReturnRequestItem',
    'ReturnStatusEvent',
    'CustomerAccount',
    'CustomerLoginChallenge',
    'CustomerSession',
    'CustomerConsentEvent',
    'AdminUser',
    'AuditLog'
  ];
  prisma_type_names CONSTANT text[] := ARRAY[
    'FulfillmentMode',
    'FulfillmentStatus',
    'AdminRole',
    'CmsPublishStatus',
    'ProductWebStatus',
    'ProductPlacementType',
    'DescriptionSource',
    'DescriptionStatus',
    'CheckoutAttemptStatus',
    'TaxQuoteStatus',
    'TaxApplicationMode',
    'TaxNexusDecision',
    'WebhookInboxStatus',
    'CapacityHoldStatus',
    'BalloonDraftStatus',
    'BalloonQuoteStatus',
    'ReturnRequestStatus',
    'ReturnLineDecision',
    'ReturnLabelPayer'
  ];
  runtime_select_table_names CONSTANT text[] := ARRAY[
    'StoreLocation',
    'SquareCatalogObject',
    'SquareItemVariation',
    'SquareInventoryCount',
    'SquareCatalogSyncState',
    'ProductOverride',
    'CmsContentVersion',
    'OrderMirror',
    'TaxQuote',
    'CheckoutAttempt',
    'AdminRateLimitBucket'
  ];
  runtime_usage_type_names CONSTANT text[] := ARRAY[
    'CmsPublishStatus',
    'CheckoutAttemptStatus',
    'FulfillmentMode',
    'TaxQuoteStatus',
    'TaxApplicationMode',
    'TaxNexusDecision'
  ];
  sync_projection_table_names CONSTANT text[] := ARRAY[
    'SquareCatalogObject',
    'SquareItemVariation',
    'SquareInventoryCount',
    'SquareCatalogSyncState'
  ];
  sync_support_select_table_names CONSTANT text[] := ARRAY[
    'StoreLocation',
    'AuditLog'
  ];
  supabase_data_api_role_names CONSTANT text[] := ARRAY[
    'anon',
    'authenticated',
    'service_role'
  ];
  managed_table_names text[] := prisma_table_names || ARRAY['_prisma_migrations'];
  object_name text;
  column_names text;
  data_api_role_name text;
  routine_record record;
  operator_is_direct_member boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
    WHERE granted.rolname = 'storefront_migrator'
      AND member.rolname = current_user
  )
  INTO operator_is_direct_member;

  IF NOT operator_is_direct_member THEN
    EXECUTE format('GRANT storefront_migrator TO %I', current_user);
  END IF;
  EXECUTE format(
    'REVOKE ADMIN OPTION FOR storefront_migrator FROM %I',
    current_user
  );

  IF EXISTS (
    WITH RECURSIVE migrator_members(member_oid) AS (
      SELECT membership.member
      FROM pg_auth_members membership
      JOIN pg_roles granted ON granted.oid = membership.roleid
      WHERE granted.rolname = 'storefront_migrator'
      UNION
      SELECT membership.member
      FROM pg_auth_members membership
      JOIN migrator_members parent_member
        ON parent_member.member_oid = membership.roleid
    )
    SELECT 1
    FROM migrator_members
    JOIN pg_roles member ON member.oid = migrator_members.member_oid
    WHERE member.rolname <> current_user
  ) THEN
    RAISE EXCEPTION
      'Only database operator % may be a direct or indirect member of storefront_migrator.',
      current_user;
  END IF;

  FOREACH object_name IN ARRAY managed_table_names LOOP
    IF to_regclass(format('%I.%I', 'public', object_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I OWNER TO storefront_migrator', 'public', object_name);
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM PUBLIC', 'public', object_name);
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM storefront_sync, storefront_runtime CASCADE',
        'public',
        object_name
      );
      SELECT string_agg(format('%I', attribute.attname), ', ' ORDER BY attribute.attnum)
      INTO column_names
      FROM pg_attribute attribute
      WHERE attribute.attrelid = to_regclass(format('%I.%I', 'public', object_name))
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped;
      IF column_names IS NOT NULL THEN
        EXECUTE format(
          'REVOKE SELECT (%1$s), INSERT (%1$s), UPDATE (%1$s), REFERENCES (%1$s) '
          || 'ON TABLE %2$I.%3$I FROM PUBLIC, storefront_sync, storefront_runtime CASCADE',
          column_names,
          'public',
          object_name
        );
      END IF;
      FOREACH data_api_role_name IN ARRAY supabase_data_api_role_names LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = data_api_role_name) THEN
          EXECUTE format(
            'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I CASCADE',
            'public',
            object_name,
            data_api_role_name
          );
          IF column_names IS NOT NULL THEN
            EXECUTE format(
              'REVOKE SELECT (%1$s), INSERT (%1$s), UPDATE (%1$s), REFERENCES (%1$s) '
              || 'ON TABLE %2$I.%3$I FROM %4$I CASCADE',
              column_names,
              'public',
              object_name,
              data_api_role_name
            );
          END IF;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  FOREACH object_name IN ARRAY prisma_type_names LOOP
    IF to_regtype(format('%I.%I', 'public', object_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TYPE %I.%I OWNER TO storefront_migrator', 'public', object_name);
      EXECUTE format('REVOKE ALL PRIVILEGES ON TYPE %I.%I FROM PUBLIC', 'public', object_name);
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TYPE %I.%I FROM storefront_sync, storefront_runtime CASCADE',
        'public',
        object_name
      );
      FOREACH data_api_role_name IN ARRAY supabase_data_api_role_names LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = data_api_role_name) THEN
          EXECUTE format(
            'REVOKE ALL PRIVILEGES ON TYPE %I.%I FROM %I CASCADE',
            'public',
            object_name,
            data_api_role_name
          );
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- Prisma currently uses application-generated identifiers, so it has no
  -- application sequences. Keep any future migrator-owned sequence closed.
  FOR object_name IN
    SELECT relation.relname
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_roles owner_role ON owner_role.oid = relation.relowner
    WHERE namespace.nspname = 'public'
      AND relation.relkind = 'S'
      AND owner_role.rolname = 'storefront_migrator'
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %I.%I FROM PUBLIC', 'public', object_name);
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON SEQUENCE %I.%I FROM storefront_sync, storefront_runtime CASCADE',
      'public',
      object_name
    );
    FOREACH data_api_role_name IN ARRAY supabase_data_api_role_names LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = data_api_role_name) THEN
        EXECUTE format(
          'REVOKE ALL PRIVILEGES ON SEQUENCE %I.%I FROM %I CASCADE',
          'public',
          object_name,
          data_api_role_name
        );
      END IF;
    END LOOP;
  END LOOP;

  -- Prisma has no current routines, but a future SQL migration may create one.
  -- Close every public routine owned by the migrator before granting nothing.
  FOR routine_record IN
    SELECT
      namespace.nspname,
      routine.proname,
      pg_get_function_identity_arguments(routine.oid) AS identity_arguments
    FROM pg_proc routine
    JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.proowner = (SELECT oid FROM pg_roles WHERE rolname = 'storefront_migrator')
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON ROUTINE %I.%I(%s) FROM PUBLIC, storefront_sync, storefront_runtime CASCADE',
      routine_record.nspname,
      routine_record.proname,
      routine_record.identity_arguments
    );
    FOREACH data_api_role_name IN ARRAY supabase_data_api_role_names LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = data_api_role_name) THEN
        EXECUTE format(
          'REVOKE ALL PRIVILEGES ON ROUTINE %I.%I(%s) FROM %I CASCADE',
          routine_record.nspname,
          routine_record.proname,
          routine_record.identity_arguments,
          data_api_role_name
        );
      END IF;
    END LOOP;
  END LOOP;

  -- DROP OWNED is the only complete, catalog-supported way to clear stale
  -- grants held by a reused role across every schema and object class. Prove
  -- first that it cannot delete application/platform objects. A default-ACL
  -- row is safe and desirable for DROP OWNED to remove.
  IF EXISTS (
    SELECT 1
    FROM pg_shdepend ownership_dependency
    JOIN pg_roles owner_role ON owner_role.oid = ownership_dependency.refobjid
    WHERE ownership_dependency.refclassid = 'pg_catalog.pg_authid'::regclass
      AND ownership_dependency.deptype = 'o'
      AND ownership_dependency.dbid = (
        SELECT database_entry.oid
        FROM pg_database database_entry
        WHERE database_entry.datname = current_database()
      )
      AND ownership_dependency.classid <> 'pg_catalog.pg_default_acl'::regclass
      AND owner_role.rolname = ANY(ARRAY['storefront_sync', 'storefront_runtime'])
  ) OR EXISTS (
    SELECT 1
    FROM pg_database database_entry
    JOIN pg_roles owner_role ON owner_role.oid = database_entry.datdba
    WHERE owner_role.rolname = ANY(ARRAY['storefront_sync', 'storefront_runtime'])
  ) OR EXISTS (
    SELECT 1
    FROM pg_tablespace tablespace_entry
    JOIN pg_roles owner_role ON owner_role.oid = tablespace_entry.spcowner
    WHERE owner_role.rolname = ANY(ARRAY['storefront_sync', 'storefront_runtime'])
  ) THEN
    RAISE EXCEPTION
      'Restricted Storefront roles own objects; reassign them before the ACL bootstrap can safely clean stale grants.';
  END IF;

  EXECUTE format(
    'GRANT storefront_runtime, storefront_sync TO %I',
    current_user
  );

  DROP OWNED BY storefront_runtime, storefront_sync RESTRICT;

  EXECUTE format(
    'REVOKE storefront_runtime, storefront_sync FROM %I',
    current_user
  );

  EXECUTE format(
    'GRANT CONNECT ON DATABASE %I TO storefront_sync, storefront_runtime',
    current_database()
  );
  GRANT USAGE ON SCHEMA public TO storefront_sync, storefront_runtime;

  -- New migration objects remain inaccessible until this reviewed manifest is
  -- updated and the bootstrap is rerun. The database owner keeps membership in
  -- storefront_migrator: Supabase's postgres role is intentionally not a true
  -- superuser and needs this membership to inspect and manage migrator-owned
  -- objects in the Dashboard and in later operator sessions.
  -- These are global defaults for objects created by storefront_migrator.
  -- PostgreSQL schema-local REVOKE cannot subtract a global or built-in
  -- default (notably PUBLIC EXECUTE on functions and USAGE on types).
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE storefront_migrator '
    || 'REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE storefront_migrator '
    || 'REVOKE ALL PRIVILEGES ON TABLES FROM storefront_sync, storefront_runtime';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE storefront_migrator '
    || 'REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, storefront_sync, storefront_runtime';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE storefront_migrator '
    || 'REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, storefront_sync, storefront_runtime';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE storefront_migrator '
    || 'REVOKE USAGE ON TYPES FROM PUBLIC, storefront_sync, storefront_runtime';

  -- Schema-local defaults are additive. Clear any prior local grants as well
  -- as the global defaults above, while leaving postgres-owned Supabase
  -- platform defaults untouched.
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE storefront_migrator IN SCHEMA public '
    || 'REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, storefront_sync, storefront_runtime';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE storefront_migrator IN SCHEMA public '
    || 'REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, storefront_sync, storefront_runtime';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE storefront_migrator IN SCHEMA public '
    || 'REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, storefront_sync, storefront_runtime';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE storefront_migrator IN SCHEMA public '
    || 'REVOKE USAGE ON TYPES FROM PUBLIC, storefront_sync, storefront_runtime';

  FOREACH data_api_role_name IN ARRAY supabase_data_api_role_names LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = data_api_role_name) THEN
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE storefront_migrator REVOKE ALL PRIVILEGES ON TABLES FROM %I',
        data_api_role_name
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE storefront_migrator REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
        data_api_role_name
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE storefront_migrator REVOKE EXECUTE ON FUNCTIONS FROM %I',
        data_api_role_name
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE storefront_migrator REVOKE USAGE ON TYPES FROM %I',
        data_api_role_name
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE storefront_migrator IN SCHEMA public '
        || 'REVOKE ALL PRIVILEGES ON TABLES FROM %I',
        data_api_role_name
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE storefront_migrator IN SCHEMA public '
        || 'REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
        data_api_role_name
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE storefront_migrator IN SCHEMA public '
        || 'REVOKE EXECUTE ON FUNCTIONS FROM %I',
        data_api_role_name
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE storefront_migrator IN SCHEMA public '
        || 'REVOKE USAGE ON TYPES FROM %I',
        data_api_role_name
      );
    END IF;
  END LOOP;

  FOREACH object_name IN ARRAY runtime_select_table_names LOOP
    IF to_regclass(format('%I.%I', 'public', object_name)) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT ON TABLE %I.%I TO storefront_runtime', 'public', object_name);
    END IF;
  END LOOP;

  IF to_regclass('public."AdminRateLimitBucket"') IS NOT NULL THEN
    GRANT INSERT ON TABLE public."AdminRateLimitBucket" TO storefront_runtime;
    GRANT UPDATE ("count", "expiresAt", "updatedAt")
      ON TABLE public."AdminRateLimitBucket" TO storefront_runtime;
  END IF;

  IF to_regclass('public."CheckoutAttempt"') IS NOT NULL THEN
    GRANT INSERT ON TABLE public."CheckoutAttempt" TO storefront_runtime;
    GRANT UPDATE (
      "status", "fulfillmentMode", "squareOrderId", "squarePaymentLinkId",
      "orderproShippingOrderId", "shippingContext", "taxQuoteId", "taxContext",
      "hostedCheckoutCreatedAt", "updatedAt"
    ) ON TABLE public."CheckoutAttempt" TO storefront_runtime;
  END IF;

  IF to_regclass('public."TaxQuote"') IS NOT NULL THEN
    GRANT INSERT ON TABLE public."TaxQuote" TO storefront_runtime;
    GRANT UPDATE (
      "status", "consumedAt", "invalidatedAt", "providerTransactionId",
      "providerReportedAt", "updatedAt"
    ) ON TABLE public."TaxQuote" TO storefront_runtime;
  END IF;

  IF to_regclass('public."OrderMirror"') IS NOT NULL THEN
    GRANT INSERT ON TABLE public."OrderMirror" TO storefront_runtime;
    GRANT UPDATE (
      "squarePaymentId", "currency", "totalMoney", "status",
      "estimatedMerchandiseSubtotalCents", "estimatedDiscountCents",
      "estimatedShippingFeeCents", "estimatedDeliveryFeeCents",
      "estimatedMerchandiseTaxCents", "estimatedShippingTaxCents",
      "estimatedDeliveryFeeTaxCents", "estimatedTotalTaxCents", "estimatedTotalCents",
      "finalMerchandiseSubtotalCents", "finalDiscountCents", "finalShippingFeeCents",
      "finalDeliveryFeeCents", "finalMerchandiseTaxCents", "finalShippingTaxCents",
      "finalDeliveryFeeTaxCents", "finalTotalTaxCents", "finalTotalCents",
      "taxProvider", "taxApplicationMode", "squareTaxSnapshot",
      "squareFinancialSnapshot", "taxReconciledAt", "updatedAt"
    ) ON TABLE public."OrderMirror" TO storefront_runtime;
  END IF;

  FOREACH object_name IN ARRAY runtime_usage_type_names LOOP
    IF to_regtype(format('%I.%I', 'public', object_name)) IS NOT NULL THEN
      EXECUTE format('GRANT USAGE ON TYPE %I.%I TO storefront_runtime', 'public', object_name);
    END IF;
  END LOOP;

  FOREACH object_name IN ARRAY sync_projection_table_names LOOP
    IF to_regclass(format('%I.%I', 'public', object_name)) IS NOT NULL THEN
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE ON TABLE %I.%I TO storefront_sync',
        'public',
        object_name
      );
    END IF;
  END LOOP;

  FOREACH object_name IN ARRAY sync_support_select_table_names LOOP
    IF to_regclass(format('%I.%I', 'public', object_name)) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT ON TABLE %I.%I TO storefront_sync', 'public', object_name);
    END IF;
  END LOOP;

  IF to_regclass('public."StoreLocation"') IS NOT NULL THEN
    GRANT UPDATE ("squareLocationId", "updatedAt")
      ON TABLE public."StoreLocation" TO storefront_sync;
  END IF;

  IF to_regclass('public."AuditLog"') IS NOT NULL THEN
    GRANT INSERT ON TABLE public."AuditLog" TO storefront_sync;
  END IF;

END
$application_objects$;

COMMIT;
