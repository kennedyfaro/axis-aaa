import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Request } from "express";
import type { Permission } from "./permissions";

export const IS_PUBLIC = "aaa:isPublic";
export const REQUIRED_PERMISSIONS = "aaa:permissions";

export const Public = () => SetMetadata(IS_PUBLIC, true);
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);

export interface AdminPrincipal {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: Permission[];
  userId?: string;
}

export const CurrentAdmin = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<Request & { admin?: AdminPrincipal }>();
  return request.admin;
});
