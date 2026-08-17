-- Read-only release gate for bootstrap-storefront-roles.sql.
-- Run with ON_ERROR_STOP=1 after every Prisma migration and ACL bootstrap.

BEGIN TRANSACTION READ ONLY;

DO $verify_storefront_roles$
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
    'CmsContentVersion',
    'AdminRateLimitBucket'
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
  target_role_names CONSTANT text[] := ARRAY['storefront_runtime', 'storefront_sync'];
  column_privilege_names CONSTANT text[] := ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'];
  table_only_privilege_names CONSTANT text[] := ARRAY['DELETE', 'TRUNCATE', 'TRIGGER'];
  column_grant_option_names CONSTANT text[] := ARRAY[
    'SELECT WITH GRANT OPTION',
    'INSERT WITH GRANT OPTION',
    'UPDATE WITH GRANT OPTION',
    'REFERENCES WITH GRANT OPTION'
  ];
  table_only_grant_option_names CONSTANT text[] := ARRAY[
    'DELETE WITH GRANT OPTION',
    'TRUNCATE WITH GRANT OPTION',
    'TRIGGER WITH GRANT OPTION'
  ];
  role_name text;
  object_name text;
  privilege_name text;
  object_oid oid;
  migrator_oid oid;
  restricted_role_oids oid[];
  existing_data_api_role_names text[];
  data_api_role_oids oid[];
  actual_privilege boolean;
  expected_privilege boolean;
  public_privilege_exists boolean;
  role_record record;
  schema_record record;
  relation_record record;
  column_record record;
  type_record record;
  routine_record record;
  default_acl aclitem[];
  default_object_type "char";
BEGIN
  SELECT oid INTO migrator_oid FROM pg_roles WHERE rolname = 'storefront_migrator';
  IF migrator_oid IS NULL THEN
    RAISE EXCEPTION 'Missing role storefront_migrator.';
  END IF;

  SELECT array_agg(oid ORDER BY rolname)
  INTO restricted_role_oids
  FROM pg_roles
  WHERE rolname = ANY(target_role_names);
  IF COALESCE(array_length(restricted_role_oids, 1), 0) <> array_length(target_role_names, 1) THEN
    RAISE EXCEPTION 'One or more restricted Storefront roles are missing.';
  END IF;

  SELECT
    COALESCE(array_agg(rolname ORDER BY rolname), ARRAY[]::text[]),
    COALESCE(array_agg(oid ORDER BY rolname), ARRAY[]::oid[])
  INTO existing_data_api_role_names, data_api_role_oids
  FROM pg_roles
  WHERE rolname = ANY(supabase_data_api_role_names);

  FOREACH role_name IN ARRAY ARRAY['storefront_migrator', 'storefront_sync', 'storefront_runtime'] LOOP
    SELECT * INTO role_record FROM pg_roles WHERE rolname = role_name;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Missing role %.', role_name;
    END IF;
    IF NOT role_record.rolcanlogin
      OR role_record.rolsuper
      OR role_record.rolcreatedb
      OR role_record.rolcreaterole
      OR role_record.rolinherit
      OR role_record.rolreplication
      OR role_record.rolbypassrls
    THEN
      RAISE EXCEPTION 'Role % has unsafe role attributes.', role_name;
    END IF;
    IF EXISTS (
      SELECT 1
      FROM pg_auth_members membership
      JOIN pg_roles member ON member.oid = membership.member
      WHERE member.rolname = role_name
    ) THEN
      RAISE EXCEPTION 'Role % inherits privileges through a role membership.', role_name;
    END IF;
    IF NOT has_database_privilege(role_name, current_database(), 'CONNECT') THEN
      RAISE EXCEPTION 'Role % cannot connect to database %.', role_name, current_database();
    END IF;
    IF has_database_privilege(role_name, current_database(), 'CREATE') THEN
      RAISE EXCEPTION 'Role % can create schemas in database %.', role_name, current_database();
    END IF;
  END LOOP;

  FOREACH role_name IN ARRAY target_role_names LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_auth_members membership
      JOIN pg_roles granted ON granted.oid = membership.roleid
      WHERE granted.rolname = role_name
    ) THEN
      RAISE EXCEPTION 'Restricted role % must not be granted to any member.', role_name;
    END IF;
  END LOOP;

  IF (
    SELECT count(*)
    FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid = membership.roleid
    WHERE granted.rolname = 'storefront_migrator'
  ) <> 1 OR NOT EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
    WHERE granted.rolname = 'storefront_migrator'
      AND member.rolname = current_user
      AND NOT membership.admin_option
  ) THEN
    RAISE EXCEPTION
      'Database operator % must be the sole direct non-admin member of storefront_migrator.',
      current_user;
  END IF;

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
      'A role other than database operator % is an indirect storefront_migrator member.',
      current_user;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_database database_entry
    WHERE database_entry.datname = current_database()
      AND database_entry.datdba = ANY(restricted_role_oids)
  ) OR EXISTS (
    SELECT 1 FROM pg_namespace namespace WHERE namespace.nspowner = ANY(restricted_role_oids)
  ) OR EXISTS (
    SELECT 1 FROM pg_class relation WHERE relation.relowner = ANY(restricted_role_oids)
  ) OR EXISTS (
    SELECT 1 FROM pg_type type_entry WHERE type_entry.typowner = ANY(restricted_role_oids)
  ) OR EXISTS (
    SELECT 1 FROM pg_proc routine WHERE routine.proowner = ANY(restricted_role_oids)
  ) THEN
    RAISE EXCEPTION 'Restricted Storefront roles own database objects.';
  END IF;

  IF NOT has_schema_privilege('storefront_migrator', 'public', 'USAGE')
    OR NOT has_schema_privilege('storefront_migrator', 'public', 'CREATE')
  THEN
    RAISE EXCEPTION 'storefront_migrator does not have the required public schema authority.';
  END IF;

  SELECT namespace.nspowner, namespace.nspacl
  INTO schema_record
  FROM pg_namespace namespace
  WHERE namespace.nspname = 'public';
  IF EXISTS (
    SELECT 1
    FROM aclexplode(COALESCE(schema_record.nspacl, acldefault('n', schema_record.nspowner))) acl
    WHERE acl.grantee = 0
  ) THEN
    RAISE EXCEPTION 'Schema public grants privileges to PUBLIC.';
  END IF;

  FOREACH role_name IN ARRAY target_role_names LOOP
    IF NOT has_schema_privilege(role_name, 'public', 'USAGE')
      OR has_schema_privilege(role_name, 'public', 'CREATE')
      OR has_schema_privilege(role_name, 'public', 'USAGE WITH GRANT OPTION')
      OR has_schema_privilege(role_name, 'public', 'CREATE WITH GRANT OPTION')
    THEN
      RAISE EXCEPTION
        'Role % must have non-grantable USAGE, no CREATE, and no grant options on schema public.',
        role_name;
    END IF;
  END LOOP;

  FOREACH role_name IN ARRAY existing_data_api_role_names LOOP
    IF has_schema_privilege(role_name, 'public', 'USAGE')
      OR has_schema_privilege(role_name, 'public', 'CREATE')
    THEN
      RAISE EXCEPTION 'Supabase Data API role % can access schema public.', role_name;
    END IF;
  END LOOP;

  FOREACH object_name IN ARRAY managed_table_names LOOP
    object_oid := to_regclass(format('%I.%I', 'public', object_name));
    IF object_oid IS NULL THEN
      RAISE EXCEPTION 'Required migrated table public.% is missing.', object_name;
    END IF;

    SELECT relation.relowner, relation.relacl
    INTO relation_record
    FROM pg_class relation
    WHERE relation.oid = object_oid;

    IF relation_record.relowner <> migrator_oid THEN
      RAISE EXCEPTION 'Table public.% is not owned by storefront_migrator.', object_name;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM aclexplode(COALESCE(relation_record.relacl, acldefault('r', relation_record.relowner))) acl
      WHERE acl.grantee = 0
    )
    INTO public_privilege_exists;
    IF public_privilege_exists THEN
      RAISE EXCEPTION 'Table public.% grants privileges to PUBLIC.', object_name;
    END IF;

    FOREACH role_name IN ARRAY target_role_names LOOP
      FOR column_record IN
        SELECT attribute.attname AS column_name, attribute.attacl AS column_acl
        FROM pg_attribute attribute
        WHERE attribute.attrelid = object_oid
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
        ORDER BY attribute.attnum
      LOOP
        IF column_record.column_acl IS NOT NULL AND EXISTS (
          SELECT 1 FROM aclexplode(column_record.column_acl) acl WHERE acl.grantee = 0
        ) THEN
          RAISE EXCEPTION 'Column public.%.% grants privileges to PUBLIC.',
            object_name, column_record.column_name;
        END IF;

        FOREACH privilege_name IN ARRAY column_privilege_names LOOP
          IF role_name = 'storefront_runtime' THEN
            expected_privilege :=
              (privilege_name = 'SELECT' AND object_name = ANY(runtime_select_table_names))
              OR (privilege_name = 'INSERT' AND object_name = 'AdminRateLimitBucket')
              OR (
                privilege_name = 'UPDATE'
                AND object_name = 'AdminRateLimitBucket'
                AND column_record.column_name = ANY(ARRAY['count', 'expiresAt', 'updatedAt'])
              );
          ELSE
            expected_privilege :=
              (
                privilege_name = 'SELECT'
                AND (
                  object_name = ANY(sync_projection_table_names)
                  OR object_name = ANY(sync_support_select_table_names)
                )
              )
              OR (
                privilege_name = 'INSERT'
                AND (object_name = ANY(sync_projection_table_names) OR object_name = 'AuditLog')
              )
              OR (
                privilege_name = 'UPDATE'
                AND (
                  object_name = ANY(sync_projection_table_names)
                  OR (
                    object_name = 'StoreLocation'
                    AND column_record.column_name = ANY(ARRAY['squareLocationId', 'updatedAt'])
                  )
                )
              );
          END IF;

          actual_privilege := has_column_privilege(
            role_name,
            object_oid,
            column_record.column_name,
            privilege_name
          );
          IF actual_privilege IS DISTINCT FROM expected_privilege THEN
            RAISE EXCEPTION
              'Unexpected % privilege for role % on public.%.% (expected %, got %).',
              privilege_name,
              role_name,
              object_name,
              column_record.column_name,
              expected_privilege,
              actual_privilege;
          END IF;
        END LOOP;

        FOREACH privilege_name IN ARRAY column_grant_option_names LOOP
          IF has_column_privilege(
            role_name,
            object_oid,
            column_record.column_name,
            privilege_name
          ) THEN
            RAISE EXCEPTION
              'Role % has delegated % on public.%.%.',
              role_name,
              privilege_name,
              object_name,
              column_record.column_name;
          END IF;
        END LOOP;
      END LOOP;

      FOREACH privilege_name IN ARRAY table_only_privilege_names LOOP
        IF has_table_privilege(role_name, object_oid, privilege_name) THEN
          RAISE EXCEPTION 'Unexpected % privilege for role % on public.%.', privilege_name, role_name, object_name;
        END IF;
      END LOOP;
      FOREACH privilege_name IN ARRAY table_only_grant_option_names LOOP
        IF has_table_privilege(role_name, object_oid, privilege_name) THEN
          RAISE EXCEPTION 'Role % has delegated % on public.%.', role_name, privilege_name, object_name;
        END IF;
      END LOOP;
    END LOOP;

    FOREACH role_name IN ARRAY existing_data_api_role_names LOOP
      FOR column_record IN
        SELECT attribute.attname AS column_name
        FROM pg_attribute attribute
        WHERE attribute.attrelid = object_oid
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
        ORDER BY attribute.attnum
      LOOP
        FOREACH privilege_name IN ARRAY column_privilege_names LOOP
          IF has_column_privilege(role_name, object_oid, column_record.column_name, privilege_name) THEN
            RAISE EXCEPTION
              'Supabase Data API role % has % on public.%.%.',
              role_name,
              privilege_name,
              object_name,
              column_record.column_name;
          END IF;
        END LOOP;
        FOREACH privilege_name IN ARRAY column_grant_option_names LOOP
          IF has_column_privilege(role_name, object_oid, column_record.column_name, privilege_name) THEN
            RAISE EXCEPTION
              'Supabase Data API role % has delegated % on public.%.%.',
              role_name,
              privilege_name,
              object_name,
              column_record.column_name;
          END IF;
        END LOOP;
      END LOOP;
      FOREACH privilege_name IN ARRAY table_only_privilege_names LOOP
        IF has_table_privilege(role_name, object_oid, privilege_name) THEN
          RAISE EXCEPTION 'Supabase Data API role % has % on public.%.',
            role_name, privilege_name, object_name;
        END IF;
      END LOOP;
      FOREACH privilege_name IN ARRAY table_only_grant_option_names LOOP
        IF has_table_privilege(role_name, object_oid, privilege_name) THEN
          RAISE EXCEPTION 'Supabase Data API role % has delegated % on public.%.',
            role_name, privilege_name, object_name;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  FOREACH object_name IN ARRAY prisma_type_names LOOP
    object_oid := to_regtype(format('%I.%I', 'public', object_name));
    IF object_oid IS NULL THEN
      RAISE EXCEPTION 'Required migrated type public.% is missing.', object_name;
    END IF;

    SELECT type_entry.typowner, type_entry.typacl
    INTO type_record
    FROM pg_type type_entry
    WHERE type_entry.oid = object_oid;

    IF type_record.typowner <> migrator_oid THEN
      RAISE EXCEPTION 'Type public.% is not owned by storefront_migrator.', object_name;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM aclexplode(COALESCE(type_record.typacl, acldefault('T', type_record.typowner))) acl
      WHERE acl.grantee = 0
    )
    INTO public_privilege_exists;
    IF public_privilege_exists THEN
      RAISE EXCEPTION 'Type public.% grants privileges to PUBLIC.', object_name;
    END IF;

    actual_privilege := has_type_privilege('storefront_runtime', object_oid, 'USAGE');
    expected_privilege := object_name = 'CmsPublishStatus';
    IF actual_privilege IS DISTINCT FROM expected_privilege THEN
      RAISE EXCEPTION 'Unexpected runtime USAGE privilege on type public.%.', object_name;
    END IF;
    IF has_type_privilege(
      'storefront_runtime',
      object_oid,
      'USAGE WITH GRANT OPTION'
    ) THEN
      RAISE EXCEPTION 'Runtime has delegated USAGE on type public.%.', object_name;
    END IF;
    IF has_type_privilege('storefront_sync', object_oid, 'USAGE') THEN
      RAISE EXCEPTION 'Unexpected sync USAGE privilege on type public.%.', object_name;
    END IF;
    IF has_type_privilege('storefront_sync', object_oid, 'USAGE WITH GRANT OPTION') THEN
      RAISE EXCEPTION 'Sync has delegated USAGE on type public.%.', object_name;
    END IF;
    FOREACH role_name IN ARRAY existing_data_api_role_names LOOP
      IF has_type_privilege(role_name, object_oid, 'USAGE') THEN
        RAISE EXCEPTION 'Supabase Data API role % has USAGE on type public.%.', role_name, object_name;
      END IF;
      IF has_type_privilege(role_name, object_oid, 'USAGE WITH GRANT OPTION') THEN
        RAISE EXCEPTION
          'Supabase Data API role % has delegated USAGE on type public.%.',
          role_name,
          object_name;
      END IF;
    END LOOP;
  END LOOP;

  FOR relation_record IN
    SELECT relation.oid, relation.relname
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind = 'S'
      AND relation.relowner = migrator_oid
  LOOP
    FOREACH role_name IN ARRAY target_role_names LOOP
      FOREACH privilege_name IN ARRAY ARRAY['USAGE', 'SELECT', 'UPDATE'] LOOP
        IF has_sequence_privilege(role_name, relation_record.oid, privilege_name) THEN
          RAISE EXCEPTION 'Unexpected % privilege for role % on sequence public.%.',
            privilege_name, role_name, relation_record.relname;
        END IF;
      END LOOP;
      FOREACH privilege_name IN ARRAY ARRAY[
        'USAGE WITH GRANT OPTION',
        'SELECT WITH GRANT OPTION',
        'UPDATE WITH GRANT OPTION'
      ] LOOP
        IF has_sequence_privilege(role_name, relation_record.oid, privilege_name) THEN
          RAISE EXCEPTION 'Role % has delegated % on sequence public.%.',
            role_name, privilege_name, relation_record.relname;
        END IF;
      END LOOP;
    END LOOP;
    FOREACH role_name IN ARRAY existing_data_api_role_names LOOP
      FOREACH privilege_name IN ARRAY ARRAY['USAGE', 'SELECT', 'UPDATE'] LOOP
        IF has_sequence_privilege(role_name, relation_record.oid, privilege_name) THEN
          RAISE EXCEPTION 'Supabase Data API role % has % on sequence public.%.',
            role_name, privilege_name, relation_record.relname;
        END IF;
      END LOOP;
      FOREACH privilege_name IN ARRAY ARRAY[
        'USAGE WITH GRANT OPTION',
        'SELECT WITH GRANT OPTION',
        'UPDATE WITH GRANT OPTION'
      ] LOOP
        IF has_sequence_privilege(role_name, relation_record.oid, privilege_name) THEN
          RAISE EXCEPTION 'Supabase Data API role % has delegated % on sequence public.%.',
            role_name, privilege_name, relation_record.relname;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  FOR routine_record IN
    SELECT procedure_entry.oid, procedure_entry.proname
    FROM pg_proc procedure_entry
    JOIN pg_namespace namespace ON namespace.oid = procedure_entry.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure_entry.proowner = migrator_oid
  LOOP
    FOREACH role_name IN ARRAY target_role_names LOOP
      IF has_function_privilege(role_name, routine_record.oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'Unexpected EXECUTE privilege for role % on routine public.%.',
          role_name, routine_record.proname;
      END IF;
      IF has_function_privilege(
        role_name,
        routine_record.oid,
        'EXECUTE WITH GRANT OPTION'
      ) THEN
        RAISE EXCEPTION 'Role % has delegated EXECUTE on routine public.%.',
          role_name, routine_record.proname;
      END IF;
    END LOOP;
    FOREACH role_name IN ARRAY existing_data_api_role_names LOOP
      IF has_function_privilege(role_name, routine_record.oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'Supabase Data API role % has EXECUTE on routine public.%.',
          role_name, routine_record.proname;
      END IF;
      IF has_function_privilege(
        role_name,
        routine_record.oid,
        'EXECUTE WITH GRANT OPTION'
      ) THEN
        RAISE EXCEPTION 'Supabase Data API role % has delegated EXECUTE on routine public.%.',
          role_name, routine_record.proname;
      END IF;
    END LOOP;
  END LOOP;

  FOREACH default_object_type IN ARRAY ARRAY['r'::"char", 'S'::"char", 'f'::"char", 'T'::"char"] LOOP
    default_acl := NULL;
    SELECT default_entry.defaclacl
    INTO default_acl
    FROM pg_default_acl default_entry
    WHERE default_entry.defaclrole = migrator_oid
      AND default_entry.defaclnamespace = 0
      AND default_entry.defaclobjtype = default_object_type;

    default_acl := COALESCE(default_acl, acldefault(default_object_type, migrator_oid));
    IF EXISTS (
      SELECT 1
      FROM aclexplode(default_acl) acl
      WHERE acl.grantee = 0
        OR acl.grantee = ANY(restricted_role_oids)
        OR acl.grantee = ANY(data_api_role_oids)
        OR (
          acl.grantee <> 0
          AND EXISTS (
            SELECT 1
            FROM unnest(restricted_role_oids || data_api_role_oids) AS effective_role(role_oid)
            WHERE pg_has_role(effective_role.role_oid, acl.grantee, 'USAGE')
          )
        )
    ) THEN
      RAISE EXCEPTION
        'storefront_migrator default ACL for object type % reaches PUBLIC or a restricted/API role.',
        default_object_type;
    END IF;

    -- A schema-local GRANT is additive to the global defaults, so reject any
    -- local entry that reopens public for the restricted application roles.
    default_acl := NULL;
    SELECT default_entry.defaclacl
    INTO default_acl
    FROM pg_default_acl default_entry
    WHERE default_entry.defaclrole = migrator_oid
      AND default_entry.defaclnamespace = to_regnamespace('public')
      AND default_entry.defaclobjtype = default_object_type;
    IF default_acl IS NOT NULL AND EXISTS (
      SELECT 1
      FROM aclexplode(default_acl) acl
      WHERE acl.grantee = 0
        OR acl.grantee = ANY(restricted_role_oids)
        OR acl.grantee = ANY(data_api_role_oids)
        OR (
          acl.grantee <> 0
          AND EXISTS (
            SELECT 1
            FROM unnest(restricted_role_oids || data_api_role_oids) AS effective_role(role_oid)
            WHERE pg_has_role(effective_role.role_oid, acl.grantee, 'USAGE')
          )
        )
    ) THEN
      RAISE EXCEPTION
        'storefront_migrator public-schema ACL for object type % reaches PUBLIC or a restricted/API role.',
        default_object_type;
    END IF;
  END LOOP;
END
$verify_storefront_roles$;

ROLLBACK;

SELECT 'storefront_role_acl_verified' AS result;
