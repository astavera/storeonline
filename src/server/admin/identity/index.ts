export {
  adminPermissions,
  externalAuthorityBoundaries,
  forbiddenRoleCapabilities,
  isAdminPermission,
  type AdminPermission
} from "@/server/admin/identity/admin-permissions";
export {
  adminRoles,
  authorizeAdminAccess,
  canAssignAdminRole,
  isAdminRole,
  permissionsForRole,
  roleHasPermission,
  roleSessionCapabilities,
  type AdminAccessDecision,
  type AdminAccessRequest,
  type AdminIdentityStatus,
  type AdminLocationScope,
  type AdminPrincipal,
  type AdminResourceScope,
  type AdminRole
} from "@/server/admin/identity/admin-rbac";
export {
  AdminMfaConfigurationError,
  AdminMfaDecryptionError,
  decryptMfaSecret,
  encryptMfaSecret,
  generateMfaSecret,
  generateRecoveryCodes,
  generateTotpCode,
  hashRecoveryCode,
  verifyRecoveryCode,
  verifyRecoveryCodeAndCreateMfaProof,
  verifyTotpAndCreateMfaProof,
  verifyTotpCode,
  type AdminMfaProof,
  type TotpOptions
} from "@/server/admin/identity/admin-mfa";
export {
  AdminSessionStoreError,
  PrismaAdminSessionStore,
  createAdminSession,
  hashAdminSessionToken,
  resolveAdminSessionToken,
  revokeAdminSessionToken,
  revokeAllAdminSessions,
  type CreateAdminSessionInput,
  type CreatedAdminSession,
  type ResolvedAdminSession
} from "@/server/admin/identity/admin-session-store";
